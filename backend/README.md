# URL Shortener API

A production-ready REST API for shortening URLs, built with **Node.js**, **Express**, **TypeScript**, and **PostgreSQL**.

---

## Project Structure

```
src/
├── config/          
├── controllers/    
├── middleware/     
├── repositories/  
├── routes/        
├── services/       
├── types/       
├── utils/         
├── app.ts       
└── index.ts       
```

---

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
# Edit .env with your PostgreSQL credentials
```

| Variable           | Default         | Description                       |
|--------------------|-----------------|-----------------------------------|
| `PORT`             | `3000`          | HTTP port                         |
| `DB_HOST`          | `localhost`     | PostgreSQL host                   |
| `DB_PORT`          | `5432`          | PostgreSQL port                   |
| `DB_NAME`          | `url_shortener` | Database name                     |
| `DB_USER`          | `postgres`      | Database user                     |
| `DB_PASSWORD`      | `postgres`      | Database password                 |
| `BASE_URL`         | `http://localhost:3000` | Used to build short URLs  |
| `SHORT_CODE_LENGTH`| `7`             | Length of generated short codes   |

### 3. Create the database table

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

### 4. Run

```bash
# Development (hot reload)
npm run dev

# Production
npm run build && npm start

# Click worker (separate process, needs Redis)
npm run worker
```

---

## API Endpoints

All endpoints are prefixed with `/api/v1/links`.

### `POST /api/v1/links`
Create a short URL.

**Request body:**
```json
{ "url": "https://example.com/some/very/long/path" }
```

**Response `201`:**
```json
{
  "status": "success",
  "data": {
    "id": 1,
    "url": "https://example.com/some/very/long/path",
    "shortCode": "aB3xY7z",
    "createdAt": "2024-01-01T00:00:00.000Z",
    "updatedAt": "2024-01-01T00:00:00.000Z"
  }
}
```

**Error `400`** — invalid or missing URL.

---

### `GET /api/v1/links/:code`
Retrieve metadata for a short code.

**Response `200`:** same shape as above.  
**Error `404`** — code not found.

---

### `PUT /api/v1/links/:code`
Update the destination URL of an existing short code.

**Request body:**
```json
{ "url": "https://new-destination.com" }
```

**Response `200`:** updated record.  
**Errors:** `400` (invalid body) · `404` (code not found).

---

### `DELETE /api/v1/links/:code`
Remove a short URL mapping.

**Response `204`** — no content.  
**Error `404`** — code not found.

---

### `GET /api/v1/links/:code/stats`
Get access count and timestamps.

**Response `200`:**
```json
{
  "status": "success",
  "data": {
    "id": 1,
    "url": "https://example.com/...",
    "shortCode": "aB3xY7z",
    "createdAt": "2024-01-01T00:00:00.000Z",
    "updatedAt": "2024-01-01T00:00:00.000Z",
    "accessCount": 42
  }
}
```

### `GET /api/v1/links/:code/analytics?from=YYYY-MM-DD&to=YYYY-MM-DD`
Click analytics for a link you own (`404` otherwise). Days are UTC and `to` includes its whole day. Defaults: `to` = today, `from` = `to` − 6 days. `from` is clamped to the plan's `analyticsDays`, and the response reports the clamped range. `400` if a date is invalid or `from > to`.

```json
{ "status": "success", "data": {
  "from": "2024-01-01", "to": "2024-01-07", "granularity": "hour", "total": 3,
  "series": [{ "t": "2024-01-01T00:00:00Z", "count": 0 }],
  "countries": [{ "value": "DE", "count": 3 }],
  "referrers": [{ "value": "news.ycombinator.com", "count": 3 }],
  "devices": [{ "value": "mobile", "count": 3 }] } }
```
The series is zero-filled; each top list has at most 10 entries and `value: null` means unknown.

## Click analytics

```
redirect --LPUSH--> clicks:queue --worker (LMOVE, batch of 1000)--> clicks:processing --one SQL statement--> Postgres
```

- The redirect never waits on analytics: it pushes a small event (`i` id, `t` time, `u` link id, `r` referrer host, `c` country, `d` device class; never the IP) without awaiting it. If Redis is down the click is dropped.
- `npm run worker` (`npm run build && npm run start:worker` in production) drains the queue every 2s. Events are moved to `clicks:processing` first and that list is deleted only after Postgres commits, so a crash replays the batch; event ids and `ON CONFLICT DO NOTHING` make the replay a no-op. Run a single worker.
- One statement per flush inserts into `clicks`, bumps `urls."accessCount"` and upserts the `clicks_daily` rollup.
- Run `db/migrations/004_clicks.sql` first (creates `clicks` and `clicks_daily`).
- Retention: raw `clicks` are purged after 30 days (hourly job in the worker); `clicks_daily` is kept. Ranges up to 7 days read the raw table in hourly buckets, longer ones read the rollup in daily buckets.

## Design Decisions

- **Layered architecture** — controller → service → repository separation keeps each layer focused and testable.
- **Zod validation** — all request bodies and route params are parsed/validated before reaching the controller.
- **nanoid** — generates URL-safe, cryptographically random short codes. The 62-character alphabet and default length of 7 gives ~3.5 trillion unique codes.
- **Collision guard** — the service retries generation if (extremely unlikely) a collision occurs, up to 10 attempts.
- **Custom error classes** — `NotFoundError` / `ValidationError` extend `AppError`; the central `errorHandler` middleware maps them to correct HTTP status codes.
- **Connection pooling** — `pg.Pool` with sane defaults; pool errors trigger a clean process exit.
- **Graceful shutdown** — `SIGTERM`/`SIGINT` handlers close the HTTP server before exiting.
