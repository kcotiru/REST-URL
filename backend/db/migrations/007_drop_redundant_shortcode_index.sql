-- Run: psql "$DATABASE_URL" -f backend/db/migrations/007_drop_redundant_shortcode_index.sql
-- idx_shortcode duplicated the index behind the UNIQUE constraint on "shortCode" (older live table only).
DROP INDEX IF EXISTS idx_shortcode;
