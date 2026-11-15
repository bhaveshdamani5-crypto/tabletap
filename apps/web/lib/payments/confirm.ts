import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { transitionOrder } from '@/lib/orders/transition';

/** Marks a Razorpay payment captured and its order paid. Idempotent: the webhook and the browser
 *  verification can both call this for the same payment and the second call is a harmless no-op. */
export async function confirmPayment(db: SupabaseClient, a: { providerOrderId: string; providerPaymentId: string; amountPaise?: number; method?: string | null; raw?: unknown }) {
  const { data: p } = await db.from('payments').select('id,restaurant_id,order_id,amount_paise,status')
    .eq('provider', 'razorpay').eq('provider_order_id', a.providerOrderId).maybeSingle();
  if (!p) return { ok: false as const, error: 'Unknown payment' };
  if (a.amountPaise !== undefined && a.amountPaise !== p.amount_paise) return { ok: false as const, error: 'Amount mismatch' };
  if (p.status !== 'captured') {
    await db.from('payments').update({ status: 'captured', provider_payment_id: a.providerPaymentId, method: a.method ?? null, raw: a.raw ?? null, captured_at: new Date().toISOString() }).eq('id', p.id);
  }
  return transitionOrder(db, { orderId: p.order_id, restaurantId: p.restaurant_id, to: 'paid', actor: 'razorpay' });
}
