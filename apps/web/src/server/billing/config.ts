import { BILLING_PLANS, type BillingPlanKey } from "../../lib/billing-plans";

export type BillingEnvironment = "sandbox" | "production";
export type HostingMode = "self_hosted" | "hosted";

export type BillingEnvironmentConfig = Pick<
  import("../../types").Env,
  | "YAAP_HOSTING_MODE"
  | "POLAR_ENVIRONMENT"
  | "POLAR_ACCESS_TOKEN"
  | "POLAR_WEBHOOK_SECRET"
  | "POLAR_PRODUCT_IDS"
>;

export type BillingConfig =
  | { mode: "self_hosted" }
  | {
      mode: "hosted";
      environment: BillingEnvironment;
      accessToken: string;
      webhookSecret: string;
      productIds: Readonly<Record<BillingPlanKey, string>>;
    };

const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function required(value: string | undefined, name: string) {
  const normalized = value?.trim();
  if (!normalized) throw new Error(`${name} is required in hosted mode`);
  return normalized;
}

function productMapping(value: string | undefined) {
  let parsed: unknown;
  try {
    parsed = JSON.parse(required(value, "POLAR_PRODUCT_IDS"));
  } catch (error) {
    if (error instanceof SyntaxError)
      throw new Error("POLAR_PRODUCT_IDS must be valid JSON");
    throw error;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
    throw new Error("POLAR_PRODUCT_IDS must be a JSON object");
  const record = parsed as Record<string, unknown>;
  const expected = BILLING_PLANS.map((plan) => plan.key);
  if (
    Object.keys(record).length !== expected.length ||
    Object.keys(record).some((key) => !expected.includes(key as BillingPlanKey))
  )
    throw new Error("POLAR_PRODUCT_IDS must map every supported plan exactly");
  const entries = expected.map((key) => {
    const productId = record[key];
    if (typeof productId !== "string" || !uuid.test(productId))
      throw new Error(`POLAR_PRODUCT_IDS has an invalid ${key} product ID`);
    return [key, productId] as const;
  });
  if (
    new Set(entries.map(([, productId]) => productId)).size !== entries.length
  )
    throw new Error("POLAR_PRODUCT_IDS cannot reuse a product ID");
  return Object.freeze(Object.fromEntries(entries)) as Readonly<
    Record<BillingPlanKey, string>
  >;
}

export function billingConfig(env: BillingEnvironmentConfig): BillingConfig {
  const mode = env.YAAP_HOSTING_MODE?.trim() || "self_hosted";
  if (mode === "self_hosted") return { mode };
  if (mode !== "hosted") throw new Error("Invalid YAAP_HOSTING_MODE");
  const environment = required(env.POLAR_ENVIRONMENT, "POLAR_ENVIRONMENT");
  if (environment !== "sandbox" && environment !== "production")
    throw new Error("Invalid POLAR_ENVIRONMENT");
  return {
    mode,
    environment,
    accessToken: required(env.POLAR_ACCESS_TOKEN, "POLAR_ACCESS_TOKEN"),
    webhookSecret: required(env.POLAR_WEBHOOK_SECRET, "POLAR_WEBHOOK_SECRET"),
    productIds: productMapping(env.POLAR_PRODUCT_IDS),
  };
}
