# Connecting Razorpay

Built and unit-tested here: order creation, Checkout, signature verification, signed webhook, refunds on reject. **Not yet run against Razorpay's servers** (my environment cannot reach them), so your first test payment is the real test. Send me the exact error if anything fails.

## Before you start: one decision that matters
Your Razorpay account is in **your** name. If a cafe's guests pay through it, the money settles to **you**, not the cafe. For test mode this does not matter. **Before taking any live money for a cafe**, ask Razorpay support or sales (in writing) which product lets a software company take payments on behalf of many merchants (they may call it Route or a platform/partner account), and whether each cafe needs its own verified account. Do not pay cafes out of your own account by hand. Until that is answered, stay in test mode.

## Step 1. Get TEST keys
1. Razorpay Dashboard, switch the toggle to **Test Mode**.
2. **Account & Settings, API Keys, Generate Test Key**. Copy the Key Id and Key Secret now. The secret is shown only once.
3. In `apps/web/.env.local` set:
   ```
   RAZORPAY_KEY_ID=rzp_test_xxxxxxxx
   RAZORPAY_KEY_SECRET=xxxxxxxx
   DEV_SIMULATE_PAYMENT=false
   NEXT_PUBLIC_DEV_SIMULATE_PAYMENT=false
   ```
   Turning the simulator off is required, otherwise the fake payment is used instead.
4. Never paste the secret in chat, GitHub or a screenshot.

## Step 2. Apply the patch and restart
Extract `razorpay-patch.zip` into the project root (overwrite), then `cd apps/web && npm install && npm run dev`.

## Step 3. First test payment (works on localhost)
1. Open `/brew-moon/t/devtoken-brew-01`, add an item, tap **Pay**.
2. The Razorpay window opens. Pay with Razorpay's test details (use the test card and UPI details on Razorpay's "Test payments" documentation page).
3. You land on the order page. Open `/kitchen` signed in as kitchen: the order is there.
4. Check Razorpay Dashboard, Transactions, Test mode: the payment appears.
This works without the webhook because the server verifies Razorpay's signature as soon as Checkout succeeds.

## Step 4. Webhook (needs a public HTTPS address)
Razorpay cannot call `localhost`, and some tunnel domains (for example ngrok.io) are blocked for webhook URLs. So deploy first.
1. Deploy to Vercel (root directory `apps/web`) with all env vars, including the three Razorpay ones.
2. Dashboard (Test Mode), **Account & Settings, Webhooks, Add New Webhook**:
   - URL: `https://YOUR-DOMAIN/api/webhooks/razorpay`
   - Secret: make up a long random string, and put the same value in `RAZORPAY_WEBHOOK_SECRET` on Vercel
   - Events: `payment.captured`, `order.paid`, `payment.failed`
   - Alert email: yours
3. Test it: start a payment, then close the browser tab right after paying. The order should still turn up in `/kitchen`. That proves the webhook works.
4. Razorpay disables a webhook that keeps failing for 24 hours, so watch the alert email.

## Step 5. Test refunds
Place a paid test order, then in `/kitchen` press **Reject**. The test payment is refunded and the order moves to Refunded. Confirm in the Razorpay Dashboard.

## Going live later (not yet)
Needs: the money-flow answer above, Live Mode keys in Vercel only, a live webhook, the nightly reconciliation job, and order expiry (both listed as not built below).

## Still not built for payments
| Missing | Effect today |
|---|---|
| Expiry of unpaid orders (pending_payment older than ~15 min) | They sit in the database harmlessly but are never cleaned up |
| Late-payment safety: money captured after an order was expired or cancelled | Needs an automatic refund; not handled yet |
| Nightly reconciliation against Razorpay | You must compare the Dashboard to orders by hand for now |
| Retry queue for failed refunds | If a refund call fails, the kitchen sees a message and you refund from the Razorpay Dashboard |
| Per-cafe Razorpay accounts | All payments use one set of keys from env vars |
| Partial refunds, receipts by WhatsApp/email | Full refunds only |
