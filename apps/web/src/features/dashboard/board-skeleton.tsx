import { useQueryClient } from "@tanstack/react-query";
import { useRouterState } from "@tanstack/react-router";
import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ChartNoAxesCombined, Target, CircleDollarSign } from "lucide-react";
import "./site-settings.css";

export const boardTitles = {
  overview: "Overview",
  visitors: "Visitors",
  funnels: "Funnels",
  revenue: "Revenue",
  events: "Events & installation",
  settings: "Website settings",
};
export type Board = keyof typeof boardTitles;
const repeat = (count: number) => Array.from({ length: count }, (_, i) => i);
const Line = ({ className = "w-24" }: { className?: string }) => (
  <Skeleton className={`h-3 ${className}`} />
);

export function OverviewHeaderSkeleton() {
  return (
    <div className="graphite-page-tabs" aria-hidden="true">
      <button disabled aria-pressed="true">
        <ChartNoAxesCombined /> Traffic
      </button>
      <button disabled>
        <Target /> Conversions
      </button>
      <button disabled>
        <CircleDollarSign /> Revenue
      </button>
    </div>
  );
}
export function ToolbarSkeleton({
  compare = false,
  overview = false,
}: {
  compare?: boolean;
  overview?: boolean;
}) {
  return (
    <div
      className={
        overview ? "graphite-toolbar" : "flex flex-wrap items-center gap-2"
      }
      aria-hidden="true"
    >
      <Skeleton className={overview ? "h-7.5 w-48" : "h-9 w-48"} />
      {compare && <Skeleton className={overview ? "h-7.5 w-24" : "h-9 w-24"} />}
      <Skeleton className={overview ? "h-7.5 w-20" : "h-9 w-9"} />
      {overview && <span className="graphite-timezone">Timezone</span>}
    </div>
  );
}
function SectionHeading({
  title,
  controls = 1,
}: {
  title: string;
  controls?: number;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 className="text-lg">{title}</h2>
      <div className="flex flex-wrap gap-2">
        {repeat(controls).map((i) => (
          <Skeleton key={i} className="h-9 w-36" />
        ))}
      </div>
    </div>
  );
}
function DataTable({
  headings,
  rows = 8,
  visitor = false,
}: {
  headings: string[];
  rows?: number;
  visitor?: boolean;
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          {headings.map((heading, i) => (
            <TableHead
              key={heading}
              className={i >= headings.length - 2 ? "text-right" : undefined}
            >
              {heading}
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {repeat(rows).map((row) => (
          <TableRow key={row}>
            {headings.map((heading, col) => (
              <TableCell
                key={heading}
                className={visitor ? "h-[63px]" : "h-14"}
              >
                <div
                  className={
                    col >= headings.length - 2
                      ? "flex justify-end"
                      : "space-y-2"
                  }
                >
                  <Line
                    className={
                      col >= headings.length - 2
                        ? "w-10"
                        : col === 0
                          ? "w-36"
                          : "w-28"
                    }
                  />
                  {visitor && (col === 0 || col === 2) && (
                    <Line className="w-24" />
                  )}
                </div>
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
function Breakdown({
  title,
  tabs,
  columns,
}: {
  title: string;
  tabs: string[];
  columns: string[];
}) {
  return (
    <section>
      <div className="graphite-sectionhead">
        <h2>{title}</h2>
        <Line className="w-14" />
      </div>
      <div className="graphite-tabs">
        {tabs.map((tab, i) => (
          <button key={tab} disabled aria-pressed={i === 0}>
            {tab}
          </button>
        ))}
      </div>
      <table className="graphite-table">
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c}>{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {repeat(5).map((row) => (
            <tr key={row}>
              {columns.map((c, i) => (
                <td key={c}>
                  {i === 0 ? (
                    <div className="graphite-row-link">
                      <div
                        className={
                          columns.length === 2
                            ? "relative h-[1.5em] min-h-5"
                            : "relative h-[1.5em]"
                        }
                      >
                        <Line
                          className={`absolute top-1/2 -translate-y-1/2 ${row % 2 ? "w-28" : "w-36"}`}
                        />
                      </div>
                    </div>
                  ) : (
                    <Line className="ml-auto w-10" />
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
function OverviewSkeleton() {
  return (
    <>
      <ToolbarSkeleton overview compare />
      <div className="graphite-metrics-wrap">
        <div className="graphite-metrics">
          {[
            "Pageviews",
            "Identified visitors",
            "Sessions",
            "Purchase conversion",
          ].map((label) => (
            <div className="graphite-metric pointer-events-none" key={label}>
              <div className="graphite-metric-label">{label}</div>
              <div className="graphite-metric-values">
                <div className="graphite-number relative">
                  <span className="invisible">0,000</span>
                  <Skeleton className="absolute inset-0 bg-foreground/10" />
                </div>
              </div>
              <div className="graphite-metric-detail">
                <div className="relative">
                  <span className="invisible">Unique in this period</span>
                  <Skeleton className="absolute top-1/2 h-3 w-28 max-w-full -translate-y-1/2 bg-foreground/10" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
      <section className="graphite-trend">
        <div className="graphite-sectionhead">
          <h2 className="report-heading">
            <ChartNoAxesCombined /> Pageviews
          </h2>
          <Skeleton className="h-7.5 w-20" />
        </div>
        <div className="graphite-plot flex h-[200px] flex-col justify-between pb-6">
          {repeat(4).map((i) => (
            <div className="flex items-center gap-4" key={i}>
              <Line className="w-7" />
              <div className="h-px flex-1 bg-border/50" />
            </div>
          ))}
        </div>
        <div className="graphite-chart-footer">
          <Line className="w-28" />
          <span className="graphite-textbutton leading-[18px]">View data</span>
        </div>
      </section>
      <div className="graphite-reports">
        <Breakdown
          title="Traffic sources"
          tabs={["Sources", "Referrers", "Campaigns"]}
          columns={["Source", "Pageviews", "Share"]}
        />
        <Breakdown
          title="Top pages"
          tabs={["Pages", "Entry pages", "Exit pages"]}
          columns={["Page", "Pageviews", "Share"]}
        />
      </div>
      <div className="pt-5">
        <div className="graphite-reports">
          <Breakdown
            title="Visitors by location"
            tabs={["Country", "Region", "City"]}
            columns={["Country", "Visitors"]}
          />
          <Breakdown
            title="Visitors by technology"
            tabs={["Browser", "OS", "Device"]}
            columns={["Browser", "Visitors"]}
          />
        </div>
      </div>
    </>
  );
}
function VisitorsSkeleton() {
  return (
    <>
      <ToolbarSkeleton />
      <SectionHeading title="Visitors" controls={2} />
      <DataTable
        visitor
        rows={16}
        headings={[
          "Visitor",
          "Location",
          "Browser",
          "First seen",
          "Last seen",
          "Sessions",
          "Pageviews",
        ]}
      />
      <div className="flex justify-between">
        <Line className="w-40" />
        <Skeleton className="h-9 w-40" />
      </div>
    </>
  );
}
function FunnelsSkeleton() {
  return (
    <>
      <ToolbarSkeleton compare />
      <SectionHeading title="Funnels" />
      <div className="flex flex-wrap justify-between gap-3">
        <Skeleton className="h-9 w-64 max-w-full" />
        <div className="flex gap-2">
          <Skeleton className="h-8 w-14" />
          <Skeleton className="h-8 w-20" />
        </div>
      </div>
      <Card>
        <div className="flex justify-between gap-4">
          <Line className="w-52 max-w-full" />
          <Line className="w-24" />
        </div>
        <dl className="grid grid-cols-3 gap-4">
          {["Entered", "Completed", "Conversion"].map((label) => (
            <div key={label}>
              <dt className="text-sm text-muted-foreground">{label}</dt>
              <dd className="pt-1">
                <Skeleton className="h-8 w-20 max-w-full" />
              </dd>
            </div>
          ))}
        </dl>
        <div className="space-y-6 pt-3">
          {repeat(3).map((i) => (
            <div key={i} className="space-y-2">
              <div className="flex justify-between">
                <div className="space-y-2">
                  <Line className="w-36" />
                  <Line className="w-10" />
                </div>
                <div className="space-y-2">
                  <Line className="w-10" />
                  <Line className="w-10" />
                </div>
              </div>
              <Skeleton className="h-8 w-full rounded-lg" />
              {i > 0 && (
                <div className="flex justify-between">
                  <Line className="w-28" />
                  <Line className="w-36" />
                </div>
              )}
            </div>
          ))}
        </div>
      </Card>
    </>
  );
}
function RevenueSkeleton() {
  const client = useQueryClient();
  const siteId = useRouterState({
    select: (state) =>
      decodeURIComponent(state.location.pathname.split("/")[2] ?? ""),
  });
  const cached = client
    .getQueriesData<{ summary: { currency: string }[] }>({
      queryKey: ["sites", siteId, "revenue"],
    })
    .map(([, data]) => data)
    .find((data) => data?.summary.length);
  const currencies = cached?.summary.map((row) => row.currency) ?? [null];
  return (
    <>
      <ToolbarSkeleton compare />
      <SectionHeading title="Revenue" />
      <div
        className={
          currencies.length > 1 ? "grid gap-3 lg:grid-cols-2" : "grid gap-3"
        }
      >
        {currencies.map((currency, i) => (
          <Card key={currency ?? i}>
            {currency ? <h3>{currency}</h3> : <Line className="w-10" />}
            <dl
              className={`grid grid-cols-2 gap-5 ${currencies.length === 1 ? "sm:grid-cols-4" : ""}`}
            >
              {[
                "Net revenue",
                "Captured",
                "Refunds",
                "Payments · linked customers",
              ].map((label) => (
                <div key={label}>
                  <dt className="text-xs text-muted-foreground">{label}</dt>
                  <dd className="pt-1">
                    <Skeleton className="h-6 w-28 max-w-full" />
                  </dd>
                </div>
              ))}
            </dl>
          </Card>
        ))}
      </div>
      <Card>
        <div className="flex flex-wrap justify-between gap-3">
          <div className="flex gap-4 text-sm">
            <span>Source</span>
            <span>Campaign</span>
            <span>Landing page</span>
          </div>
          <span className="text-xs text-muted-foreground">
            Saved payment attribution · Net revenue
          </span>
        </div>
        <div className="divide-y divide-border">
          {repeat(6).map((i) => (
            <div key={i} className="flex h-11 items-center justify-between">
              <Line className="w-40" />
              <Line className="w-24" />
            </div>
          ))}
        </div>
      </Card>
      <DataTable
        headings={["Payment", "Visitor", "Amount", "Refunds", "Paid at"]}
        rows={6}
      />
    </>
  );
}
function EventsSkeleton() {
  return (
    <>
      <div className="flex flex-wrap justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">Event explorer</h2>
          <p className="text-muted-foreground">
            Inspect events and compare the properties you send.
          </p>
        </div>
        <Skeleton className="h-9 w-48" />
      </div>
      <div className="@container">
        <div className="grid items-end gap-3 @lg:grid-cols-2 @4xl:grid-cols-[1fr_1fr_8rem_1fr_auto]">
          {["Event name", "Property key", "Type", "Property value"].map(
            (label) => (
              <div key={label} className="space-y-2">
                <span>{label}</span>
                <Skeleton className="h-9 w-full" />
              </div>
            ),
          )}
          <Skeleton className="h-9 w-20" />
        </div>
      </div>
      <div className="flex justify-between border-y border-border/70 py-3">
        <Line className="my-3 w-64 max-w-[70%]" />
        <Skeleton className="h-9 w-20" />
      </div>
      <div className="@container">
        <div className="grid gap-6 @2xl:grid-cols-2">
          {["Event names", "Property values"].map((title) => (
            <div key={title} className="space-y-2">
              <h3 className="font-medium">{title}</h3>
              <Line className="w-60 max-w-full" />
              <div className="divide-y divide-border/70">
                {repeat(4).map((i) => (
                  <div
                    className="flex h-12 items-center justify-between"
                    key={i}
                  >
                    <Line className="w-32" />
                    <Line className="w-10" />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="space-y-3">
        <h3 className="font-medium">Latest events</h3>
        <div className="divide-y divide-border/70">
          {repeat(6).map((i) => (
            <div key={i} className="space-y-3 py-4">
              <Line className="w-48" />
              <Line className="w-72 max-w-full" />
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
function SettingsSkeleton() {
  return (
    <div className="site-settings">
      <header className="settings-heading">
        <span className="settings-back">← Back to overview</span>
        <Line className="w-96 max-w-full" />
      </header>
      <div className="settings-layout">
        <div className="settings-nav">
          <div className="settings-nav-label">Configuration</div>
          {[
            "General",
            "Installation",
            "Revenue",
            "Domains & exclusions",
            "Data retention",
            "Ingestion",
          ].map((label) => (
            <div
              key={label}
              className="flex min-h-10 items-center gap-2 px-3 text-[13px] text-muted-foreground"
            >
              <Skeleton className="size-4" />
              {label}
            </div>
          ))}
        </div>
        <div className="settings-main">
          <div className="settings-section-heading">
            <Line className="h-6 w-36" />
            <Line className="w-80 max-w-full" />
          </div>
          <div className="settings-panel">
            <div className="settings-panel-body">
              {repeat(2).map((i) => (
                <div key={i} className="space-y-2">
                  <Line className="w-28" />
                  <Skeleton className="h-10 w-full" />
                  <Line className="w-3/4" />
                </div>
              ))}
            </div>
            <footer>
              <Line className="w-36" />
              <Skeleton className="h-9 w-28" />
            </footer>
          </div>
        </div>
      </div>
    </div>
  );
}
const layouts = {
  overview: OverviewSkeleton,
  visitors: VisitorsSkeleton,
  funnels: FunnelsSkeleton,
  revenue: RevenueSkeleton,
  events: EventsSkeleton,
  settings: SettingsSkeleton,
};
export function BoardSkeleton({ board }: { board: Board }) {
  const Layout = layouts[board];
  return (
    <section
      aria-label={`Loading ${boardTitles[board].toLowerCase()}`}
      aria-busy="true"
      className={
        board === "overview"
          ? "graphite-overview"
          : board === "events"
            ? "min-w-0 space-y-6 text-base sm:text-sm"
            : "space-y-5"
      }
      data-board-skeleton={board}
    >
      <p role="status" className="sr-only">
        Loading {boardTitles[board].toLowerCase()}…
      </p>
      <div
        aria-hidden="true"
        className={
          board === "overview" || board === "settings"
            ? "contents"
            : board === "events"
              ? "space-y-6"
              : "space-y-5"
        }
      >
        <Layout />
      </div>
    </section>
  );
}
