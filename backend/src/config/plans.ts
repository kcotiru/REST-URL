export const PLANS = {
  free: { linksPerMonth: 50, apiRequestsPerMinute: 60, analyticsDays: 30 },
  pro: { linksPerMonth: 5000, apiRequestsPerMinute: 600, analyticsDays: 365 },
} as const;

// Display only (USD per month, shown on the pricing page). Stripe's price object (STRIPE_PRICE_PRO)
// is the billing source of truth: changing this number does not change what anyone is charged.
export const PLAN_PRICE_USD_MONTHLY = { free: 0, pro: 9 } as const;

export type PlanId = keyof typeof PLANS;

// past_due keeps Pro while Stripe retries the payment; the user is downgraded when the
// subscription becomes canceled/unpaid (customer.subscription.deleted).
export const PRO_STATUSES = ["active", "trialing", "past_due"];

// Raw clicks are purged after this many days (worker); only the daily rollup outlives it.
export const RAW_CLICK_DAYS = 30;

export const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || "http://localhost:5173";
