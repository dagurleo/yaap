export const BILLING_CATALOG_VERSION = 1 as const;

export const BILLING_PLANS = [
  {
    key: "hosted_100k_monthly_v1",
    version: BILLING_CATALOG_VERSION,
    currency: "USD",
    interval: "month",
    quantity: 1,
    monthlyPriceCents: 900,
    eventAllowance: 100_000,
    admissionCeiling: 110_000,
  },
  {
    key: "hosted_500k_monthly_v1",
    version: BILLING_CATALOG_VERSION,
    currency: "USD",
    interval: "month",
    quantity: 1,
    monthlyPriceCents: 1_900,
    eventAllowance: 500_000,
    admissionCeiling: 550_000,
  },
  {
    key: "hosted_1m_monthly_v1",
    version: BILLING_CATALOG_VERSION,
    currency: "USD",
    interval: "month",
    quantity: 1,
    monthlyPriceCents: 2_900,
    eventAllowance: 1_000_000,
    admissionCeiling: 1_100_000,
  },
  {
    key: "hosted_2m_monthly_v1",
    version: BILLING_CATALOG_VERSION,
    currency: "USD",
    interval: "month",
    quantity: 1,
    monthlyPriceCents: 4_900,
    eventAllowance: 2_000_000,
    admissionCeiling: 2_200_000,
  },
  {
    key: "hosted_5m_monthly_v1",
    version: BILLING_CATALOG_VERSION,
    currency: "USD",
    interval: "month",
    quantity: 1,
    monthlyPriceCents: 9_900,
    eventAllowance: 5_000_000,
    admissionCeiling: 5_500_000,
  },
  {
    key: "hosted_10m_monthly_v1",
    version: BILLING_CATALOG_VERSION,
    currency: "USD",
    interval: "month",
    quantity: 1,
    monthlyPriceCents: 14_900,
    eventAllowance: 10_000_000,
    admissionCeiling: 11_000_000,
  },
] as const;

export type BillingPlan = (typeof BILLING_PLANS)[number];
export type BillingPlanKey = BillingPlan["key"];

const plansByKey = new Map<BillingPlanKey, BillingPlan>(
  BILLING_PLANS.map((plan) => [plan.key, Object.freeze(plan)]),
);
Object.freeze(BILLING_PLANS);

export function isBillingPlanKey(value: unknown): value is BillingPlanKey {
  return typeof value === "string" && plansByKey.has(value as BillingPlanKey);
}

export function billingPlan(key: BillingPlanKey): BillingPlan {
  return plansByKey.get(key)!;
}
