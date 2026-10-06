# Design

Features, design decisions, benchmark and known limitations. ← [README](../README.md)

## Features

Express + TypeScript + Postgres (Supabase) + Redis; React + Vite + Tailwind; Stripe in **test mode only**.

- Short links: generated 7-char codes or custom 3-10 char codes; owner-scoped CRUD.
- Redis-cached `GET /:code` redirects; clicks are recorded off the request path.
- Analytics per link: hourly/daily series, countries, referrers, devices (IPs never stored).
- Supabase JWT auth (ES256, verified via JWKS) or revocable `ru_live_...` API keys (SHA-256 only).
- Free (50 links/month, 60 req/min, 30 days analytics) and Pro (5000, 600 req/min, 365 days) plans.
- Redis is optional at runtime: if it is down, requests are never blocked.

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

`npm run bench` in `backend/` ([`bench/redirect.js`](../backend/bench/redirect.js) has the reproduce steps).
Two runs per scenario, shown as ranges. Setup: i5-12450H, Windows 11, Node 22, Docker Postgres 16 / Redis 7, 50 connections, 10 s.

| Scenario | req/s | p50 (ms) | p95 (ms) | p99 (ms) |
|---|---|---|---|---|
| Cached (one code, Redis hit) | 1,967-1,974 | 24.3-24.4 | 33.0-33.7 | 40.5-45.5 |
| Uncached (distinct code, Redis miss + Postgres) | 1,394-1,445 | 33.1-33.8 | 44.4-46.7 | 52.4-55.9 |

- Single laptop with everything co-located; the framework is the bottleneck (`/health` alone is about 2,700 req/s).
- Local Postgres has no network latency, so the cached/uncached gap understates Supabase.
- The worker was not running during the runs.

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
