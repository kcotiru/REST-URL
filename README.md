# REST URL

A URL shortener with a REST API, per-link click analytics, API keys, and Stripe-backed Free/Pro plans. Express + TypeScript + Postgres (Supabase) + Redis on the backend, React + Vite + Tailwind on the frontend.

```
rest-url/
├── backend/    Express API, click worker, SQL migrations, tests, benchmark
├── frontend/   React app (landing, pricing, dashboard, link analytics, API keys, billing)
└── .github/    CI
```

## Features

- Short links with generated 7-char codes (nanoid, 62-char alphabet) or custom 3-10 char codes; full CRUD, owner-scoped.
- Fast redirects: `GET /:code` is served from a Redis cache, with the click recorded off the request path.
- Click analytics per link: hourly or daily series, top countries, referrers and devices (bots are labeled, IPs are never stored).
- Auth with Supabase (ES256 JWTs verified against the project's JWKS) or long-lived API keys (`ru_live_...`, stored as SHA-256 only, shown once, revocable).
- Plans: Free (50 links/month, 60 API req/min, 30 days of analytics) and Pro (5000 links/month, 600 req/min, 365 days), billed through Stripe Checkout in **test mode only**.
- Sliding-window rate limiting per API key / user / client IP, with `RateLimit-*` headers.
- Redis is optional at runtime: if it is down, requests are never blocked (limits and caching are skipped, clicks are dropped).

## Architecture

```mermaid
flowchart LR
  subgraph Express["Express API"]
    Auth["auth: JWT or API key"] --> RL["rate limiter"] --> Routes["links, keys, billing, plans, redirect"]
    Webhook["POST /api/v1/billing/webhook (signature-verified)"]
  end

  Client["Browser / API client"] --> Auth
  Stripe["Stripe"] -->|"signed event"| Webhook
  SupaAuth["Supabase Auth"] -.->|"issues JWTs"| Client
  SupaAuth -.->|"JWKS, to verify JWTs"| Auth

  Redis[("Redis: redirect cache, rate-limit counters, click buffer clicks:queue and clicks:processing")]
  Worker["Click worker (npm run worker)"]
  PG[("Postgres (Supabase)")]

  RL <--> Redis
  Routes <--> Redis
  Routes --> PG
  Webhook --> PG
  Worker <--> Redis
  Worker --> PG
```

## Setup

### Prerequisites

Node.js 20+, Docker (for local Postgres and Redis), a [Supabase](https://supabase.com) project (Auth + Postgres), and for billing the [Stripe CLI](https://docs.stripe.com/stripe-cli) and a Stripe account in test mode.

### 1. Local services

```bash
docker compose up -d     # Postgres 16 on localhost:54329 (db urlshortener_test), Redis 7 on localhost:6379
```

The compose Postgres is for tests and benchmarks. The app itself uses the `DATABASE_URL` you configure (Supabase).

### 2. Environment

`cp backend/.env.example backend/.env` and `cp frontend/.env.example frontend/.env`, then fill in the values.

Backend (`backend/.env`):

| Variable | Default | Notes |
|---|---|---|
| `DATABASE_URL` | required | `postgresql://postgres:<password>@db.<project>.supabase.co:5432/postgres`. SSL is enabled when `NODE_ENV=production`. |
| `SUPABASE_URL` | required | `https://<project>.supabase.co`; the JWKS is fetched from `/auth/v1/.well-known/jwks.json`. |
| `STRIPE_SECRET_KEY` | required | `sk_test_...` or `rk_test_...`. The server refuses to start with a live key. |
| `STRIPE_WEBHOOK_SECRET` | required | `whsec_...` printed by `stripe listen`. |
| `STRIPE_PRICE_PRO` | required | `price_...` of the Pro subscription price. |
| `PORT` | `3000` | |
| `NODE_ENV` | `development` | |
| `REDIS_URL` | `redis://localhost:6379` | |
| `FRONTEND_ORIGIN` | `http://localhost:5173` | CORS origin, and the base of the Stripe success/cancel and upgrade URLs. |
| `REDIRECT_LIMIT_PER_MIN` | `600` | Per client IP, for `GET /:code` and `GET /api/v1/plans`. |
| `TRUST_PROXY` | unset | Number of reverse-proxy hops. Without it every client behind a proxy shares one redirect rate-limit bucket. |
| `SHORT_CODE_LENGTH` | `7` | Length of generated codes. |

Frontend (`frontend/.env`):

| Variable | Default | Notes |
|---|---|---|
| `VITE_SUPABASE_URL` | required | Same project as the backend. |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | required | Safe to expose in the browser (that is what RLS is for, see below). |
| `VITE_SHORT_BASE_URL` | `http://localhost:3000` | Origin that serves short links (the backend's `GET /:code`). |

Tests and benchmark only: `TEST_DATABASE_URL`, `TEST_REDIS_URL` (see Testing), `BENCH_URL`, `BENCH_SECONDS`, `BENCH_WARMUP_SECONDS`, `BENCH_CONNECTIONS`, `BENCH_ROUNDS`, `REDIS_URL` (see `backend/bench/redirect.js`).

### 3. Migrations

Run in order against your Supabase database (they are idempotent, and 002+ reference Supabase's `auth.users`):

```bash
for f in 001_init 002_url_owner 003_api_keys 004_clicks 005_billing 006_enable_rls; do
  psql "$DATABASE_URL" -f backend/db/migrations/$f.sql
done
```

| File | Adds |
|---|---|
| `001_init.sql` | `urls` |
| `002_url_owner.sql` | `urls."ownerId"` (pre-existing links stay as read-only legacy rows: they still redirect) |
| `003_api_keys.sql` | `api_keys` (SHA-256 hashes only) |
| `004_clicks.sql` | `clicks` (raw, 30 days) and `clicks_daily` (permanent rollup) |
| `005_billing.sql` | `subscriptions` and `stripe_events` |
| `006_enable_rls.sql` | row level security on every table (see Design notes) |

### 4. Run

```bash
cd backend  && npm install && npm run dev       # API on :3000
cd backend  && npm run worker                   # click worker (separate process; needs Redis)
cd frontend && npm install && npm run dev       # app on :5173, /api proxied to :3000
```

Production: `npm run build && npm start` and `npm run start:worker` in `backend/`; `npm run build` in `frontend/` and serve `dist/` as a static site, proxying `/api` to the backend (on Vercel, a rewrite from `/api/:path*` to the backend URL). Run a single worker.

### Stripe CLI test-mode setup

```bash
stripe login
stripe products create --name "REST-URL Pro"
stripe prices create --product <prod_id> --unit-amount 900 --currency usd -d "recurring[interval]=month"
# put the returned price id in STRIPE_PRICE_PRO
stripe listen --forward-to localhost:3000/api/v1/billing/webhook
# copy the whsec_... it prints into STRIPE_WEBHOOK_SECRET and restart the backend, then
stripe trigger checkout.session.completed
```

Or go through the real flow: sign in, open Billing, upgrade, and pay with test card `4242 4242 4242 4242`. Keep `stripe listen` running: **the webhook is the only source of truth for plan state** (the checkout success redirect changes nothing). Replayed events are safe, so you can also `stripe events resend <evt_id>`.

## API reference

Base path `/api/v1`. Responses are `{ "status": "success", "data": ... }`; errors are `{ "status": "error", "message": ..., "errors"?: ... }`.

**Auth:** `Authorization: Bearer <Supabase access token>` or `Bearer ru_live_...` (API key). "JWT only" endpoints return `403` for API keys, so a leaked key cannot mint keys or touch billing.

| Method | Path | Auth | Notes |
|---|---|---|---|
| `GET` | `/health` | none | liveness |
| `GET` | `/:code` | none | `302` to the target, `404` unknown code. Rate-limited per client IP. |
| `GET` | `/api/v1/plans` | none | `{ free, pro }` limits and display price |
| `POST` | `/api/v1/links` | JWT / key | `{ url, customCode? }` -> `201`. `400` invalid or taken or reserved code, `402` monthly quota reached (`errors.upgradeUrl`). |
| `GET` | `/api/v1/links` | JWT / key | your links, newest first, capped at 100, with `accessCount` |
| `GET` | `/api/v1/links/:code` | JWT / key | `404` if it is not yours |
| `PUT` | `/api/v1/links/:code` | JWT / key | `{ url }`; the redirect cache entry is evicted |
| `DELETE` | `/api/v1/links/:code` | JWT / key | `204`; the cache entry is evicted |
| `GET` | `/api/v1/links/:code/stats` | JWT / key | link plus `accessCount` |
| `GET` | `/api/v1/links/:code/analytics?from=YYYY-MM-DD&to=YYYY-MM-DD` | JWT / key | Days are UTC; defaults to the last 7 days; `from` is clamped to the plan's `analyticsDays` and the response reports the clamped range. `{ from, to, granularity: "hour"\|"day", total, series, countries, referrers, devices }`: zero-filled series, top 10 per list, `value: null` = unknown. `400` bad dates. |
| `POST` | `/api/v1/keys` | JWT only | `{ name }` (1-64 chars) -> `201 { id, name, prefix, createdAt, key }`; the key is shown once |
| `GET` | `/api/v1/keys` | JWT only | your keys, newest first (never the key or hash) |
| `DELETE` | `/api/v1/keys/:id` | JWT only | soft revoke, `204`; `404` if not yours or already revoked |
| `GET` | `/api/v1/billing` | JWT only | `{ plan, status, currentPeriodEnd, usage: { linksThisMonth, linksPerMonth } }` |
| `POST` | `/api/v1/billing/checkout` | JWT only | `{ url }` of a Stripe Checkout page; `409` if already Pro |
| `POST` | `/api/v1/billing/portal` | JWT only | `{ url }` of the billing portal; `404` before the first checkout |
| `POST` | `/api/v1/billing/webhook` | Stripe signature | unauthenticated, not rate-limited, raw body |

**Rate limits:** `/api/v1/*` is limited per API key (or per user for JWTs) by plan, 60/min on Free and 600/min on Pro; redirects and `/api/v1/plans` per client IP (`REDIRECT_LIMIT_PER_MIN`). Every limited response carries `RateLimit-Limit`, `RateLimit-Remaining` and `RateLimit-Reset` (seconds); a blocked one is `429` with `Retry-After`.

```bash
curl -X POST http://localhost:3000/api/v1/links \
  -H "Authorization: Bearer ru_live_..." -H "Content-Type: application/json" \
  -d '{"url":"https://example.com/very/long/path","customCode":"mylink"}'
```

## Design notes

- **Rate limiter: sliding-window counter.** Two integer keys per client (current and previous window) and a weighted estimate, in one Lua script so read, compare and increment are atomic. A sorted-set log is exact but costs one entry per request (O(limit) memory), which is wrong for per-IP limiting of public redirects; a fixed window allows 2x bursts at the boundary. The estimate assumes the previous window was evenly spread, so it is only slightly off near boundaries. Rejected requests are not counted. It fails open when Redis is down.
- **302, not 301.** Browsers cache a 301 forever: clicks would never reach us (no analytics) and an updated target would never be seen by anyone who had already visited.
- **Click pipeline.** The redirect `LPUSH`es a small event (id, time, link id, referrer host, country, device class; never the IP) to `clicks:queue` without awaiting it. The worker atomically `LMOVE`s up to 1000 events to `clicks:processing` (only when that list is empty, so leftovers from a crash are re-processed first), writes them with one SQL statement (insert raw clicks, bump `accessCount`, upsert the daily rollup), and deletes `clicks:processing` only after Postgres commits. Crash safety: a crash anywhere leaves the batch in `clicks:processing` to be replayed. Idempotency: every event has a UUID and the insert is `ON CONFLICT DO NOTHING ... RETURNING`, so only rows actually inserted are counted and a replay after "committed but not yet deleted" is a no-op. Events for a deleted link are dropped by a join instead of failing the batch.
- **Raw/rollup tiering.** Raw `clicks` are kept 30 days (hourly purge job in the worker) and answer ranges up to 7 days in hourly buckets; `clicks_daily` (one row per link, day, country, referrer, device) is permanent and answers longer ranges in daily buckets. Plans cap how far back a range may start.
- **Webhook idempotency in one transaction.** The signature is verified over the raw bytes, then the event id is inserted into `stripe_events` and the subscription row is written in the same transaction: a redelivery either hits a fast-path check or loses the `ON CONFLICT` race and does nothing, and a failure rolls everything back so Stripe's retry applies it. Each handled event re-fetches the subscription from Stripe and stores its current state, so a late or out-of-order event cannot downgrade a live subscription. `past_due` keeps Pro during Stripe's payment retries.
- **Plan cache.** A user's plan is cached in `plan:<userId>` for 60 s so the rate limiter does not hit Postgres per request; the webhook deletes the key after it commits, so upgrades and downgrades apply on the next request.
- **RLS.** Supabase exposes `public` tables through its REST API with the publishable key (which ships in the frontend bundle). Migration 006 enables row level security on every table with no policies, so the `anon` and `authenticated` roles see nothing. The backend connects as the table owner, which RLS does not apply to unless `FORCE ROW LEVEL SECURITY` is set, so it is unaffected. A test checks that a non-owner role sees zero rows.

## Benchmark

`npm run bench` in `backend/` ([`bench/redirect.js`](backend/bench/redirect.js), autocannon 8, 50 connections, 10 s per run after a 3 s warmup). Two scenarios, each run twice:

- **Cached:** one code hit repeatedly, so every request after the first is a Redis hit.
- **Uncached:** a distinct seeded code per request, Redis flushed first, so every request is a Redis miss plus a Postgres lookup and cache fill. Codes never repeat within a run: after each run the number of `url:*` keys in Redis matched the number of responses to within 0.2%.

| Scenario | Run | req/s | p50 (ms) | p95 (ms) | p99 (ms) | Requests |
|---|---|---|---|---|---|---|
| Cached | 1 | 1,967 | 24.4 | 33.7 | 40.5 | 19,688 |
| Cached | 2 | 1,974 | 24.3 | 33.0 | 45.5 | 19,764 |
| Uncached | 1 | 1,394 | 33.8 | 46.7 | 55.9 | 13,950 |
| Uncached | 2 | 1,445 | 33.1 | 44.4 | 52.4 | 14,482 |

All responses were `302`, with 0 errors and 0 timeouts. Percentiles are computed from every response's own timing (autocannon's histogram has 1 ms buckets and no p95); its own p50/p99 agree within 1 ms.

**Machine:** Intel Core i5-12450H (8 cores, 12 threads), 23.7 GB RAM, Windows 11 Home 10.0.26200, Node v22.23.2. Postgres 16 and Redis 7 run in Docker Desktop (Linux engine, 12 CPUs, 16 GB) on the same machine, and so does the load generator. The backend was the compiled `dist/` build as a single Node process, `NODE_ENV` unset, `REDIRECT_LIMIT_PER_MIN=100000000`, a separate database (`urlshortener_bench`, 400,001 seeded links) and Redis DB 13.

**Read this before quoting the numbers:**

- These are absolute numbers for a laptop running everything at once, not for a server. The server is the bottleneck, not the datastores: for context, on the same machine a bare `http.createServer` 302 handler does about 25,000 req/s, bare Express with `helmet`, `compression` and `cors` about 3,700, and this app's `/health` (no Redis, no Postgres) about 2,700. So the cached path is mostly framework and middleware plus the rate-limiter and click `LPUSH` round trips, and the cache saves comparatively little here: about 1.4x req/s and about 9 ms of p50.
- Local Postgres has near-zero network latency. Against Supabase over the network, an uncached request pays a real round trip, so the cached/uncached gap here **understates** production.
- The worker was not running, so `clicks:queue` grew during the runs (about 18,600 events by the end of the last one). Running it would add some load on Redis and Postgres.
- Two runs per scenario is a sanity check, not statistics. An earlier identical pass measured 1,996 and 2,045 req/s (cached) and 1,394 and 1,387 req/s (uncached).

To reproduce: start the compose services, create a database, apply migrations 001-006 (with a stub `auth.users`, see `backend/test/api.test.ts`), seed with `generate_series` (codes `cached0001`, `k0000001..k0300000` for the measured run and `w0000001..w0100000` for warmup, see the header of `bench/redirect.js`), start the backend with `REDIRECT_LIMIT_PER_MIN` set high and `PORT`/`REDIS_URL`/`DATABASE_URL` pointing at the bench database, then `BENCH_URL=http://localhost:<port> REDIS_URL=<same redis> npm run bench`. The Redis DB in `REDIS_URL` is flushed.

## Testing and CI

```bash
docker compose up -d
cd backend
TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:54329/urlshortener_test \
TEST_REDIS_URL=redis://localhost:6379/15 npm test
npm run typecheck       # src, then src + test (tsconfig.test.json)
cd ../frontend && npx tsc --noEmit && npm run build
```

The suite (`backend/test/api.test.ts`, Vitest + supertest) signs real ES256 JWTs against a local JWKS server, applies the migrations to the test database, and mocks every Stripe network call (webhook signatures are verified for real). It covers auth, owner scoping, validation, the rate limiter, the redirect cache, the click pipeline (including crash replay and duplicates), analytics, API keys, billing, quotas, webhook idempotency and RLS. The Redis database in `TEST_REDIS_URL` is flushed, so use index 15. Without the env vars the database and Redis tests are skipped locally, but **when `CI` is set a missing variable fails the run**.

GitHub Actions (`.github/workflows/ci.yml`) on every push and pull request: a backend job (Postgres 16 and Redis 7 service containers, Node 20, `npm ci`, `npm run typecheck`, `npm test`) and a frontend job (`npm ci`, `npx tsc --noEmit`, `npm run build`).

## Known limitations / ponytail ledger

Deliberate shortcuts, each marked `ponytail:` in the code:

- `backend/src/repositories/url.repository.ts`: the link list is capped at 100; add cursor pagination on `("createdAt", id)` past that.
- `backend/src/services/url.service.ts` (quota): deleting a link refunds quota and concurrent creates can overshoot by a few; use an atomic per-month usage counter row.
- `backend/src/services/url.service.ts` (click enqueue): clicks are dropped while Redis is down; add a local in-memory buffer or a direct DB fallback.
- `backend/src/services/url.service.ts` (cache eviction): a concurrent miss can re-cache the old URL right after an update's `DEL`; the 1 h TTL bounds it; use a short TTL or versioned keys.
- `backend/src/services/billing.service.ts`: two near-simultaneous Stripe events for one user can commit out of fetch order, leaving slightly older state until the next event; compare a per-subscription version.
- `backend/src/worker.ts` (single worker): one shared `clicks:processing` list; use a processing key per worker to run several.
- `backend/src/worker.ts` (purge): the 30-day raw-click purge is one unbatched `DELETE`; batch it or partition `clicks` by month at scale.
- `frontend/src/pages/LinkAnalyticsPage.tsx`: the plan is inferred from the analytics clamp size (30 = Free, 365 = Pro) instead of a second `/billing` call.

Also worth knowing: billing is test mode only by design; there is no metered overage billing (a hard monthly quota instead); and the benchmark above is a single-machine measurement.

## Why I built it

<!-- TODO(you): write this section -->
