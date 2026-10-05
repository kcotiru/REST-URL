-- Run: psql "$DATABASE_URL" -f backend/db/migrations/004_clicks.sql
-- Raw clicks are kept 30 days (the worker purges older rows) for hourly detail; clicks_daily
-- is the permanent rollup. Both cascade away with their link. All days are UTC.
CREATE TABLE IF NOT EXISTS clicks (
  id             uuid PRIMARY KEY,
  "urlId"        integer NOT NULL REFERENCES urls(id) ON DELETE CASCADE,
  "clickedAt"    timestamptz NOT NULL,
  "referrerHost" text,
  country        text,
  device         text NOT NULL
);
CREATE INDEX IF NOT EXISTS clicks_url_time_idx ON clicks ("urlId", "clickedAt");
CREATE INDEX IF NOT EXISTS clicks_time_idx ON clicks ("clickedAt");

-- '' means "unknown" in country/"referrerHost": primary key columns cannot be NULL.
CREATE TABLE IF NOT EXISTS clicks_daily (
  "urlId"        integer NOT NULL REFERENCES urls(id) ON DELETE CASCADE,
  day            date NOT NULL,
  country        text NOT NULL DEFAULT '',
  "referrerHost" text NOT NULL DEFAULT '',
  device         text NOT NULL,
  count          integer NOT NULL,
  PRIMARY KEY ("urlId", day, country, "referrerHost", device)
);
