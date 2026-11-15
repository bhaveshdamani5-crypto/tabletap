import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { transitionOrder } from '@/lib/orders/transition';
import { refundRazorpayPayment } from './razorpay';

/** Refunds the captured payment of an order that is in refund_pending, then marks it refunded. */
export async function processRefund(db: SupabaseClient, orderId: string, restaurantId: string, reason: string) {
  const { data: pay } = await db.from('payments').select('id,provider_payment_id,amount_paise').eq('order_id', orderId).eq('restaurant_id', restaurantId).eq('status', 'captured').maybeSingle();
  if (!pay?.provider_payment_id) {
    // Dev fake-payment orders have no real payment to refund.
    if (process.env.DEV_SIMULATE_PAYMENT === 'true' && process.env.NODE_ENV !== 'production')
      return transitionOrder(db, { orderId, restaurantId, to: 'refunded', actor: 'system', reason: 'dev simulated refund' });
    return { ok: false as const, error: 'No captured payment found to refund.' };
  }
  let refundId: string;
  try { refundId = (await refundRazorpayPayment(pay.provider_payment_id, pay.amount_paise, reason)).id; }
  catch (e) {
    await db.from('refunds').insert({ restaurant_id: restaurantId, payment_id: pay.id, amount_paise: pay.amount_paise, reason, status: 'failed' });
    return { ok: false as const, error: `Refund failed: ${(e as Error).message}` };
  }
  await db.from('refunds').insert({ restaurant_id: restaurantId, payment_id: pay.id, amount_paise: pay.amount_paise, reason, provider_refund_id: refundId, status: 'processed' });
  await db.from('payments').update({ status: 'refunded' }).eq('id', pay.id);
  return transitionOrder(db, { orderId, restaurantId, to: 'refunded', actor: 'system', reason });
}
