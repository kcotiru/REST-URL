-- Run: psql "$DATABASE_URL" -f backend/db/migrations/005_billing.sql
-- One row per user, written ONLY by the Stripe webhook (plus the customer row at first checkout).
-- stripe_events records processed event ids so a redelivered event is a no-op.
CREATE TABLE IF NOT EXISTS subscriptions (
  "userId"               uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  "stripeCustomerId"     text NOT NULL UNIQUE,
  "stripeSubscriptionId" text UNIQUE,
  plan                   text NOT NULL DEFAULT 'free' CHECK (plan IN ('free', 'pro')),
  status                 text NOT NULL DEFAULT 'none',
  "currentPeriodEnd"     timestamptz,
  "updatedAt"            timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS stripe_events (
  id            text PRIMARY KEY,
  "receivedAt"  timestamptz NOT NULL DEFAULT now()
);
