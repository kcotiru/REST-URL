export interface SubscriptionRow {
  userId: string;
  stripeCustomerId: string;
  stripeSubscriptionId: string | null;
  plan: "free" | "pro";
  status: string;
  currentPeriodEnd: Date | null;
}

export interface BillingDTO {
  plan: "free" | "pro";
  status: string;
  currentPeriodEnd: Date | null;
  usage: { linksThisMonth: number; linksPerMonth: number };
}

// The Stripe subscription's current state, as written by the webhook.
export interface SubscriptionState {
  userId: string;
  stripeCustomerId: string;
  stripeSubscriptionId: string;
  plan: "free" | "pro";
  status: string;
  currentPeriodEnd: Date | null;
}
