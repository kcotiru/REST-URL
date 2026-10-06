# API

Endpoints, auth, analytics, rate limits and a curl example. ← [README](../README.md)

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

- Analytics: `from` is clamped to the plan's `analyticsDays`; returns `{ from, to, granularity: "hour"|"day", total, series, countries, referrers, devices }` (zero-filled, top 10, `value: null` = unknown).
- Rate limits: per API key/user by plan, per client IP for redirects and plans; headers `RateLimit-Limit/-Remaining/-Reset`, `429` + `Retry-After`.

```bash
curl -X POST http://localhost:3000/api/v1/links \
  -H "Authorization: Bearer ru_live_..." -H "Content-Type: application/json" \
  -d '{"url":"https://example.com/very/long/path","customCode":"mylink"}'
```
