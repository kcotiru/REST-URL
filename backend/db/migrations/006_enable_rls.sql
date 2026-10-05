-- Run: psql "$DATABASE_URL" -f backend/db/migrations/006_enable_rls.sql
-- Supabase exposes every table in the public schema through its REST API (PostgREST) with the
-- publishable (anon) key. With RLS enabled and NO policies, the anon and authenticated roles see
-- and change nothing. The backend connects as the table owner (postgres), and RLS does not apply
-- to table owners unless FORCE ROW LEVEL SECURITY is set, so the backend is unaffected.
-- Idempotent: enabling RLS on a table that already has it is a no-op.
ALTER TABLE urls          ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_keys      ENABLE ROW LEVEL SECURITY;
ALTER TABLE clicks        ENABLE ROW LEVEL SECURITY;
ALTER TABLE clicks_daily  ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE stripe_events ENABLE ROW LEVEL SECURITY;
