import { useEffect, useMemo, useState } from "react";
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  ArrowLeft,
  ArrowUpRight,
  Check,
  CircleGauge,
  CreditCard,
} from "lucide-react";
import { HeaderAccount } from "@/components/account-menu";
import { Button } from "@/components/ui/button";
import type { BillingPlanKey } from "@/lib/billing-plans";
import type { BillingEntitlementState } from "@/server/billing/entitlements";
import { billingPortalFn, checkoutFn, reconcileBillingFn } from "./functions";
import { billingQuery } from "./queries";

type BillingSearch = {
  billing?: "pending" | "cancelled" | "return";
};

const statusCopy: Record<
  BillingEntitlementState,
  { label: string; description: string; tone: "neutral" | "good" | "warning" }
> = {
  self_hosted: {
    label: "Self-hosted",
    description: "Collection is managed by this installation.",
    tone: "neutral",
  },
  unprovisioned: {
    label: "Setup required",
    description: "Choose a plan to start collecting analytics.",
    tone: "warning",
  },
  trial_active: {
    label: "Trial active",
    description: "Analytics collection is active during your trial.",
    tone: "good",
  },
  trial_grace: {
    label: "Trial grace",
    description:
      "Your trial has ended, but collection remains active during the three-day grace period.",
    tone: "warning",
  },
  paid_active: {
    label: "Active",
    description: "Your subscription and analytics collection are active.",
    tone: "good",
  },
  payment_grace: {
    label: "Payment issue",
    description: "Collection remains active during the payment grace period.",
    tone: "warning",
  },
  quota_exhausted: {
    label: "Limit reached",
    description: "Collection is paused until the next period or a plan change.",
    tone: "warning",
  },
  checkout_pending: {
    label: "Checkout pending",
    description: "We are waiting for confirmation from the billing provider.",
    tone: "warning",
  },
  provider_confirmation_required: {
    label: "Confirmation required",
    description:
      "Billing state needs confirmation before collection can resume.",
    tone: "warning",
  },
  service_ended: {
    label: "Service ended",
    description: "Choose a plan to resume analytics collection.",
    tone: "warning",
  },
};

const eventFormatter = new Intl.NumberFormat("en-US");
const compactEventFormatter = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 1,
});
const dateFormatter = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  year: "numeric",
});

function formatPrice(cents: number, currency: string) {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency,
    maximumFractionDigits: cents % 100 ? 2 : 0,
  }).format(cents / 100);
}

function formatDate(value: number) {
  return dateFormatter.format(new Date(value));
}

export function BillingPage({ search }: { search: BillingSearch }) {
  const { data } = useSuspenseQuery(billingQuery());
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const initialPlan = data.entitlements.planKey ?? data.plans[0]?.key;
  const [selectedPlan, setSelectedPlan] = useState<BillingPlanKey | undefined>(
    initialPlan,
  );
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [reconcileState, setReconcileState] = useState<
    "idle" | "checking" | "complete" | "delayed"
  >(
    search.billing === "pending" || search.billing === "return"
      ? "checking"
      : "idle",
  );

  useEffect(() => {
    if (!selectedPlan && data.plans[0]) setSelectedPlan(data.plans[0].key);
  }, [data.plans, selectedPlan]);

  useEffect(() => {
    if (
      (search.billing !== "pending" && search.billing !== "return") ||
      reconcileState !== "checking"
    )
      return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let attempts = 0;

    const reconcile = async () => {
      attempts += 1;
      try {
        const result = await reconcileBillingFn();
        await queryClient.invalidateQueries({ queryKey: ["billing"] });
        if (cancelled) return;
        if (result.state === "current") {
          setReconcileState("complete");
          setMessage("Billing confirmation received.");
          void navigate({ to: "/app/billing", search: {}, replace: true });
          return;
        }
      } catch {
        // Webhooks can arrive after the customer returns. Retry for a bounded period.
      }
      if (cancelled) return;
      if (attempts >= 15) {
        setReconcileState("delayed");
        return;
      }
      timer = setTimeout(() => void reconcile(), 2_000);
    };

    void reconcile();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [navigate, queryClient, reconcileState, search.billing]);

  const checkout = useMutation({
    mutationFn: (planKey: BillingPlanKey) =>
      checkoutFn({ data: { planKey, operationKey: crypto.randomUUID() } }),
    onSuccess: ({ checkoutUrl }) => window.location.assign(checkoutUrl),
    onError: (reason) =>
      setError(
        reason instanceof Error ? reason.message : "Could not start checkout",
      ),
  });
  const portal = useMutation({
    mutationFn: () => billingPortalFn(),
    onSuccess: ({ portalUrl }) => window.location.assign(portalUrl),
    onError: (reason) =>
      setError(
        reason instanceof Error ? reason.message : "Could not open billing",
      ),
  });

  const period = data.entitlements.period;
  const admitted = period ? period.persisted + period.reserved : 0;
  const usagePercent = period
    ? Math.min(100, Math.round((admitted / period.allowance) * 100))
    : 0;
  const subscription = "subscription" in data ? data.subscription : null;
  const siteUsage = "siteUsage" in data ? (data.siteUsage ?? []) : [];
  const syncState = "syncState" in data ? data.syncState : "current";
  const subscribed =
    !!subscription && !["canceled", "revoked"].includes(subscription.status);
  const displayedPlanKey =
    data.entitlements.planKey ??
    (subscribed && data.plans.some((plan) => plan.key === subscription.planKey)
      ? (subscription.planKey as BillingPlanKey)
      : null);
  const currentPlan = useMemo(
    () => data.plans.find((plan) => plan.key === displayedPlanKey),
    [data.plans, displayedPlanKey],
  );
  const status = statusCopy[data.entitlements.state];
  const canCheckout =
    data.mode === "hosted" &&
    !subscribed &&
    !!selectedPlan &&
    !checkout.isPending;

  function dismissNotice() {
    setMessage("");
    setReconcileState("idle");
    void navigate({ to: "/app/billing", search: {}, replace: true });
  }

  return (
    <main className="billing-page mx-auto max-w-5xl px-5 pt-5 pb-16 sm:px-8">
      <header className="flex items-center justify-between gap-4">
        <Link to="/app" className="inline-flex items-center gap-2 text-sm">
          <ArrowLeft aria-hidden="true" size={16} /> All websites
        </Link>
        <HeaderAccount />
      </header>

      <div className="mt-10 flex flex-col items-start justify-between gap-5 border-b pb-7 sm:flex-row sm:items-end">
        <div>
          <h1 className="text-2xl font-semibold">Billing</h1>
          <p className="mt-2 max-w-2xl text-base text-muted-foreground sm:text-sm">
            Plan, usage, and payment settings for every website in your account.
          </p>
        </div>
        {data.mode === "hosted" && subscription && (
          <Button
            variant={subscribed ? "primary" : "default"}
            disabled={portal.isPending}
            onClick={() => {
              setError("");
              portal.mutate();
            }}
          >
            <CreditCard aria-hidden="true" />
            {portal.isPending ? "Opening…" : "Manage billing"}
            <ArrowUpRight aria-hidden="true" />
          </Button>
        )}
      </div>

      {(search.billing === "cancelled" ||
        search.billing === "return" ||
        reconcileState !== "idle" ||
        message) && (
        <div
          className="mt-6 flex items-start justify-between gap-4 rounded-lg border bg-card px-4 py-3 text-sm"
          role="status"
          aria-live="polite"
        >
          <div>
            <p className="font-medium">
              {reconcileState === "checking"
                ? search.billing === "return"
                  ? "Refreshing billing details…"
                  : "Confirming your subscription…"
                : reconcileState === "delayed"
                  ? "Confirmation is taking longer than expected"
                  : search.billing === "cancelled"
                    ? "Checkout cancelled"
                    : message || "Billing settings updated"}
            </p>
            <p className="mt-1 text-muted-foreground">
              {reconcileState === "checking"
                ? search.billing === "return"
                  ? "Checking the latest subscription and payment status."
                  : "You can leave this page; collection updates automatically after confirmation."
                : reconcileState === "delayed"
                  ? "No payment was assumed. Refresh later; completed checkouts activate after provider confirmation."
                  : search.billing === "cancelled"
                    ? "Nothing was charged. Your current service remains unchanged."
                    : "The latest account state is shown below."}
            </p>
          </div>
          {reconcileState !== "checking" && (
            <Button variant="ghost" size="sm" onClick={dismissNotice}>
              Dismiss
            </Button>
          )}
        </div>
      )}

      {(error || portal.error) && (
        <p
          role="alert"
          className="mt-6 rounded-lg border border-destructive px-4 py-3 text-sm text-destructive"
        >
          {error}
        </p>
      )}

      {data.mode === "self_hosted" ? (
        <section className="py-10" aria-labelledby="billing-status-heading">
          <div className="flex items-start gap-3">
            <CircleGauge
              className="mt-0.5 size-5 text-primary"
              aria-hidden="true"
            />
            <div>
              <h2 id="billing-status-heading" className="font-semibold">
                Billing is managed by this installation
              </h2>
              <p className="mt-2 max-w-2xl text-base text-muted-foreground sm:text-sm">
                Hosted plans and payment controls are disabled. Analytics
                collection remains available without an account subscription.
              </p>
            </div>
          </div>
        </section>
      ) : (
        <>
          <section className="grid gap-7 border-b py-8 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.65fr)]">
            <div>
              <div className="flex flex-wrap items-center gap-3">
                <h2 className="font-semibold">Account status</h2>
                <span className="billing-status-badge" data-tone={status.tone}>
                  {status.label}
                </span>
              </div>
              <p className="mt-2 text-base text-muted-foreground sm:text-sm">
                {status.description}
              </p>
              <dl className="mt-6 grid gap-4 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-muted-foreground">Current plan</dt>
                  <dd className="mt-1 font-medium">
                    {currentPlan
                      ? `${compactEventFormatter.format(currentPlan.eventAllowance)} events`
                      : period?.source === "trial"
                        ? "Hosted trial"
                        : "No plan"}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Collection</dt>
                  <dd className="mt-1 font-medium">
                    {data.entitlements.canCollect ? "Active" : "Paused"}
                  </dd>
                </div>
                {period && (
                  <>
                    <div>
                      <dt className="text-muted-foreground">Period starts</dt>
                      <dd className="mt-1 font-medium">
                        {formatDate(period.startsAt)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Period ends</dt>
                      <dd className="mt-1 font-medium">
                        {formatDate(period.endsAt)}
                      </dd>
                    </div>
                  </>
                )}
              </dl>
            </div>

            <div className="lg:border-l lg:pl-7">
              <div className="flex items-baseline justify-between gap-4">
                <h2 className="font-semibold">Usage</h2>
                {period && (
                  <span className="text-sm font-medium">{usagePercent}%</span>
                )}
              </div>
              {period ? (
                <>
                  <div
                    className="mt-4 h-2 overflow-hidden rounded-full bg-secondary"
                    role="progressbar"
                    aria-label="Monthly event usage"
                    aria-valuemin={0}
                    aria-valuemax={period.allowance}
                    aria-valuenow={Math.min(admitted, period.allowance)}
                  >
                    <div
                      className="h-full rounded-full bg-primary transition-[width]"
                      style={{ width: `${usagePercent}%` }}
                    />
                  </div>
                  <p className="mt-3 text-base sm:text-sm">
                    <strong>{eventFormatter.format(admitted)}</strong>{" "}
                    <span className="text-muted-foreground">
                      of {eventFormatter.format(period.allowance)} events
                    </span>
                  </p>
                  {period.reserved > 0 && (
                    <p className="mt-1 text-sm text-muted-foreground">
                      {eventFormatter.format(period.reserved)} events are still
                      processing.
                    </p>
                  )}
                  {admitted >= period.allowance &&
                    admitted < period.admissionCeiling && (
                      <p className="mt-2 text-sm text-amber-600 dark:text-amber-400">
                        Included events used. Collection remains active until{" "}
                        {eventFormatter.format(period.admissionCeiling)}; choose
                        a larger plan before then to avoid a pause.
                      </p>
                    )}
                  {admitted >= period.allowance * 0.8 &&
                    admitted < period.allowance && (
                      <p className="mt-2 text-sm text-muted-foreground">
                        You’re approaching this period’s included event limit.
                      </p>
                    )}
                </>
              ) : (
                <p className="mt-3 text-base text-muted-foreground sm:text-sm">
                  Usage appears after a trial or subscription period starts.
                </p>
              )}
            </div>
          </section>

          {siteUsage.length > 0 && period && (
            <section
              className="border-b py-8"
              aria-labelledby="site-usage-heading"
            >
              <div className="flex items-baseline justify-between gap-4">
                <div>
                  <h2 id="site-usage-heading" className="font-semibold">
                    Usage by website
                  </h2>
                  <p className="mt-1 text-base text-muted-foreground sm:text-sm">
                    Persisted events in the current period.
                  </p>
                </div>
                <span className="text-sm text-muted-foreground">
                  {siteUsage.length}{" "}
                  {siteUsage.length === 1 ? "website" : "websites"}
                </span>
              </div>
              <ul className="mt-5 divide-y" role="list">
                {siteUsage.map((site) => (
                  <li
                    key={site.siteId}
                    className="flex items-center justify-between gap-4 py-3 text-sm"
                  >
                    <span className="min-w-0 truncate font-medium">
                      {site.siteLabel}
                    </span>
                    <span className="shrink-0 text-muted-foreground">
                      {eventFormatter.format(site.persisted)}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section
            className="billing-plan-section py-8"
            aria-labelledby="plans-heading"
          >
            <div>
              <h2 id="plans-heading" className="font-semibold">
                {subscribed ? "Hosted plans" : "Choose a plan"}
              </h2>
              <p className="mt-1 max-w-2xl text-base text-muted-foreground sm:text-sm">
                {subscribed
                  ? "Your current plan is marked below. Use the billing portal for payment details and subscription changes."
                  : "All plans include every analytics feature. Choose by monthly event volume."}
              </p>
            </div>

            <fieldset className="billing-plan-grid mt-6">
              <legend className="sr-only">Monthly event plan</legend>
              {data.plans.map((plan) => {
                const current = plan.key === displayedPlanKey;
                const selected = plan.key === selectedPlan;
                return (
                  <label
                    key={plan.key}
                    className="billing-plan-option"
                    data-selected={!subscribed && selected}
                    data-current={current}
                  >
                    <input
                      type="radio"
                      name="billing-plan"
                      value={plan.key}
                      checked={subscribed ? current : selected}
                      disabled={subscribed}
                      onChange={() => setSelectedPlan(plan.key)}
                    />
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="flex items-center justify-between gap-3">
                        <strong className="text-base">
                          {compactEventFormatter.format(plan.eventAllowance)}{" "}
                          events
                        </strong>
                        {current && (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-primary">
                            <Check aria-hidden="true" size={14} /> Current
                          </span>
                        )}
                      </span>
                      <span className="mt-4 text-2xl font-semibold tracking-tight">
                        {formatPrice(plan.monthlyPriceCents, plan.currency)}
                        <span className="ml-1 text-sm font-normal text-muted-foreground">
                          / month
                        </span>
                      </span>
                      <span className="mt-2 text-sm text-muted-foreground">
                        Collection continues up to{" "}
                        {compactEventFormatter.format(plan.admissionCeiling)}{" "}
                        events.
                      </span>
                    </span>
                  </label>
                );
              })}
            </fieldset>

            {!subscribed && (
              <div className="mt-7 flex flex-col items-start gap-3 sm:flex-row sm:items-center">
                <Button
                  variant="primary"
                  disabled={!canCheckout}
                  onClick={() => {
                    if (!selectedPlan) return;
                    setError("");
                    checkout.mutate(selectedPlan);
                  }}
                >
                  <CreditCard aria-hidden="true" />
                  {checkout.isPending
                    ? "Opening checkout…"
                    : syncState === "pending"
                      ? "Resume checkout"
                      : "Continue to checkout"}
                </Button>
                <p className="text-sm text-muted-foreground">
                  Secure checkout is provided by Polar. You’ll review the total
                  before paying.
                </p>
              </div>
            )}
          </section>
        </>
      )}
    </main>
  );
}
