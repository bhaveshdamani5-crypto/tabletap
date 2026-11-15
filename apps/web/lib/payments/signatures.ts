import { createHmac, timingSafeEqual } from 'node:crypto';

const safeEqual = (a: string, b: string) => { const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && timingSafeEqual(x, y); };

/** Razorpay Checkout signature: HMAC-SHA256 of "order_id|payment_id" using the KEY SECRET. */
export const checkoutSignature = (orderId: string, paymentId: string, secret: string) =>
  createHmac('sha256', secret).update(`${orderId}|${paymentId}`).digest('hex');
export const verifyCheckoutSignature = (orderId: string, paymentId: string, sig: string, secret: string) =>
  safeEqual(checkoutSignature(orderId, paymentId, secret), sig);

/** Webhook signature: HMAC-SHA256 of the RAW request body using the WEBHOOK SECRET (never parse the body first). */
export const verifyWebhookSignature = (rawBody: string, sig: string, secret: string) =>
  safeEqual(createHmac('sha256', secret).update(rawBody).digest('hex'), sig);
