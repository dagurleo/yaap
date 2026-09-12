import type { BillingPlanKey } from "../../lib/billing-plans";

export type CollectionPauseReason =
  | "quota_exhausted"
  | "trial_expired"
  | "payment_required"
  | "provider_confirmation_required"
  | null;

export type BillingEntitlementState =
  | "self_hosted"
  | "unprovisioned"
  | "trial_active"
  | "trial_grace"
  | "paid_active"
  | "payment_grace"
  | "quota_exhausted"
  | "checkout_pending"
  | "provider_confirmation_required"
  | "service_ended";

export interface LocalBillingState {
  trial?: { startsAt: number; endsAt: number; graceEndsAt: number };
  subscription?: {
    status: "active" | "past_due" | "canceled" | "revoked" | "incomplete";
    planKey: BillingPlanKey;
    currentPeriodStartsAt: number;
    currentPeriodEndsAt: number;
    paidThroughAt: number;
    paymentGraceEndsAt?: number | null;
  };
  usage?: {
    source: "trial" | "subscription";
    planKey?: BillingPlanKey | null;
    startsAt: number;
    endsAt: number;
    allowance: number;
    admissionCeiling: number;
    persisted: number;
    reserved: number;
  };
  checkoutPending?: boolean;
  recoveryEndsAt?: number | null;
}

export interface BillingEntitlements {
  state: BillingEntitlementState;
  canCollect: boolean;
  canReadRetainedReports: boolean;
  canManageAnalytics: boolean;
  canManageBilling: boolean;
  collectionPauseReason: CollectionPauseReason;
  planKey: BillingPlanKey | null;
  period: LocalBillingState["usage"] | null;
  usageRatio: number | null;
  warningThreshold: 80 | 100 | null;
}

const within = (now: number, start: number, end: number) =>
  now >= start && now < end;

export function resolveEntitlements(
  mode: "self_hosted" | "hosted",
  state: LocalBillingState,
  now = Date.now(),
): BillingEntitlements {
  if (mode === "self_hosted")
    return {
      state: "self_hosted",
      canCollect: true,
      canReadRetainedReports: true,
      canManageAnalytics: true,
      canManageBilling: false,
      collectionPauseReason: null,
      planKey: null,
      period: null,
      usageRatio: null,
      warningThreshold: null,
    };

  const subscription = state.subscription;
  const paidActive =
    subscription?.status === "active" &&
    within(
      now,
      subscription.currentPeriodStartsAt,
      subscription.currentPeriodEndsAt,
    ) &&
    now < subscription.paidThroughAt;
  const paymentGrace =
    subscription?.status === "past_due" &&
    within(
      now,
      subscription.currentPeriodStartsAt,
      subscription.currentPeriodEndsAt,
    ) &&
    !!subscription.paymentGraceEndsAt &&
    now < subscription.paymentGraceEndsAt;
  const trialActive =
    !paidActive &&
    !paymentGrace &&
    !!state.trial &&
    within(now, state.trial.startsAt, state.trial.endsAt);
  const trialGrace =
    !paidActive &&
    !paymentGrace &&
    !!state.trial &&
    now >= state.trial.endsAt &&
    now < state.trial.graceEndsAt;
  const expectedSource = paidActive || paymentGrace ? "subscription" : "trial";
  const period =
    (paidActive || paymentGrace || trialActive || trialGrace) &&
    state.usage?.source === expectedSource &&
    within(now, state.usage.startsAt, state.usage.endsAt)
      ? state.usage
      : null;
  const admitted = period ? period.persisted + period.reserved : 0;
  const quotaExhausted = !!period && admitted >= period.admissionCeiling;
  const hasVerifiedService =
    paidActive || paymentGrace || trialActive || trialGrace;
  const periodMissing = hasVerifiedService && !period;
  const canCollect = hasVerifiedService && !!period && !quotaExhausted;
  const planKey =
    paidActive || paymentGrace
      ? (subscription?.planKey ?? null)
      : (period?.planKey ?? null);
  const usageRatio = period ? admitted / period.allowance : null;
  const canReadRetainedReports =
    hasVerifiedService ||
    (!!state.recoveryEndsAt && now < state.recoveryEndsAt);

  let entitlementState: BillingEntitlementState;
  let collectionPauseReason: CollectionPauseReason = null;
  if (quotaExhausted) {
    entitlementState = "quota_exhausted";
    collectionPauseReason = "quota_exhausted";
  } else if (periodMissing) {
    entitlementState = "provider_confirmation_required";
    collectionPauseReason = "provider_confirmation_required";
  } else if (paymentGrace) {
    entitlementState = "payment_grace";
  } else if (paidActive) {
    entitlementState = "paid_active";
  } else if (trialActive) {
    entitlementState = "trial_active";
  } else if (trialGrace) {
    entitlementState = "trial_grace";
  } else if (state.checkoutPending) {
    entitlementState = "checkout_pending";
    collectionPauseReason = "provider_confirmation_required";
  } else if (state.trial || state.subscription) {
    entitlementState = "service_ended";
    collectionPauseReason = state.trial ? "trial_expired" : "payment_required";
  } else {
    entitlementState = "unprovisioned";
    collectionPauseReason = "provider_confirmation_required";
  }

  return {
    state: entitlementState,
    canCollect,
    canReadRetainedReports,
    canManageAnalytics: hasVerifiedService,
    canManageBilling: true,
    collectionPauseReason,
    planKey,
    period,
    usageRatio,
    warningThreshold:
      usageRatio === null
        ? null
        : usageRatio >= 1
          ? 100
          : usageRatio >= 0.8
            ? 80
            : null,
  };
}
