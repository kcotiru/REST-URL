import { Pool } from "pg";
import { SubscriptionRow, SubscriptionState } from "../types/billing.types";

export class SubscriptionRepository {
  constructor(private db: Pool) {}

  async findByUser(userId: string): Promise<SubscriptionRow | null> {
    const { rows } = await this.db.query<SubscriptionRow>(
      `SELECT "userId", "stripeCustomerId", "stripeSubscriptionId", plan, status, "currentPeriodEnd"
       FROM subscriptions WHERE "userId" = $1`,
      [userId],
    );
    return rows[0] ?? null;
  }

  async findUserIdByCustomer(stripeCustomerId: string): Promise<string | null> {
    const { rows } = await this.db.query<{ userId: string }>(
      `SELECT "userId" FROM subscriptions WHERE "stripeCustomerId" = $1`,
      [stripeCustomerId],
    );
    return rows[0]?.userId ?? null;
  }

  // First checkout: remember the Stripe customer (free, no subscription yet). Never overwrites.
  async createCustomer(userId: string, stripeCustomerId: string): Promise<void> {
    await this.db.query(
      `INSERT INTO subscriptions ("userId", "stripeCustomerId") VALUES ($1, $2) ON CONFLICT ("userId") DO NOTHING`,
      [userId, stripeCustomerId],
    );
  }

  // Fast path so a redelivery skips the Stripe fetch; applyEvent below is the authoritative check.
  async hasEvent(eventId: string): Promise<boolean> {
    const { rowCount } = await this.db.query(`SELECT 1 FROM stripe_events WHERE id = $1`, [eventId]);
    return (rowCount ?? 0) > 0;
  }

  // Records the event and applies its state in ONE transaction. If they were separate, a crash
  // between them would either lose the update (event recorded, state not: Stripe's retry is
  // then dropped as a duplicate) or apply it twice. Returns false for an already-seen event
  // (state untouched); on any error everything rolls back, so Stripe's retry reprocesses it.
  async applyEvent(eventId: string, s: SubscriptionState): Promise<boolean> {
    const client = await this.db.connect();
    try {
      await client.query("BEGIN");
      const ins = await client.query(`INSERT INTO stripe_events (id) VALUES ($1) ON CONFLICT DO NOTHING`, [eventId]);
      if (ins.rowCount === 0) {
        await client.query("COMMIT");
        return false;
      }
      // The customer id is only set on first insert; later events never rewrite it.
      await client.query(
        `INSERT INTO subscriptions ("userId", "stripeCustomerId", "stripeSubscriptionId", plan, status, "currentPeriodEnd")
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT ("userId") DO UPDATE SET
           "stripeSubscriptionId" = EXCLUDED."stripeSubscriptionId", plan = EXCLUDED.plan,
           status = EXCLUDED.status, "currentPeriodEnd" = EXCLUDED."currentPeriodEnd", "updatedAt" = now()`,
        [s.userId, s.stripeCustomerId, s.stripeSubscriptionId, s.plan, s.status, s.currentPeriodEnd],
      );
      await client.query("COMMIT");
      return true;
    } catch (err) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }
}
