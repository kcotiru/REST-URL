# REST-URL Pro

URL shortener with a REST API, per-link click analytics, API keys and Stripe-backed Free/Pro plans.
Express + TypeScript + Postgres (Supabase) + Redis; React + Vite + Tailwind; Stripe in **test mode only**.

## Features

- Short links: generated 7-char codes or custom 3-10 char codes; owner-scoped CRUD.
- Redis-cached `GET /:code` redirects; clicks are recorded off the request path.
- Analytics per link: hourly/daily series, countries, referrers, devices (IPs never stored).
- Supabase JWT auth (ES256, verified via JWKS) or revocable `ru_live_...` API keys (SHA-256 only).
- Free (50 links/month, 60 req/min, 30 days analytics) and Pro (5000, 600 req/min, 365 days) plans.
- Redis is optional at runtime: if it is down, requests are never blocked.

## Architecture

```mermaid
flowchart LR
  Client["Browser / API client"] --> API["Express: auth, rate limiter"]
  Stripe["Stripe"] -->|"signed event"| Hook["Webhook"]
  Supa["Supabase Auth"] -.->|"JWT / JWKS"| API
  API <--> Redis[("Redis: cache, rate-limit counters, click queue")]
  Worker["Click worker"] <--> Redis
  API & Hook & Worker --> PG[("Postgres")]
```

## Quick start

Needs Node 20+, Docker, a Supabase project (Auth + Postgres); for billing, the Stripe CLI.

```bash
docker compose up -d     # Redis 7 :6379 (app + tests); Postgres 16 :54329 (tests/bench only)
cp backend/.env.example backend/.env && cp frontend/.env.example frontend/.env   # then fill in
for f in backend/db/migrations/*.sql; do psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$f"; done  # 001-006
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
| `TEST_DATABASE_URL`, `TEST_REDIS_URL` | tests | see Tests & CI |
| `BENCH_URL`, `BENCH_SECONDS`, `BENCH_WARMUP_SECONDS`, `BENCH_CONNECTIONS`, `BENCH_ROUNDS` | bench | see `backend/bench/redirect.js` |

## Stripe (test mode)

```bash
stripe products create --name "REST-URL Pro"
stripe prices create --product <prod_id> --unit-amount 900 --currency usd -d "recurring[interval]=month"  # -> STRIPE_PRICE_PRO
stripe listen --forward-to localhost:3000/api/v1/billing/webhook   # -> STRIPE_WEBHOOK_SECRET
stripe trigger checkout.session.completed                          # or pay with card 4242 4242 4242 4242
```

The webhook is the only source of truth for plan state; the checkout redirect changes nothing.

## API

Base `/api/v1`. Success `{ "status": "success", "data": ... }`, error `{ "status": "error", "message", "errors"? }`.
Auth: `Authorization: Bearer <Supabase JWT>` or `Bearer ru_live_...`; "JWT only" endpoints reject keys with `403`.

| Method | Path | Auth | Notes |
|---|---|---|---|
| `GET` | `/health`, `/api/v1/plans` | none | liveness; `{ free, pro }` limits and price |
| `GET` | `/:code` | none | `302` to target, `404` unknown |
| `POST` | `/api/v1/links` | JWT / key | `{ url, customCode? }`; `400` bad code, `402` quota |
| `GET` | `/api/v1/links` | JWT / key | yours, newest first, max 100 |
| `GET` `PUT` `DELETE` | `/api/v1/links/:code`, `.../stats` | JWT / key | `PUT { url }`; `/stats` adds `accessCount`; `404` if not yours |
| `GET` | `/api/v1/links/:code/analytics?from=&to=` | JWT / key | `YYYY-MM-DD` UTC, default 7 days |
| `POST` `GET` | `/api/v1/keys` | JWT only | `{ name }` -> `201`, key shown once |
| `DELETE` | `/api/v1/keys/:id` | JWT only | soft revoke, `204` |
| `GET` | `/api/v1/billing` | JWT only | plan, status, period end, usage |
| `POST` | `/api/v1/billing/checkout`, `/portal` | JWT only | Stripe `{ url }`; `409` if Pro, `404` pre-checkout |
| `POST` | `/api/v1/billing/webhook` | Stripe signature | raw body, not rate-limited |

Analytics: `from` is clamped to the plan's `analyticsDays`; returns `{ from, to, granularity: "hour"|"day", total, series, countries, referrers, devices }` (zero-filled, top 10, `value: null` = unknown).
Rate limits: per API key/user by plan, per client IP for redirects and plans; headers `RateLimit-Limit/-Remaining/-Reset`, `429` + `Retry-After`.

```bash
curl -X POST http://localhost:3000/api/v1/links \
  -H "Authorization: Bearer ru_live_..." -H "Content-Type: application/json" \
  -d '{"url":"https://example.com/very/long/path","customCode":"mylink"}'
```

## Design decisions

| Decision | Why |
|---|---|
| Sliding-window counter limiter | O(1) memory per client, no 2x boundary burst; one atomic Lua script; fails open |
| `302`, not `301` | A cached 301 hides clicks and stale targets |
| Crash-safe click pipeline | `LMOVE` to a processing list, deleted after commit; `ON CONFLICT DO NOTHING` makes replay a no-op |
| Raw 30d + daily rollup | Raw `clicks` serve 7-day hourly ranges; permanent `clicks_daily` serves longer ones |
| Webhook in one transaction | Event id and subscription state commit together; re-fetching the subscription handles out-of-order events |
| 60 s plan cache | Keeps Postgres off the rate-limit path; the webhook invalidates it |
| RLS on, no policies | The publishable key ships in the bundle; `anon`/`authenticated` see nothing, backend owns the tables |

## Benchmark

`npm run bench` in `backend/` ([`bench/redirect.js`](backend/bench/redirect.js) has the reproduce steps).
Two runs per scenario, shown as ranges. Setup: i5-12450H, Windows 11, Node 22, Docker Postgres 16 / Redis 7, 50 connections, 10 s.

| Scenario | req/s | p50 (ms) | p95 (ms) | p99 (ms) |
|---|---|---|---|---|
| Cached (one code, Redis hit) | 1,967-1,974 | 24.3-24.4 | 33.0-33.7 | 40.5-45.5 |
| Uncached (distinct code, Redis miss + Postgres) | 1,394-1,445 | 33.1-33.8 | 44.4-46.7 | 52.4-55.9 |

- Single laptop with everything co-located; the framework is the bottleneck (`/health` alone is about 2,700 req/s).
- Local Postgres has no network latency, so the cached/uncached gap understates Supabase.
- The worker was not running during the runs.

## Tests & CI

```bash
(cd backend && TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:54329/urlshortener_test \
  TEST_REDIS_URL=redis://localhost:6379/15 npm test && npm run typecheck)   # flushes that Redis DB
(cd frontend && npx tsc --noEmit && npm run build)
```

Vitest + supertest (`backend/test/api.test.ts`): auth, scoping, rate limiter, click pipeline, analytics, billing, webhook idempotency, RLS; Stripe is mocked.
GitHub Actions runs both jobs on every push and PR; with `CI` set, missing service env vars fail instead of skipping.

## Known limitations

| Shortcut | Upgrade path |
|---|---|
| `url.repository.ts`: link list capped at 100 | Cursor pagination on `("createdAt", id)` |
| `url.service.ts`: delete refunds quota, concurrent creates can overshoot | Atomic per-month usage counter |
| `url.service.ts`: clicks dropped while Redis is down | In-memory buffer or direct DB fallback |
| `url.service.ts`: concurrent miss can re-cache an old URL after update (1 h TTL bound) | Short TTL or versioned keys |
| `billing.service.ts`: near-simultaneous Stripe events can commit out of order | Per-subscription version compare |
| `worker.ts`: one shared `clicks:processing` list | Processing key per worker |
| `worker.ts`: 30-day purge is one unbatched `DELETE` | Batch it or partition `clicks` by month |
| `LinkAnalyticsPage.tsx`: plan inferred from the clamp size (30 / 365) | Call `/billing` |

No metered overage billing (hard monthly quota); test-mode billing only.

## Why I built it

<!-- TODO(you): write this section -->
