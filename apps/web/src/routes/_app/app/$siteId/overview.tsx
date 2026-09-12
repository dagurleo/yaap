import { calendarDate } from "@/lib/report-timezone";
import { overviewSearch } from "@/lib/conversion-filters";
import { ConversionBreakdown } from "@/features/dashboard/conversion-breakdown";
import { dashboardPending } from "@/features/dashboard/dashboard-pending";
import { OnlineNow } from "@/features/dashboard/online-now";
import { Suspense, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import {
  Plus,
  Target,
  Eye,
  Users,
  History,
  ChartNoAxesCombined,
  CircleDollarSign,
} from "lucide-react";
import { GraphiteIcon } from "@/components/graphite-icon";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { dimensionKeys, type ReportFilters } from "@/lib/report-filters";
import {
  ActiveFilters,
  type ApplyFilter,
} from "@/features/dashboard/report-controls";
import { OverviewToolbar } from "@/features/dashboard/overview-toolbar";
import { OverviewBreakdowns } from "@/features/dashboard/overview-breakdowns";
import { WebsiteLayout } from "@/features/dashboard/website-layout";
import { PageviewChart } from "@/features/dashboard/pageview-chart";
import { GoalDialog, GoalsPanel } from "@/features/dashboard/goals-panel";
import { SessionPanel } from "@/features/dashboard/session-panel";
import { VisitorInsights } from "@/features/dashboard/visitor-insights";
import { VisitorLocationsPanel } from "@/features/dashboard/visitor-locations-panel";
import { VisitorTechnologyPanel } from "@/features/dashboard/visitor-technology-panel";
import { TrafficBreakdowns } from "@/features/dashboard/traffic-breakdowns";
import { PaymentSettings } from "@/features/dashboard/payment-settings";
import { EntityIcon } from "@/features/dashboard/entity-icon-picker";
import {
  overviewQuery,
  sitesQuery,
  paymentSettingsQuery,
} from "@/features/dashboard/queries";

export const Route = createFileRoute("/_app/app/$siteId/overview")({
  ...dashboardPending,
  validateSearch: overviewSearch,
  loaderDeps: ({ search }) => search,
  loader: async ({ context, params, deps }) => {
    await context.queryClient.ensureQueryData(sitesQuery());
    const overview = await context.queryClient.ensureQueryData(
      overviewQuery(params.siteId, deps),
    );
    if (overview.site.capabilities.manageSite)
      await context.queryClient.ensureQueryData(
        paymentSettingsQuery(params.siteId),
      );
  },
  component: Overview,
});
const format = (value: number) => new Intl.NumberFormat("en").format(value);
const percent = (value: number | null) =>
  value === null ? "—" : `${(value * 100).toFixed(1)}%`;
function change(current: number, previous: number | undefined) {
  return previous === undefined
    ? null
    : previous === 0
      ? current
        ? "New"
        : "0.0%"
      : `${current >= previous ? "+" : ""}${((current / previous - 1) * 100).toFixed(1)}%`;
}
function Overview() {
  const { siteId } = Route.useParams(),
    filters = Route.useSearch(),
    navigate = Route.useNavigate();
  const { data, error } = useSuspenseQuery(overviewQuery(siteId, filters));
  const payments = useQuery({
    ...paymentSettingsQuery(siteId),
    enabled: data.site.capabilities.manageSite,
  });
  const tab = filters.view ?? "traffic";
  const setTab = (view: "traffic" | "conversions") =>
    void navigate({
      search: { ...filters, view: view === "conversions" ? view : undefined },
    });
  const [detail, setDetail] = useState<
      "goals" | "insights" | "sessions" | null
    >(null),
    [goalDialogOpen, setGoalDialogOpen] = useState(false),
    [paymentOpen, setPaymentOpen] = useState(false);
  const paymentTrigger = useRef<HTMLButtonElement>(null);
  const changeFilters = (next: ReportFilters) =>
    void navigate({
      search: { ...next, view: filters.view, goalId: filters.goalId },
    });
  const onFilter: ApplyFilter = (values) => {
    changeFilters({ ...filters, ...values });
    setDetail(null);
  };
  const activeGoals = data.goals.filter((goal) => !goal.archived);
  const purchase =
    activeGoals.find((goal) => goal.eventName === "purchase") ?? activeGoals[0];
  const displayGoals = [...activeGoals]
    .sort(
      (a, b) => Number(b.id === purchase?.id) - Number(a.id === purchase?.id),
    )
    .slice(0, 2);
  const previousPurchase = data.comparison?.goals.find(
    (goal) => goal.id === purchase?.id,
  );
  const conversionChange =
    purchase?.conversionRate != null && previousPurchase?.conversionRate != null
      ? `${purchase.conversionRate >= previousPurchase.conversionRate ? "+" : ""}${((purchase.conversionRate - previousPurchase.conversionRate) * 100).toFixed(1)} pp`
      : null;
  const metrics = [
    {
      label: "Pageviews",
      icon: Eye,
      value: format(data.pageviews),
      detail: `Across ${format(data.pagesViewed)} ${data.pagesViewed === 1 ? "page" : "pages"}`,
      delta: change(data.pageviews, data.comparison?.pageviews),
      positive: data.pageviews >= (data.comparison?.pageviews ?? 0),
      action: () => setTab("traffic"),
    },
    {
      label: "Identified visitors",
      icon: Users,
      value: format(data.identities.visitors),
      detail: "Unique in this period",
      delta: change(
        data.identities.visitors,
        data.comparison?.identities.visitors,
      ),
      positive:
        data.identities.visitors >= (data.comparison?.identities.visitors ?? 0),
      action: () =>
        void navigate({
          to: "/app/$siteId/visitors",
          params: { siteId },
          search: { ...filters, cohort: "all", goalId: "", page: 0 },
        }),
    },
    {
      label: "Sessions",
      icon: History,
      value: format(data.identities.sessions),
      detail: data.identities.visitors
        ? `${(data.identities.sessions / data.identities.visitors).toFixed(2)} per visitor`
        : "No identified sessions",
      delta: change(
        data.identities.sessions,
        data.comparison?.identities.sessions,
      ),
      positive:
        data.identities.sessions >= (data.comparison?.identities.sessions ?? 0),
      action: () => setDetail("sessions"),
    },
    {
      label: purchase ? `${purchase.name} conversion` : "Goal conversion",
      icon: Target,
      value: percent(purchase?.conversionRate ?? null),
      detail: purchase
        ? `${format(purchase.convertedSessions)} converted sessions`
        : "Add a goal to get started",
      delta: conversionChange,
      positive:
        (purchase?.conversionRate ?? 0) >=
        (previousPurchase?.conversionRate ?? 0),
      action: () => setTab("conversions"),
    },
  ];
  function exportCsv() {
    const rows = [
      [
        `Date (${data.site.timezone})`,
        "Pageviews",
        ...(data.comparison ? ["Previous period pageviews"] : []),
      ],
      ...data.series.map((day, index) => [
        day.date,
        String(day.pageviews),
        ...(data.comparison
          ? [String(data.comparison.series[index]?.pageviews ?? 0)]
          : []),
      ]),
    ];
    const url = URL.createObjectURL(
      new Blob([rows.map((row) => row.join(",")).join("\r\n")], {
        type: "text/csv;charset=utf-8",
      }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `analytics-${siteId}-${calendarDate(data.start, data.site.timezone)}.csv`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const actions = (
    <div className="graphite-pageactions">
      <OnlineNow siteId={siteId} />
      <Button size="sm" type="button" onClick={exportCsv}>
        <GraphiteIcon name="export" />
        Export
      </Button>
    </div>
  );
  return (
    <WebsiteLayout
      title="Overview"
      selectedSiteId={siteId}
      hideHeading
      headerTabs={
        <div
          className="graphite-page-tabs"
          role="group"
          aria-label="Overview reports"
        >
          <button
            type="button"
            aria-pressed={tab === "traffic"}
            onClick={() => setTab("traffic")}
          >
            <ChartNoAxesCombined aria-hidden="true" /> Traffic
          </button>
          <button
            type="button"
            aria-pressed={tab === "conversions"}
            onClick={() => setTab("conversions")}
          >
            <Target aria-hidden="true" /> Conversions
          </button>
          <Link
            to="/app/$siteId/revenue"
            params={{ siteId }}
            search={{ ...filters, mode: "live", page: 0 }}
          >
            <CircleDollarSign aria-hidden="true" /> Revenue
          </Link>
        </div>
      }
      headerActions={actions}
      footer={
        <>
          <span>
            Showing{" "}
            {dimensionKeys.some((key) => filters[key]) ? "filtered" : "all"}{" "}
            traffic ·{" "}
            {filters.from ? "Custom dates" : `Last ${filters.days} days`}
          </span>
          <button type="button" onClick={() => setDetail("insights")}>
            More insights
          </button>
        </>
      }
    >
      <section
        className="graphite-overview"
        aria-label={`${data.site.name} traffic overview`}
      >
        <OverviewToolbar filters={filters} onChange={changeFilters} />
        <ActiveFilters filters={filters} onChange={changeFilters} />
        {error && (
          <p className="text-destructive" role="alert">
            Refresh failed. Showing saved results.
          </p>
        )}
        {tab === "traffic" ? (
          <>
            <div className="graphite-metrics-wrap">
              <div className="graphite-metrics" aria-label="Key metrics">
                {metrics.map((metric) => (
                  <button
                    type="button"
                    key={metric.label}
                    className="graphite-metric"
                    onClick={metric.action}
                  >
                    <div className="graphite-metric-label">
                      <metric.icon aria-hidden="true" />
                      <span>{metric.label}</span>
                    </div>
                    <div className="graphite-metric-values">
                      <div className="graphite-number">{metric.value}</div>
                      {metric.delta && (
                        <div
                          className="graphite-delta"
                          data-positive={metric.positive}
                        >
                          {metric.delta}
                        </div>
                      )}
                    </div>
                    <div className="graphite-metric-detail">
                      {metric.detail}
                    </div>
                  </button>
                ))}
              </div>
            </div>
            <PageviewChart
              key={JSON.stringify(filters)}
              series={data.series}
              previous={data.comparison?.series}
            />
            <OverviewBreakdowns data={data} onFilter={onFilter} />
            <div className="pt-5">
              <div className="graphite-reports">
                <VisitorLocationsPanel
                  data={data}
                  onFilter={onFilter}
                  onDetails={() => setDetail("insights")}
                />
                <VisitorTechnologyPanel
                  data={data}
                  onFilter={onFilter}
                  onDetails={() => setDetail("insights")}
                />
              </div>
            </div>
            <section className="graphite-goals">
              <div className="graphite-sectionhead">
                <h2 className="report-heading">
                  <Target aria-hidden="true" />
                  Goals &amp; conversions
                </h2>
                <button
                  type="button"
                  className="graphite-textbutton"
                  onClick={() =>
                    activeGoals.length
                      ? setDetail("goals")
                      : setGoalDialogOpen(true)
                  }
                >
                  {activeGoals.length ? (
                    <>
                      Manage goals <GraphiteIcon name="external" />
                    </>
                  ) : (
                    <>
                      New goal <Plus aria-hidden="true" />
                    </>
                  )}
                </button>
              </div>
              {displayGoals.length ? (
                <table className="graphite-table">
                  <thead>
                    <tr>
                      <th>Goal</th>
                      <th>Completions</th>
                      <th className="graphite-optional">Converted sessions</th>
                      <th className="graphite-conversion-heading">
                        <span>Session conversion</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {displayGoals.map((goal) => (
                      <tr key={goal.id}>
                        <td>
                          <span className="flex min-w-0 items-center gap-2">
                            <EntityIcon name={goal.icon} />
                            <span className="min-w-0 wrap-anywhere">
                              {goal.name}
                            </span>
                          </span>
                        </td>
                        <td>{format(goal.completions)}</td>
                        <td className="graphite-optional">
                          {format(goal.convertedSessions)}
                        </td>
                        <td>{percent(goal.conversionRate)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="graphite-empty">
                  No goals yet. Add a goal to measure conversions.
                </p>
              )}
            </section>
          </>
        ) : (
          <div className="graphite-conversions">
            <ConversionBreakdown
              key={JSON.stringify([siteId, filters])}
              siteId={siteId}
              filters={filters}
              goalId={filters.goalId ?? ""}
              onGoalChange={(goalId) =>
                void navigate({
                  search: { ...filters, goalId, view: "conversions" },
                })
              }
            />
            <GoalsPanel key={siteId} data={data} initialCreating={false} />
            <Link
              to="/app/$siteId/funnels"
              params={{ siteId }}
              search={filters}
              className="graphite-textbutton"
            >
              Explore conversion funnels <GraphiteIcon name="external" />
            </Link>
          </div>
        )}
        {data.site.capabilities.manageSite && (
          <aside className="graphite-revenue">
            <div>
              <strong>Connect traffic to revenue</strong>
              <p>Discover which sources bring paying customers.</p>
            </div>
            <button
              type="button"
              ref={paymentTrigger}
              className="graphite-primary"
              onClick={() => setPaymentOpen(true)}
            >
              {payments.data?.stripeLive || payments.data?.stripeTest
                ? "Manage integrations"
                : "Connect Stripe"}
            </button>
          </aside>
        )}
      </section>
      <Dialog
        open={detail !== null}
        onOpenChange={(open) => {
          if (!open) setDetail(null);
        }}
      >
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-5xl">
          <DialogTitle>
            {detail === "goals"
              ? activeGoals.length
                ? "Manage goals"
                : "Create a goal"
              : detail === "sessions"
                ? "Sessions & live activity"
                : "More insights"}
          </DialogTitle>
          <DialogDescription>
            {detail === "goals"
              ? "Track matching events or page visits as conversions."
              : "Detailed reports for your selected date range and filters."}
          </DialogDescription>
          {detail === "goals" ? (
            <GoalsPanel
              data={data}
              initialCreating={false}
              onRequestCreate={() => {
                setDetail(null);
                setGoalDialogOpen(true);
              }}
            />
          ) : detail === "sessions" ? (
            <SessionPanel data={data} onFilter={onFilter} />
          ) : detail === "insights" ? (
            <>
              <VisitorInsights data={data} onFilter={onFilter} />
              <TrafficBreakdowns data={data} onFilter={onFilter} />
            </>
          ) : null}
        </DialogContent>
      </Dialog>
      {data.site.capabilities.manageSite && (
        <GoalDialog
          data={data}
          open={goalDialogOpen}
          onOpenChange={setGoalDialogOpen}
        />
      )}
      {data.site.capabilities.manageSite && paymentOpen && (
        <Suspense fallback={<p role="status">Loading payment integrations…</p>}>
          <PaymentSettings
            siteId={siteId}
            onClose={() => setPaymentOpen(false)}
            restoreFocus={() => paymentTrigger.current?.focus()}
          />
        </Suspense>
      )}
    </WebsiteLayout>
  );
}
