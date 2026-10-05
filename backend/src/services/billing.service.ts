import type Redis from "ioredis";
import type Stripe from "stripe";
import { SubscriptionRepository } from "../repositories/subscription.repository";
import { UrlRepository } from "../repositories/url.repository";
import { BillingDTO, SubscriptionRow, SubscriptionState } from "../types/billing.types";
import { FRONTEND_ORIGIN, PlanId, PLANS, PRO_STATUSES } from "../config/plans";
import { STRIPE_PRICE_PRO, STRIPE_WEBHOOK_SECRET } from "../config/stripe";
import { ConflictError, NotFoundError, ValidationError } from "../utils/errors";

const PLAN_TTL_SECONDS = 60;
const planKey = (userId: string) => `plan:${userId}`;

const planOf = (row: SubscriptionRow | null): PlanId =>
  row?.plan === "pro" && PRO_STATUSES.includes(row.status) ? "pro" : "free";

const idOf = (x: string | { id: string } | null | undefined): string | undefined => (typeof x === "string" ? x : x?.id);

export class BillingService {
  constructor(
    private subscriptions: SubscriptionRepository,
    private urls: UrlRepository,
    private redis: Redis,
    private stripe: Stripe,
  ) {}

  // Called on every API request (rate limiter), hence the short Redis cache. Redis is a cache
  // only: any failure is logged and falls open to the DB. The webhook DELs the key after commit.
  async getPlan(userId: string): Promise<PlanId> {
    try {
      const hit = await this.redis.get(planKey(userId));
      if (hit === "free" || hit === "pro") return hit;
    } catch (err) {
      console.error("Redis GET failed, falling back to DB:", err);
    }
    const plan = planOf(await this.subscriptions.findByUser(userId));
    try {
      await this.redis.set(planKey(userId), plan, "EX", PLAN_TTL_SECONDS);
    } catch (err) {
      console.error("Redis SET failed:", err);
    }
    return plan;
  }

  async getBilling(userId: string): Promise<BillingDTO> {
    const row = await this.subscriptions.findByUser(userId);
    const plan = planOf(row);
    return {
      plan,
      status: row?.status ?? "none",
      currentPeriodEnd: row?.currentPeriodEnd ?? null,
      usage: { linksThisMonth: await this.urls.countThisMonth(userId), linksPerMonth: PLANS[plan].linksPerMonth },
    };
  }

  async checkout(userId: string, email?: string): Promise<{ url: string | null }> {
    if ((await this.getPlan(userId)) === "pro") {
      throw new ConflictError("Already subscribed — use the billing portal");
    }
    let customer = (await this.subscriptions.findByUser(userId))?.stripeCustomerId;
    if (!customer) {
      // The idempotency key makes two concurrent first checkouts share one Stripe customer.
      const created = await this.stripe.customers.create({ email, metadata: { userId } }, { idempotencyKey: `customer-${userId}` });
      customer = created.id;
      await this.subscriptions.createCustomer(userId, customer);
    }
    // The success redirect is NOT trusted for plan state: only the webhook changes it.
    const session = await this.stripe.checkout.sessions.create({
      mode: "subscription",
      customer,
      line_items: [{ price: STRIPE_PRICE_PRO, quantity: 1 }],
      client_reference_id: userId,
      subscription_data: { metadata: { userId } },
      success_url: `${FRONTEND_ORIGIN}/billing?checkout=success`,
      cancel_url: `${FRONTEND_ORIGIN}/billing?checkout=cancel`,
    });
    return { url: session.url };
  }

  async portal(userId: string): Promise<{ url: string }> {
    const row = await this.subscriptions.findByUser(userId);
    if (!row) throw new NotFoundError("No billing account yet");
    const session = await this.stripe.billingPortal.sessions.create({
      customer: row.stripeCustomerId,
      return_url: `${FRONTEND_ORIGIN}/billing`,
    });
    return { url: session.url };
  }

  // Returns true for a duplicate delivery. Throws ValidationError (400) on a bad signature;
  // any other error propagates (500), so Stripe retries.
  async handleWebhook(rawBody: Buffer, signature: string | undefined): Promise<boolean> {
    let event: Stripe.Event;
    try {
      event = this.stripe.webhooks.constructEvent(rawBody, signature ?? "", STRIPE_WEBHOOK_SECRET);
    } catch {
      throw new ValidationError("Invalid webhook signature");
    }

    // Unhandled types (and checkouts without a subscription) are ignored and not recorded.
    const ref = this.subscriptionRef(event);
    if (!ref) return false;
    if (await this.subscriptions.hasEvent(event.id)) return true;

    // Stripe does not guarantee event order, so every handled event re-fetches the subscription
    // and we write its CURRENT state instead of applying a delta from the event payload.
    // This fetch happens before the DB transaction so no connection is held during the network call.
    const sub = await this.stripe.subscriptions.retrieve(ref.subscriptionId);
    const stripeCustomerId = idOf(sub.customer)!;
    const userId = ref.userId ?? sub.metadata?.userId ?? (await this.subscriptions.findUserIdByCustomer(stripeCustomerId));
    if (!userId) {
      console.warn(`Stripe event ${event.id}: no user for subscription ${sub.id}, ignored`);
      return false;
    }
    // In current API versions the period end lives on the subscription items, not the subscription.
    const periodEnd = sub.items.data[0]?.current_period_end;
    const state: SubscriptionState = {
      userId,
      stripeCustomerId,
      stripeSubscriptionId: sub.id,
      plan: sub.items.data.some((i) => i.price.id === STRIPE_PRICE_PRO) && PRO_STATUSES.includes(sub.status) ? "pro" : "free",
      status: sub.status,
      currentPeriodEnd: periodEnd ? new Date(periodEnd * 1000) : null,
    };
    // ponytail: two near-simultaneous events for one user can commit out of fetch order, leaving slightly
    // older state until the next event; upgrade to a per-subscription version compare.
    if (!(await this.subscriptions.applyEvent(event.id, state))) return true;

    try {
      await this.redis.del(planKey(userId));
    } catch (err) {
      console.error("Redis DEL failed, plan may be stale until TTL:", err);
    }
    return false;
  }

  private subscriptionRef(event: Stripe.Event): { subscriptionId: string; userId?: string } | null {
    switch (event.type) {
      case "checkout.session.completed": {
        const subscriptionId = idOf(event.data.object.subscription);
        return subscriptionId ? { subscriptionId, userId: event.data.object.client_reference_id ?? undefined } : null;
      }
      case "customer.subscription.updated":
      case "customer.subscription.deleted":
        return { subscriptionId: event.data.object.id };
      case "invoice.payment_failed": {
        const subscriptionId = idOf(event.data.object.parent?.subscription_details?.subscription);
        return subscriptionId ? { subscriptionId } : null;
      }
      default:
        return null;
    }
  }
}
