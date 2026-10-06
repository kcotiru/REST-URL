# Setup

Prerequisites, quick start, environment, Stripe test mode, tests and CI. ← [README](../README.md)

## Prerequisites

Node 20+, Docker, a Supabase project (Auth + Postgres); for billing, the Stripe CLI.

## Quick start

```bash
docker compose up -d     # Redis 7 :6379 (app + tests); Postgres 16 :54329 (tests/bench only)
cp backend/.env.example backend/.env && cp frontend/.env.example frontend/.env   # then fill in
for f in backend/db/migrations/*.sql; do psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$f"; done  # 001-007
(cd backend && npm install && npm run dev)     # API :3000
(cd backend && npm run worker)                 # click worker (needs Redis; run one)
(cd frontend && npm install && npm run dev)    # app :5173, /api proxied to :3000
# production: npm run build && npm start / npm run start:worker in backend/; serve frontend/dist, proxy /api
```

## Environment

| Variable | Used by | Example / default |
|---|---|---|
| `DATABASE_URL` | backend | `postgresql://postgres:<pw>@db.<project>.supabase.co:5432/postgres` |
| `SUPABASE_URL` | backend | `https://<project>.supabase.co` (JWKS source) |
| `STRIPE_SECRET_KEY` | backend | `sk_test_...` (refuses to start with a live key) |
| `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_PRO` | backend | `whsec_...` from `stripe listen`, `price_...` |
| `PORT`, `NODE_ENV`, `SHORT_CODE_LENGTH` | backend | `3000`, `development` (Postgres SSL in `production`), `7` |
| `REDIS_URL` | backend, bench | `redis://localhost:6379` |
| `FRONTEND_ORIGIN` | backend | `http://localhost:5173` (CORS, Stripe return URLs) |
| `REDIRECT_LIMIT_PER_MIN` | backend | `600` per client IP (`GET /:code`, `/api/v1/plans`) |
| `TRUST_PROXY` | backend | unset; reverse-proxy hop count, needed for real client IPs |
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` | frontend | project URL; key is safe in the browser (RLS) |
| `VITE_SHORT_BASE_URL` | frontend | `http://localhost:3000` (serves short links) |
| `TEST_DATABASE_URL`, `TEST_REDIS_URL` | tests | see Tests & CI below |
| `BENCH_URL`, `BENCH_SECONDS`, `BENCH_WARMUP_SECONDS`, `BENCH_CONNECTIONS`, `BENCH_ROUNDS` | bench | see [`backend/bench/redirect.js`](../backend/bench/redirect.js) |

## Stripe (test mode)

```bash
stripe products create --name "REST-URL Pro"
stripe prices create --product <prod_id> --unit-amount 900 --currency usd -d "recurring[interval]=month"  # -> STRIPE_PRICE_PRO
stripe listen --events checkout.session.completed,customer.subscription.updated,customer.subscription.deleted,invoice.payment_failed \
  --forward-to localhost:3000/api/v1/billing/webhook   # -> STRIPE_WEBHOOK_SECRET
stripe trigger checkout.session.completed                          # or pay with card 4242 4242 4242 4242
```

- `--events` is required: Stripe CLI 1.53 refuses to run `listen` without it.
- "Manage billing" needs the customer portal saved once at https://dashboard.stripe.com/test/settings/billing/portal (test mode).
- The webhook is the only source of truth for plan state; the checkout redirect changes nothing.

## Tests & CI

```bash
(cd backend && TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:54329/urlshortener_test \
  TEST_REDIS_URL=redis://localhost:6379/15 npm test && npm run typecheck)   # flushes that Redis DB
(cd frontend && npx tsc --noEmit && npm run build)
```

- Vitest + supertest (`backend/test/api.test.ts`): auth, scoping, rate limiter, click pipeline, analytics, billing, webhook idempotency, RLS; Stripe is mocked.
- GitHub Actions runs both jobs on every push and PR; with `CI` set, missing service env vars fail instead of skipping.
