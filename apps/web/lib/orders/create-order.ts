import 'server-only';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import { getTableMenu } from '@/lib/menu/get-menu';
import { computeTotals, PricingError, unitPrice } from './pricing';

export const cartSchema = z.object({
  slug: z.string().min(1).max(60),
  token: z.string().min(8).max(64),
  idempotencyKey: z.string().min(8).max(80),
  note: z.string().max(200).optional(),
  lines: z.array(z.object({
    itemId: z.string().uuid(), variantId: z.string().uuid().nullable(),
    optionIds: z.array(z.string().uuid()).max(20), qty: z.number().int().min(1).max(20),
  })).min(1).max(40),
});
export type CreateOrderResult = { ok: true; orderId: string; accessToken: string; restaurantId: string; totalPaise: number } | { ok: false; error: string };

/** Turns a cart into a pending_payment order. Prices come from the DATABASE, never from the client. */
export async function createOrder(raw: unknown): Promise<CreateOrderResult> {
  const parsed = cartSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: 'Your order could not be read. Please try again.' };
  const input = parsed.data;
  const ctx = await getTableMenu(input.slug, input.token);
  if (!ctx) return { ok: false, error: 'This QR code is not valid.' };
  if (!ctx.restaurant.acceptingOrders) return { ok: false, error: 'This cafe is not taking QR orders right now.' };

  const items = new Map(ctx.categories.flatMap((c) => c.items).map((i) => [i.id, i]));
  const priced = [];
  try {
    for (const l of input.lines) {
      const item = items.get(l.itemId);
      if (!item) return { ok: false, error: 'An item in your order is no longer on the menu.' };
      priced.push({ item, l, unit: unitPrice(item, { variantId: l.variantId, optionIds: l.optionIds }) });
    }
  } catch (e) {
    return { ok: false, error: e instanceof PricingError ? e.message : 'Invalid order.' };
  }
  const totals = computeTotals(priced.map((p) => ({ unitPaise: p.unit, qty: p.l.qty })), ctx.restaurant.taxRateBps, ctx.restaurant.pricesIncludeTax);

  const db = createAdminClient();
  const rid = ctx.restaurant.id;
  const { data: existing } = await db.from('orders').select('id,access_token,total_paise').eq('restaurant_id', rid).eq('idempotency_key', input.idempotencyKey).maybeSingle();
  if (existing) return { ok: true, orderId: existing.id, accessToken: existing.access_token, restaurantId: rid, totalPaise: existing.total_paise };

  const { data: num, error: numErr } = await db.rpc('next_order_number', { p_restaurant_id: rid });
  const n = Array.isArray(num) ? num[0] : num;
  if (numErr || !n) return { ok: false, error: 'Could not start your order. Please try again.' };

  const { data: order, error } = await db.from('orders').insert({
    restaurant_id: rid, table_id: ctx.table.id, business_date: n.business_date, order_number: n.order_number,
    subtotal_paise: totals.subtotalPaise, tax_paise: totals.taxPaise, total_paise: totals.totalPaise,
    guest_note: input.note ?? null, idempotency_key: input.idempotencyKey,
  }).select('id,access_token').single();
  if (error || !order) return { ok: false, error: 'Could not save your order. Please try again.' };

  const { error: itemsErr } = await db.from('order_items').insert(priced.map(({ item, l, unit }) => ({
    restaurant_id: rid, order_id: order.id, item_id: item.id, name_snapshot: item.name,
    variant_snapshot: item.variants.find((v) => v.id === l.variantId)?.name ?? null,
    modifiers_snapshot: item.groups.flatMap((g) => g.options.filter((o) => l.optionIds.includes(o.id)).map((o) => o.name)),
    unit_price_paise: unit, quantity: l.qty,
  })));
  if (itemsErr) { await db.from('orders').delete().eq('id', order.id); return { ok: false, error: 'Could not save your order. Please try again.' }; }

  await db.from('order_events').insert({ restaurant_id: rid, order_id: order.id, to_status: 'pending_payment', actor: 'guest' });
  return { ok: true, orderId: order.id, accessToken: order.access_token, restaurantId: rid, totalPaise: totals.totalPaise };
}
