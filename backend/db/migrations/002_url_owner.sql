-- Run: psql "$DATABASE_URL" -f backend/db/migrations/002_url_owner.sql
-- Existing rows keep NULL "ownerId": read-only for everyone via the API (still redirect).
ALTER TABLE urls ADD COLUMN IF NOT EXISTS "ownerId" uuid REFERENCES auth.users(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS urls_owner_idx ON urls ("ownerId");
