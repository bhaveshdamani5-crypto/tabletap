# TableTap: setup from zero, and what is still not built

Follow in order. Items marked **(you)** need your own accounts, money, or a decision. Nothing here has been run against a live Supabase project yet, so expect to fix small things on first contact and tell me what breaks.

## Part A. Run it on your laptop with no accounts (2 minutes)
1. Install Node.js 22 or newer.
2. `cd apps/web && npm install && npm run dev`
3. Open `http://localhost:3000/brew-moon/t/devtoken-brew-01`. You get the full guest menu and cart.
4. "Pay" will say Supabase is not connected. That is expected. Continue with Part B.
5. On Windows, run `run.bat` from the project root to start the app and open the guest menu, kitchen sign-in, and owner dashboard. With Supabase configured, the guest tab uses an active table's real QR URL.

## Part B. Connect the database (Supabase)
1. **(you)** Create a free account at supabase.com. Create a project, region **Mumbai (ap-south-1)** if shown. Save the database password.
2. In the project dashboard, open **Project Settings, API**. Copy three values: the Project URL, the anon (public) key, and the service_role (secret) key. The secret key bypasses all security. Never put it in code, chat or GitHub.
3. In `apps/web`, run `cp .env.example .env.local` and fill the three values. Keep `DEV_SIMULATE_PAYMENT=true` and `NEXT_PUBLIC_DEV_SIMULATE_PAYMENT=true` for now. If the project has multiple cafes and `run.bat` should open a cafe other than `brew-moon`, set `TABLETAP_RESTAURANT_SLUG` to its slug.
4. From the repo root, install the Supabase CLI and push the schema:
   ```
   npx supabase init            # answer "no" to editor settings; keep the existing migrations folder
   npx supabase login
   npx supabase link --project-ref <your-project-ref>     # the ref is in your dashboard URL
   npx supabase db push         # applies the 5 migrations in supabase/migrations
   ```
5. Load the demo cafe and menu: dashboard, **SQL Editor**, paste all of `supabase/seed.sql`, Run. **Do this only on a throwaway dev project.** Its table tokens are guessable.
6. Dashboard, **Authentication, Sign In / Providers**: switch OFF "Allow new users to sign up". Only you create staff.
7. Dashboard, **Database, Publications**: confirm the `orders` table is under `supabase_realtime` (the migration adds it).
8. Create a kitchen login:
   ```
   cd apps/web
   node --env-file=.env.local scripts/create-staff.mjs kitchen@example.com 'a-long-password' kitchen brew-moon
   node --env-file=.env.local scripts/create-staff.mjs you@example.com 'another-long-password' owner brew-moon
   ```
9. Restart `npm run dev`, then test the whole loop:
   - Phone or tab 1: `/brew-moon/t/devtoken-brew-01`, add items, **Place test order**. You land on the order status page.
   - Tab 2: `/login` as the kitchen user, then press **Start shift**. The order appears with a sound. Press Accept, Start preparing, Mark ready, Mark served.
   - Tab 1 updates its status every 3 seconds.
   - In the kitchen, open **Out of stock**, mark an item sold out, reload the guest menu: it shows Sold out.
10. Optional: confirm isolation yourself. `bash supabase/tests/run-local.sh` runs the 41 security tests on any local Postgres.

## Part C. Real QR codes for real tables
For a real cafe (not the seed demo), create its rows first: a restaurant, tables and menu. The owner dashboard edits menu, tables and settings, but **creating the cafe itself** still needs SQL or the seed file (self-serve signup is Step 8). Then:
```
cd apps/web
node --env-file=.env.local scripts/make-qr.mjs <restaurant-slug> https://your-domain.com
```
This writes one PNG per table into `apps/web/qr/`. Print them on table stands. Test each by scanning it with a phone.

The staff dashboard only prints QR codes for active tables, and each code resolves to that table's own customer menu. For local phone testing on Windows, run `run.bat`, keep the phone and computer on the same Wi-Fi, and allow the app through Windows Firewall on a private network if prompted. Reprint codes if the app's base URL changes.

## Part D. Put it online
1. **(you)** Create a GitHub repo and push this folder. The CI workflow runs tests automatically.
2. **(you)** Create a Vercel account, import the repo, set **Root Directory** to `apps/web`, and add the env vars from `.env.local` (set `NEXT_PUBLIC_APP_URL` to your Vercel/real domain). Do not set the `DEV_SIMULATE_PAYMENT` variables in production; the code ignores them there anyway.
3. **(you)** Buy a domain if you want a branded URL, then connect it in Vercel.
4. **(you)** Create a Sentry project and add `@sentry/nextjs` with your DSN. Add an UptimeRobot monitor on `/api/health`.
5. Use a **separate Supabase project for production**, with no seed data.

## Part E. Test payments with Razorpay
The Razorpay test-mode integration, webhook, and refund setup is documented in [docs/PAYMENTS.md](./PAYMENTS.md). Use TEST keys only. Before accepting live payments for multiple cafes, get written guidance from Razorpay about marketplace/platform onboarding and settlement.

## What is built and tested (here, without live accounts)
| Area | State |
|---|---|
| Database schema, security rules, seed (158 items), 41 isolation tests | Built, passes on real Postgres |
| Guest menu, options, cart, tax totals | Built, checked in a phone-sized browser |
| Server-side price check and order state machine | Built, 19 unit tests |
| Order creation, Razorpay Checkout, signature verification, webhooks, refunds | Built and unit-tested; **not run against Razorpay's servers** |
| Staff login, kitchen board (sound, realtime plus polling, disconnect banner, reject, out-of-stock) | Built, compiles; **not run against live Supabase** |
| Owner dashboard (overview, menu, tables + printable QR, settings) | Built, reports math unit-tested; **not run against live Supabase** (see docs/ADMIN.md) |
| QR generator, staff creation script | Built, **not run against live Supabase** |
| CI workflow | Built, untested until pushed to GitHub |

## What is NOT built yet
| Missing | Why / what it needs |
|---|---|
| Payment hardening: expiry, late-capture refunds, reconciliation, refund retries, per-cafe accounts | See docs/PAYMENTS.md; not built yet |
| Owner dashboard extras: editing size/type options and add-ons, drag-to-reorder, staff invites, CSV export, date ranges | Buildable next |
| Receipts by WhatsApp or email, daily owner summary, alerts to you (Step 7) | Needs WhatsApp Business or email provider accounts |
| Background job worker and nightly jobs | Needs a decision on Vercel Cron vs Supabase scheduling; buildable next |
| Self-serve signup, onboarding checklist, trial limits (Step 8) | Buildable next |
| Subscription billing for cafes (Step 8) | Needs a gateway with recurring payments, and the Step 5 answer |
| Super-admin platform panel (Step 8) | Buildable next |
| Terms, privacy policy, merchant agreement | Needs a lawyer or a reviewed template |
| GST invoice format | Needs your accountant's answer (see `content.md` section 14) |
| End-to-end browser tests, load tests, security review (Step 9) | Best done once payments exist |
| Pilot with a real cafe (Step 10) | Needs everything above plus real people |
| Sentry error tracking | Needs your Sentry account |

## Known rough edges
- Placing an order is not one atomic database transaction. If saving items fails, the order is deleted again; a cleaner version would be a single database function.
- The cart is lost on page refresh.
- An invalid QR shows a friendly message but with HTTP status 200.
- Only the kitchen sees orders; there is no separate waiter screen.
