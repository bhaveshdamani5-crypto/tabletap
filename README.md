# TableTap

QR table ordering SaaS for cafes. The build plan is in `content.md`; deviations are in `docs/decisions.md`.

## Status
Full step-by-step setup and the list of what is built vs not built: **docs/SETUP.md** (read this first).
- [x] Steps 0 to 2: scaffold, database + security + seed, guest menu and cart
- [x] Step 3: order creation and state machine
- [x] Step 4: staff login and kitchen board (with a dev-only fake payment)
- [x] Step 6 (core): owner dashboard, see docs/ADMIN.md
- [x] Step 5 (core): Razorpay checkout, webhook, refunds, see docs/PAYMENTS.md
- [ ] Steps 7 to 10 and payment hardening: notifications, SaaS billing, hardening, pilot

## Repo layout
```
apps/web/            Next.js app
supabase/migrations/ numbered SQL (source of truth for the schema)
supabase/seed.sql    GENERATED dev data (node supabase/seed/build-seed.mjs)
supabase/seed/       menu.mjs (edit menu here) + build-seed.mjs
supabase/tests/      local stubs + RLS tests + run-local.sh
```

## Run the app
```bash
cd apps/web
cp .env.example .env.local      # fill in after creating Supabase (below)
npm install
npm run dev                     # http://localhost:3000 ; demo menu: /brew-moon/t/devtoken-brew-01
                                # works without Supabase (demo mode). Health: /api/health
npm test && npm run typecheck && npm run lint
```

## Run the database tests (needs a local Postgres; no Supabase needed)
```bash
bash supabase/tests/run-local.sh     # builds a scratch DB, applies migrations + seed, runs 41 checks
```

## Connect a real Supabase project (your actions, needs your accounts)
Local (needs Docker):
```bash
npm i -g supabase                    # or use npx supabase
supabase init                        # creates supabase/config.toml; keep the existing migrations folder
supabase start                       # prints the local URL and keys for .env.local
supabase db reset                    # applies migrations + seed.sql
```
Hosted: create a project (pick an India region if offered), then
`supabase link --project-ref <ref>` and `supabase db push` (migrations only).
**Do not load `seed.sql` into production**: its table tokens are predictable on purpose.

## Still to do for Step 0 (needs your accounts)
- [ ] GitHub repo + push (CI runs automatically)
- [ ] Vercel project, root directory `apps/web`, add the env vars
- [ ] Sentry project and `@sentry/nextjs` setup (needs your DSN)
