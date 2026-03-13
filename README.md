# REST URL

A full-stack URL shortening service with a clean REST API backend and a modern React frontend. Shorten URLs, define custom short codes, track access statistics, and manage links programmatically.

```
rest-url/
├── backend/   # Node.js + Express + TypeScript REST API (PostgreSQL via Supabase)
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

### 1. Database — Supabase Setup

In your Supabase project, open **SQL Editor** and run:

```sql
CREATE TABLE urls (
    "id"          SERIAL PRIMARY KEY,
    "url"         TEXT         NOT NULL,
    "shortCode"   VARCHAR(10)  UNIQUE NOT NULL,
    "createdAt"   TIMESTAMPTZ  DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   TIMESTAMPTZ  DEFAULT CURRENT_TIMESTAMP,
    "accessCount" INTEGER      DEFAULT 0
);

CREATE INDEX idx_shortCode ON urls ("shortCode");
```

Then go to **Project Settings → Database → Connection string → URI** and copy the connection string.

---

### 2. Backend — `url-shortener/`

```bash
cd url-shortener
npm install
cp .env.example .env
```

Edit `.env`:

```env
PORT=3000
NODE_ENV=development
DATABASE_URL=postgresql://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres
SHORT_CODE_LENGTH=7
```

```bash
npm run dev     # → http://localhost:3000
```

---

### 3. Frontend — `frontend/`

```bash
cd frontend
npm install
npm run dev     # → http://localhost:5173
```

The Vite dev server proxies `/api` → `http://localhost:3000` automatically. No extra config needed.

Open **http://localhost:5173** in your browser.

---

## API Reference

Base URL: `http://localhost:3000`

| Method | Endpoint | Description | Success | Error |
|---|---|---|---|---|
| `POST` | `/shorten` | Create a short URL | `201` | `400` |
| `GET` | `/shorten/:code` | Get URL metadata | `200` | `404` |
| `PUT` | `/shorten/:code` | Update destination URL | `200` | `400`, `404` |
| `DELETE` | `/shorten/:code` | Remove a short URL | `204` | `404` |
| `GET` | `/shorten/:code/stats` | Get access count & timestamps | `200` | `404` |
| `GET` | `/:code` | Redirect to original URL | `302` | `404` |

### Request & Response Examples

**Create a short URL**
```http
POST /shorten
Content-Type: application/json

{
  "url": "https://example.com/very/long/path",
  "customCode": "mylink"     ← optional, 3–10 alphanumeric chars
}
```
```json
{
  "status": "success",
  "data": {
    "id": 1,
    "url": "https://example.com/very/long/path",
    "shortCode": "mylink",
    "createdAt": "2024-06-01T08:00:00.000Z",
    "updatedAt": "2024-06-01T08:00:00.000Z"
  }
}
```

**Get stats**
```http
GET /shorten/mylink/stats
```
```json
{
  "status": "success",
  "data": {
    "id": 1,
    "url": "https://example.com/very/long/path",
    "shortCode": "mylink",
    "createdAt": "2024-06-01T08:00:00.000Z",
    "updatedAt": "2024-06-01T08:05:00.000Z",
    "accessCount": 42
  }
}
```

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

- [`url-shortener/README.md`](./url-shortener/README.md) — backend architecture, environment variables, layered design decisions
- [`frontend/README.md`](./frontend/README.md) — pages, design system, API client usage, build instructions

---

## Tech Stack

### Backend (`url-shortener/`)
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
    { "source": "/api/:path*", "destination": "https://your-backend.com/:path*" }
  ]
}
```
