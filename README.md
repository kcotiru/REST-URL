# REST URL

A full-stack URL shortening service with a clean REST API backend and a modern React frontend. Shorten URLs, define custom short codes, track access statistics, and manage links programmatically.

```
rest-url/
├── backend/         # Node.js + Express + TypeScript REST API (PostgreSQL via Supabase)
└── frontend/        # React + Vite + Tailwind CSS web interface
```

---

## Architecture Overview

```
Browser → Vite Dev Proxy (/api) → Express Backend → Supabase PostgreSQL
                              ↘ Redirect (/:code) ↗
```

The frontend proxies all `/api/*` calls to the backend during development. The backend handles both the REST API and short-code redirects.

---

## Quick Start

### Prerequisites
- Node.js 18+
- A [Supabase](https://supabase.com) project (free tier works fine)

---

## Features

- **Auto-generated short codes** — 7-char nanoid codes from a 62-char alphanumeric alphabet (~3.5 trillion unique codes)
- **Custom short codes** — user-defined slugs, 3–10 characters, alphanumeric only, conflict-checked
- **Access tracking** — every redirect increments `accessCount` atomically in PostgreSQL
- **Full CRUD** — create, read, update, delete via REST
- **Zod validation** — request bodies and route params validated before hitting the controller
- **Layered architecture** — controller → service → repository separation throughout
- **Graceful shutdown** — `SIGTERM`/`SIGINT` handlers close the HTTP server cleanly
- **SSL-aware** — Supabase SSL enabled automatically when `NODE_ENV=production`

---

## Project READMEs

Each sub-project has its own detailed README:

- [`backend/README.md`](./backend/README.md) — backend architecture, environment variables, layered design decisions
- [`frontend/README.md`](./frontend/README.md) — pages, design system, API client usage, build instructions

---

## Tech Stack

### Backend (`backend/`)
| | |
|---|---|
| Runtime | Node.js 18+ |
| Framework | Express 4 |
| Language | TypeScript 5 |
| Database | PostgreSQL via [Supabase](https://supabase.com) |
| DB Client | `pg` (connection pooling) |
| Validation | Zod |
| Short codes | nanoid |

### Frontend (`frontend/`)
| | |
|---|---|
| Build tool | Vite 5 |
| UI | React 18 |
| Language | TypeScript 5 |
| Styling | Tailwind CSS 3 |
| Routing | React Router 6 |
| Icons | Lucide React |
| Fonts | Syne · DM Sans · Space Mono |

---

## Migrations

Run `psql "$DATABASE_URL" -f backend/db/migrations/002_url_owner.sql` after `001_init.sql` (adds `urls."ownerId"`; existing links become read-only legacy rows).

Run `psql "$DATABASE_URL" -f backend/db/migrations/003_api_keys.sql` next (adds the `api_keys` table; only SHA-256 hashes of keys are stored).

Tests: `docker compose up -d`, then `TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:54329/urlshortener_test TEST_REDIS_URL=redis://localhost:6379/15 npm test` in `backend/` (DB and Redis tests skip without them; the Redis DB is flushed, so use index 15).

---

## API keys

Create keys with a Supabase session JWT, then use them as Bearer tokens on `/api/v1/links`. Keys are `ru_live_` + 43 random chars, shown **once** in the create response.

| Method | Path | Notes |
|---|---|---|
| `POST` | `/api/v1/keys` | body `{ "name": "ci" }` (1-64 chars) -> `201 { id, name, prefix, createdAt, key }` |
| `GET` | `/api/v1/keys` | your keys, newest first (`id, name, prefix, createdAt, lastUsedAt, revokedAt`) |
| `DELETE` | `/api/v1/keys/:id` | revokes (soft); `204`, or `404` if not yours / already revoked |

Key management is JWT-session only: an API key calling `/api/v1/keys` gets `403`.

```bash
curl -H "Authorization: Bearer ru_live_…" -H "Content-Type: application/json" \
  -X POST http://localhost:3000/api/v1/links -d '{"url":"https://example.com"}'
```

---

## Redis: rate limiting and redirect cache

`docker compose up -d` starts Redis on `localhost:6379`; point the backend at it with `REDIS_URL` (default `redis://localhost:6379`). Redis is optional at runtime: if it is down, requests are never blocked (rate limiting and caching are skipped, errors are logged).

- **Rate limits** use a sliding-window counter. `/api/v1/*` is limited per API key (or per user for JWTs) by plan: 60 req/min on free. Public redirects are limited to 600/min per client IP; set `TRUST_PROXY` (number of proxy hops) when running behind a reverse proxy, otherwise all clients share one bucket.
- Every limited response carries `RateLimit-Limit`, `RateLimit-Remaining` and `RateLimit-Reset` (seconds); a blocked one is `429` with `Retry-After`.
- **Redirect cache**: `GET /:code` caches the target in `url:<code>` for 1 hour; updating or deleting a link evicts it. Redirects stay `302` so browsers don't cache them and clicks still reach us.

---

## Production Deployment

### Backend
1. Set `NODE_ENV=production` in your environment
2. Run `npm run build && npm start` (or use a process manager like PM2)
3. SSL is automatically enabled for the Supabase connection

### Frontend
1. Run `npm run build` — outputs to `dist/`
2. Serve `dist/` as a static site (Vercel, Netlify, Nginx, etc.)
3. Configure your host to proxy `/api/*` requests to the backend URL

**Vercel example** — add a `vercel.json` at the frontend root:
```json
{
  "rewrites": [
    { "source": "/api/:path*", "destination": "https://your-backend.com/api/:path*" }
  ]
}
```
