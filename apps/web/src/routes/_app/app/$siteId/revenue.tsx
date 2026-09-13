import { useReportQueries } from "@/features/dashboard/report-queries";
import { dashboardPending } from "@/features/dashboard/dashboard-pending";
import { Suspense, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { RefreshCw, Plug } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { WebsiteLayout } from "@/features/dashboard/website-layout";
import {
  ReportDates,
  ActiveFilters,
} from "@/features/dashboard/report-controls";
import { FunnelSelect } from "@/features/dashboard/funnel-editor";
import { PaymentSettings } from "@/features/dashboard/payment-settings";
import {
  JourneyDrawer,
  visitorLabel,
  timestamp,
} from "@/features/dashboard/journey-drawer";
import {
  revenueQuery,
  sitesQuery,
  paymentSettingsQuery,
} from "@/features/dashboard/queries";
import { revenueFilters, type RevenueFilters } from "@/lib/revenue-filters";
import { unknownValue, type ReportFilters } from "@/lib/report-filters";
import { money } from "@/lib/money";
import { TrafficSourceIcon } from "@/features/dashboard/traffic-source-icon";
export const Route = createFileRoute("/_app/app/$siteId/revenue")({
  ...dashboardPending,
  validateSearch: (search: Record<string, unknown>) => revenueFilters(search),
  loaderDeps: ({ search }) => search,
  loader: async ({ context, params, deps }) => {
    await context.queryClient.ensureQueryData(sitesQuery());
    const revenue = await context.queryClient.ensureQueryData(
      revenueQuery(params.siteId, deps),
    );
    if (revenue.site.capabilities.manageSite)
      await context.queryClient.ensureQueryData(
        paymentSettingsQuery(params.siteId),
      );
  },
  component: Revenue,
});
function Revenue() {
  const { siteId } = Route.useParams(),
    filters = Route.useSearch(),
    navigate = Route.useNavigate();
  return (
    <RevenueReport siteId={siteId} filters={filters} navigate={navigate} />
  );
}
export function RevenueReport({
  siteId,
  filters,
  navigate,
}: {
  siteId: string;
  filters: ReturnType<typeof Route.useSearch>;
  navigate: ReturnType<typeof Route.useNavigate>;
}) {
  const { revenueQuery } = useReportQueries();
  const { data, error, refetch, isFetching } = useSuspenseQuery(
    revenueQuery(siteId, filters),
  );
  const [settings, setSettings] = useState(false),
    [breakdown, setBreakdown] = useState<"source" | "campaign" | "path">(
      "source",
    ),
    [journey, setJourney] = useState<string | null>(null);
  const settingsTrigger = useRef<HTMLButtonElement | null>(null),
    journeyTrigger = useRef<HTMLButtonElement | null>(null);
  const change = (next: Partial<RevenueFilters>) =>
    void navigate({ search: { ...filters, ...next, page: 0 } });
  const dates = (next: ReportFilters) =>
    void navigate({
      search: {
        ...next,
        mode: filters.mode,
        visitorId: filters.visitorId,
        page: 0,
      },
    });
  const rows =
    breakdown === "source"
      ? data.sources
      : breakdown === "campaign"
        ? data.campaigns
        : data.landingPages;
  return (
    <WebsiteLayout title="Revenue" selectedSiteId={siteId}>
      <section className="space-y-5" aria-label="Revenue report">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2">
            <ReportDates filters={filters} onChange={dates} comparison />
            <Button
              size="icon"
              aria-label="Refresh revenue"
              disabled={isFetching}
              onClick={() => void refetch()}
            >
              <RefreshCw
                className={isFetching ? "motion-safe:animate-spin" : ""}
              />
            </Button>
          </div>
        </div>
        <ActiveFilters filters={filters} onChange={dates} />
        {filters.visitorId && (
          <Button size="sm" onClick={() => change({ visitorId: undefined })}>
            {visitorLabel(filters.visitorId)} ×
          </Button>
        )}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <h2 className="text-lg">Revenue</h2>
            <FunnelSelect
              aria-label="Payment mode"
              value={filters.mode}
              onChange={(event) =>
                change({ mode: event.target.value as "live" | "test" })
              }
            >
              <option value="live">Live</option>
              <option value="test">Test</option>
            </FunnelSelect>
          </div>
          {data.site.capabilities.manageSite && (
            <Button ref={settingsTrigger} onClick={() => setSettings(true)}>
              <Plug aria-hidden="true" />
              Payment settings
            </Button>
          )}
        </div>
        {error && (
          <p role="alert" className="text-destructive">
            Could not refresh revenue.
          </p>
        )}
        {data.summary.length ? (
          <div
            className={
              data.summary.length > 1
                ? "grid gap-3 lg:grid-cols-2"
                : "grid gap-3"
            }
          >
            {data.summary.map((total) => (
              <Card key={total.currency}>
                <h3>{total.currency}</h3>
                <dl
                  className={`grid grid-cols-2 gap-5 [&_dt]:text-xs [&_dt]:text-muted-foreground [&_dd]:pt-1 [&_dd]:text-lg [&_dd]:tabular-nums ${data.summary.length === 1 ? "sm:grid-cols-4" : ""}`}
                >
                  <div>
                    <dt>Net revenue</dt>
                    <dd className="font-semibold">
                      {money(total.net, total.currency)}
                    </dd>
                  </div>
                  <div>
                    <dt>Captured</dt>
                    <dd>{money(total.amount, total.currency)}</dd>
                  </div>
                  <div>
                    <dt>Refunds</dt>
                    <dd>{money(total.refunds, total.currency)}</dd>
                  </div>
                  <div>
                    <dt>Payments · linked customers</dt>
                    <dd>
                      {total.payments} · {total.customers}
                    </dd>
                  </div>
                </dl>
                {data.comparison && (
                  <p className="text-xs text-muted-foreground">
                    Previous net:{" "}
                    {money(
                      data.comparison.find(
                        (item) => item.currency === total.currency,
                      )?.net ?? 0,
                      total.currency,
                    )}
                  </p>
                )}
              </Card>
            ))}
          </div>
        ) : (
          <Card>
            <p className="py-8 text-center text-sm text-muted-foreground">
              No {filters.mode} payments in this period
            </p>
          </Card>
        )}
        <section className="space-y-3" aria-label="Attribution status">
          <h3>Attribution status</h3>
          <p className="text-base text-muted-foreground sm:text-sm">
            Pending records can change as delayed events arrive. After at least
            72 hours, the next check freezes attribution. Raw-event retention
            does not change finalized records.
          </p>
          <ul role="list" className="divide-y divide-border">
            {data.attribution.map((row, index) => (
              <li
                key={index}
                className="flex flex-wrap justify-between gap-3 py-3 text-sm"
              >
                <div className="min-w-0">
                  <p>
                    {row.model
                      ? `${row.model === "first_touch" ? "First touch" : "Last non-direct"} · ${row.lookbackDays} days`
                      : "Awaiting backfill"}{" "}
                    ·{" "}
                    {row.status === "finalized"
                      ? "Finalized"
                      : row.status === "pending"
                        ? "Pending"
                        : "Not checked"}
                  </p>
                  <p className="text-muted-foreground">
                    {row.reason === "missing_identity"
                      ? "Unattributed: no linked identity"
                      : row.reason === "no_matching_pageview"
                        ? "Unattributed: no pageview in lookback window"
                        : row.reason === "backfill_required"
                          ? "Unattributed: retained history not checked yet"
                          : "Matched"}{" "}
                    · {row.payments} payments
                  </p>
                </div>
                <p className="shrink-0 tabular-nums">
                  {money(row.net, row.currency)} net
                </p>
              </li>
            ))}
          </ul>
        </section>
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div
              className="flex flex-wrap gap-1"
              aria-label="Revenue attribution"
            >
              {(
                [
                  ["source", "Source"],
                  ["campaign", "Campaign"],
                  ["path", "Landing page"],
                ] as const
              ).map(([value, label]) => (
                <Button
                  key={value}
                  size="sm"
                  variant={breakdown === value ? "default" : "ghost"}
                  aria-pressed={breakdown === value}
                  onClick={() => setBreakdown(value)}
                >
                  {label}
                </Button>
              ))}
            </div>
            <span className="text-xs text-muted-foreground">
              Saved payment attribution · Net revenue
            </span>
          </div>
          <div className="divide-y divide-border">
            {rows.map((row) => (
              <div
                key={`${row.label}:${row.currency}`}
                className="flex items-start justify-between gap-4 py-3 text-sm"
              >
                <button
                  type="button"
                  className="flex min-w-0 cursor-pointer items-center gap-2 text-left wrap-anywhere hover:underline focus-visible:outline-2 focus-visible:outline-ring"
                  onClick={() =>
                    change({ [breakdown]: row.label ?? unknownValue })
                  }
                >
                  {breakdown !== "path" && (
                    <TrafficSourceIcon
                      value={row.label}
                      kind={breakdown === "source" ? "source" : "campaign"}
                    />
                  )}
                  <span className="min-w-0">
                    {row.label ??
                      (breakdown === "campaign"
                        ? "No campaign"
                        : "Unattributed")}
                  </span>
                </button>
                <span className="shrink-0 tabular-nums">
                  {money(row.net, row.currency)}
                </span>
              </div>
            ))}
            {!rows.length && (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No data
              </p>
            )}
          </div>
          {rows.length === 100 && (
            <p className="text-xs text-muted-foreground">Top 100</p>
          )}
        </Card>
        <Card>
          <div className="flex items-center justify-between">
            <h3>Payments</h3>
            <span className="text-xs text-muted-foreground">
              {data.total} · {data.site.timezone}
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs text-muted-foreground">
                <tr>
                  {[
                    "Payment",
                    "Visitor",
                    "Attribution",
                    "Net",
                    "Refunded",
                    "Date",
                  ].map((label) => (
                    <th key={label} className="px-2 py-3 font-medium">
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.payments.map((p) => (
                  <tr
                    key={`${p.provider}:${p.externalId}`}
                    className="border-t border-border"
                  >
                    <td className="px-2 py-3">
                      <span
                        className="block max-w-60 truncate"
                        title={p.externalId}
                      >
                        {p.externalId}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {p.provider === "stripe" ? "Stripe" : "Server API"}
                      </span>
                    </td>
                    <td className="px-2 py-3 whitespace-nowrap">
                      {p.visitorId && p.landingPage ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(event) => {
                            journeyTrigger.current = event.currentTarget;
                            setJourney(p.visitorId);
                          }}
                        >
                          {visitorLabel(p.visitorId)}
                        </Button>
                      ) : p.visitorId ? (
                        visitorLabel(p.visitorId)
                      ) : (
                        "Unattributed"
                      )}
                    </td>
                    <td className="min-w-48 px-2 py-3">
                      <p>{p.source ?? "Unattributed"}</p>
                      <p className="text-sm text-muted-foreground">
                        {p.attributionStatus === "backfill_required"
                          ? "Awaiting backfill"
                          : `${p.attributionStatus === "finalized" ? "Finalized" : "Pending"} · ${p.attributionModel === "first_touch" ? "First touch" : "Last non-direct"} · ${p.attributionLookbackDays} days`}
                      </p>
                      {p.attributionReason && (
                        <p className="text-sm text-muted-foreground">
                          {p.attributionReason === "missing_identity"
                            ? "No linked identity at attribution"
                            : p.attributionReason === "no_matching_pageview"
                              ? "No pageview in lookback window"
                              : "Retained history not checked yet"}
                        </p>
                      )}
                    </td>
                    <td className="px-2 py-3 whitespace-nowrap tabular-nums">
                      {money(p.amount - p.refundedAmount, p.currency)}
                    </td>
                    <td className="px-2 py-3 whitespace-nowrap tabular-nums">
                      {money(p.refundedAmount, p.currency)}
                    </td>
                    <td className="px-2 py-3 whitespace-nowrap text-muted-foreground">
                      {timestamp(p.paidAt, data.site.timezone)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!data.payments.length && (
            <p className="py-5 text-center text-sm text-muted-foreground">
              No payments
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button
              size="sm"
              disabled={!filters.page}
              onClick={() =>
                void navigate({
                  search: { ...filters, page: filters.page - 1 },
                })
              }
            >
              Previous
            </Button>
            <Button
              size="sm"
              disabled={(filters.page + 1) * 50 >= data.total}
              onClick={() =>
                void navigate({
                  search: { ...filters, page: filters.page + 1 },
                })
              }
            >
              Next
            </Button>
          </div>
        </Card>
        {data.site.capabilities.manageSite && settings && (
          <Suspense fallback={<p role="status">Loading integrations…</p>}>
            <PaymentSettings
              key={siteId}
              siteId={siteId}
              onClose={() => setSettings(false)}
              restoreFocus={() => settingsTrigger.current?.focus()}
            />
          </Suspense>
        )}
        {journey && (
          <JourneyDrawer
            siteId={siteId}
            visitorId={journey}
            asOf={data.asOf}
            onClose={() => setJourney(null)}
            restoreFocus={() => journeyTrigger.current?.focus()}
          />
        )}
      </section>
    </WebsiteLayout>
  );
}
