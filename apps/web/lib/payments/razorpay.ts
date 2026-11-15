import 'server-only';

const API = 'https://api.razorpay.com/v1';
export const razorpayConfigured = () => Boolean(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET);
export const razorpayKeyId = () => process.env.RAZORPAY_KEY_ID ?? '';

async function post(path: string, body: unknown) {
  const id = process.env.RAZORPAY_KEY_ID, secret = process.env.RAZORPAY_KEY_SECRET;
  if (!id || !secret) throw new Error('Razorpay keys are not set');
  const res = await fetch(`${API}${path}`, {
    method: 'POST', cache: 'no-store',
    headers: { 'content-type': 'application/json', authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString('base64')}` },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error?.description ?? `Razorpay error ${res.status}`);
  return json as { id: string };
}

/** Amount is integer paise. Orders are immutable at Razorpay, so make a fresh one per payment attempt. */
export const createRazorpayOrder = (amountPaise: number, receipt: string) => post('/orders', { amount: amountPaise, currency: 'INR', receipt });
export const refundRazorpayPayment = (paymentId: string, amountPaise: number, reason: string) =>
  post(`/payments/${paymentId}/refund`, { amount: amountPaise, notes: { reason } });
