'use server';
import { createOrder } from '@/lib/orders/create-order';
import { transitionOrder } from '@/lib/orders/transition';
import { createAdminClient } from '@/lib/supabase/admin';
import { isSupabaseConfigured } from '@/lib/env';
import { createRazorpayOrder, razorpayConfigured, razorpayKeyId } from '@/lib/payments/razorpay';
import { verifyCheckoutSignature } from '@/lib/payments/signatures';
import { confirmPayment } from '@/lib/payments/confirm';

/** Dev-only fake payment. Hard-blocked in production. */
const simulateAllowed = () => process.env.DEV_SIMULATE_PAYMENT === 'true' && process.env.NODE_ENV !== 'production';

type Placed = { ok: true; orderId: string; accessToken: string; checkout?: { keyId: string; orderId: string; amountPaise: number } } | { ok: false; error: string };

export async function placeOrder(input: unknown): Promise<Placed> {
  if (!isSupabaseConfigured()) return { ok: false, error: 'Connect Supabase to place orders (see docs/SETUP.md).' };
  const simulate = simulateAllowed();
  if (!simulate && !razorpayConfigured()) return { ok: false, error: 'Online payment is not set up yet.' };
  const res = await createOrder(input);
  if (!res.ok) return res;
  const db = createAdminClient();

  if (simulate) {
    const t = await transitionOrder(db, { orderId: res.orderId, restaurantId: res.restaurantId, to: 'paid', actor: 'dev-simulator' });
    return t.ok ? { ok: true, orderId: res.orderId, accessToken: res.accessToken } : { ok: false, error: t.error };
  }
  // Reuse an open Razorpay order for a repeated submit; otherwise create a fresh one.
  const { data: open } = await db.from('payments').select('provider_order_id,amount_paise').eq('order_id', res.orderId).eq('status', 'created').maybeSingle();
  let rpOrderId = open?.provider_order_id as string | undefined;
  if (!rpOrderId) {
    try {
      rpOrderId = (await createRazorpayOrder(res.totalPaise, res.orderId)).id;
      await db.from('payments').insert({ restaurant_id: res.restaurantId, order_id: res.orderId, provider: 'razorpay', provider_order_id: rpOrderId, amount_paise: res.totalPaise });
    } catch { return { ok: false, error: 'Could not start the payment. Please try again.' }; }
  }
  return { ok: true, orderId: res.orderId, accessToken: res.accessToken, checkout: { keyId: razorpayKeyId(), orderId: rpOrderId, amountPaise: res.totalPaise } };
}

/** Called from the browser right after Checkout succeeds. The signature check proves it is genuine;
 *  the webhook is the backup if the guest closes the page first. */
export async function verifyPayment(i: { orderId: string; accessToken: string; razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) {
  const secret = process.env.RAZORPAY_KEY_SECRET;
  if (!secret) return { ok: false as const, error: 'Not configured' };
  const db = createAdminClient();
  const { data: o } = await db.from('orders').select('id').eq('id', i.orderId).eq('access_token', i.accessToken).maybeSingle();
  if (!o) return { ok: false as const, error: 'Order not found' };
  const { data: p } = await db.from('payments').select('id').eq('order_id', o.id).eq('provider_order_id', i.razorpay_order_id).maybeSingle();
  if (!p || !verifyCheckoutSignature(i.razorpay_order_id, i.razorpay_payment_id, i.razorpay_signature, secret)) return { ok: false as const, error: 'Payment could not be verified' };
  return confirmPayment(db, { providerOrderId: i.razorpay_order_id, providerPaymentId: i.razorpay_payment_id });
}
