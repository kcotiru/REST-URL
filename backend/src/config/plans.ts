export const PLANS = {
  free: { linksPerMonth: 50, apiRequestsPerMinute: 60, analyticsDays: 30 },
  pro: { linksPerMonth: 5000, apiRequestsPerMinute: 600, analyticsDays: 365 },
} as const;

export type PlanId = keyof typeof PLANS;

// ponytail: everyone is free for now, Phase 5 reads the user's row from `subscriptions`.
export const getUserPlan = async (_userId: string): Promise<PlanId> => "free";

// Raw clicks are purged after this many days (worker); only the daily rollup outlives it.
export const RAW_CLICK_DAYS = 30;
