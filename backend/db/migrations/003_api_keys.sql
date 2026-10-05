-- Run: psql "$DATABASE_URL" -f backend/db/migrations/003_api_keys.sql
-- Only the SHA-256 hash of a key is stored; the key itself is shown once, at creation.
-- Keys are revoked (soft, "revokedAt"), never deleted. Rows cascade away with their owner.
CREATE TABLE IF NOT EXISTS api_keys (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "ownerId"     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name          text NOT NULL,
  prefix        text NOT NULL,
  "keyHash"     text NOT NULL UNIQUE,
  "createdAt"   timestamptz NOT NULL DEFAULT now(),
  "lastUsedAt"  timestamptz,
  "revokedAt"   timestamptz
);
CREATE INDEX IF NOT EXISTS api_keys_owner_idx ON api_keys ("ownerId");
