import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { checkoutSignature, verifyCheckoutSignature, verifyWebhookSignature } from '@/lib/payments/signatures';

describe('checkout signature', () => {
  const sig = createHmac('sha256', 'secret').update('order_1|pay_1').digest('hex');
  it('matches the documented order_id|payment_id HMAC', () => expect(checkoutSignature('order_1', 'pay_1', 'secret')).toBe(sig));
  it('accepts a valid signature', () => expect(verifyCheckoutSignature('order_1', 'pay_1', sig, 'secret')).toBe(true));
  it('rejects a swapped payment id, wrong secret, or garbage', () => {
    expect(verifyCheckoutSignature('order_1', 'pay_2', sig, 'secret')).toBe(false);
    expect(verifyCheckoutSignature('order_1', 'pay_1', sig, 'other')).toBe(false);
    expect(verifyCheckoutSignature('order_1', 'pay_1', 'short', 'secret')).toBe(false);
    expect(verifyCheckoutSignature('order_1', 'pay_1', '', 'secret')).toBe(false);
  });
});
describe('webhook signature', () => {
  const body = '{"event":"payment.captured","payload":{}}';
  const sig = createHmac('sha256', 'whsec').update(body).digest('hex');
  it('accepts the exact raw body', () => expect(verifyWebhookSignature(body, sig, 'whsec')).toBe(true));
  it('rejects any change to the body, even whitespace', () => {
    expect(verifyWebhookSignature(body + ' ', sig, 'whsec')).toBe(false);
    expect(verifyWebhookSignature(JSON.stringify(JSON.parse(body), null, 2), sig, 'whsec')).toBe(false);
  });
});
