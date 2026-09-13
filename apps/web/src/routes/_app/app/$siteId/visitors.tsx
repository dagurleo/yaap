import { useReportQueries } from "@/features/dashboard/report-queries";
import { dashboardPending } from "@/features/dashboard/dashboard-pending";
import { reportFilters } from "@/lib/report-filters";
import {
  ReportDates,
  ActiveFilters,
} from "@/features/dashboard/report-controls";
import { useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { ChevronDown, RefreshCw, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { WebsiteLayout } from "@/features/dashboard/website-layout";
import { BreakdownIcon } from "@/features/dashboard/breakdown-icon";
import {
  JourneyDrawer,
  visitorLabel,
  timestamp,
} from "@/features/dashboard/journey-drawer";
import { sitesQuery, visitorsQuery } from "@/features/dashboard/queries";
import type { VisitorFilters } from "../../../../server/visitors";

export const Route = createFileRoute("/_app/app/$siteId/visitors")({
  ...dashboardPending,
  validateSearch: (search: Record<string, unknown>): VisitorFilters => ({
    ...reportFilters(search),
    cohort:
      search.cohort === "new" || search.cohort === "returning"
        ? search.cohort
        : "all",
    goalId:
      typeof search.goalId === "string" && search.goalId.length <= 128
        ? search.goalId
        : "",
    page:
      Number.isSafeInteger(Number(search.page)) &&
      Number(search.page) >= 0 &&
      Number(search.page) <= 100000
        ? Number(search.page)
        : 0,
  }),
  loaderDeps: ({ search }) => search,
  loader: async ({ context, params, deps }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(sitesQuery()),
      context.queryClient.ensureQueryData(visitorsQuery(params.siteId, deps)),
    ]);
  },
  component: Visitors,
});
const countryNames = new Intl.DisplayNames(["en"], { type: "region" });
function Visitors() {
  const { siteId } = Route.useParams();
  const filters = Route.useSearch();
  const navigate = Route.useNavigate();
  return (
    <VisitorsReport siteId={siteId} filters={filters} navigate={navigate} />
  );
}
export function VisitorsReport({
  siteId,
  filters,
  navigate,
}: {
  siteId: string;
  filters: ReturnType<typeof Route.useSearch>;
  navigate: ReturnType<typeof Route.useNavigate>;
}) {
  const { visitorsQuery } = useReportQueries();
  const { data, error, refetch, isFetching } = useSuspenseQuery(
    visitorsQuery(siteId, filters),
  );
  const [selected, setSelected] = useState<{ id: string; asOf: number } | null>(
    null,
  );
  const trigger = useRef<HTMLButtonElement | null>(null);
  const select = (changes: Partial<VisitorFilters>) =>
    void navigate({ search: { ...filters, ...changes, page: 0 } });
  return (
    <WebsiteLayout title="Visitors" selectedSiteId={siteId}>
      <section className="space-y-5" aria-label="Visitors">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex max-w-full flex-wrap items-center gap-2">
            <ReportDates
              filters={filters}
              onChange={(next) =>
                void navigate({
                  search: {
                    ...next,
                    cohort: filters.cohort,
                    goalId: filters.goalId,
                    page: 0,
                  },
                })
              }
            />
            <Button
              size="icon"
              aria-label="Refresh visitors"
              disabled={isFetching}
              onClick={() => void refetch()}
            >
              <RefreshCw
                className={isFetching ? "motion-safe:animate-spin" : ""}
              />
            </Button>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg">
            Visitors{" "}
            <span className="font-normal text-muted-foreground tabular-nums">
              {data.total}
            </span>
          </h2>
          <div className="flex max-w-full flex-wrap gap-2">
            <FilterSelect
              label="Visitor type"
              value={filters.cohort}
              onChange={(value) =>
                select({ cohort: value as VisitorFilters["cohort"] })
              }
              options={[
                ["all", "All visitors"],
                ["new", "New visitors"],
                ["returning", "Returning visitors"],
              ]}
            />
            <FilterSelect
              label="Completed goal"
              value={filters.goalId}
              onChange={(goalId) => select({ goalId })}
              options={[
                ["", "Any goal status"],
                ...data.goals.map(
                  (goal) =>
                    [
                      goal.id,
                      goal.name + (goal.archived ? " (archived)" : ""),
                    ] as [string, string],
                ),
              ]}
            />
          </div>
        </div>
        <ActiveFilters
          filters={filters}
          onChange={(next) =>
            void navigate({
              search: {
                ...next,
                cohort: filters.cohort,
                goalId: filters.goalId,
                page: 0,
              },
            })
          }
        />
        {error && (
          <p role="alert" className="text-destructive">
            Refresh failed.
          </p>
        )}
        {data.visitors.length ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Visitor</TableHead>
                <TableHead>Location</TableHead>
                <TableHead>Browser</TableHead>
                <TableHead>First seen · {data.site.timezone}</TableHead>
                <TableHead>Last seen · {data.site.timezone}</TableHead>
                <TableHead className="text-right">Sessions</TableHead>
                <TableHead className="text-right">Pageviews</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.visitors.map((visitor) => (
                <TableRow key={visitor.visitorId}>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={`View journey for ${visitorLabel(visitor.visitorId)}`}
                      onClick={(event) => {
                        trigger.current = event.currentTarget;
                        setSelected({ id: visitor.visitorId, asOf: data.asOf });
                      }}
                    >
                      {visitorLabel(visitor.visitorId)}
                      <ArrowRight aria-hidden="true" />
                    </Button>
                    <div className="px-2 text-xs text-muted-foreground">
                      {visitor.firstSeen < data.start ? "Returning" : "New"}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <BreakdownIcon kind="country" value={visitor.country} />
                      {visitor.country
                        ? (countryNames.of(visitor.country) ?? visitor.country)
                        : "Unknown"}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <BreakdownIcon kind="browser" value={visitor.browser} />
                      {visitor.browser ?? "Unknown"}
                    </div>
                    <div className="flex items-center gap-2 pt-1 text-xs text-muted-foreground">
                      <BreakdownIcon kind="device" value={visitor.device} />
                      {visitor.device ?? "Unknown"} ·{" "}
                      {visitor.os ?? "Unknown OS"}
                    </div>
                  </TableCell>
                  <TableCell className="tabular-nums">
                    {timestamp(visitor.firstSeen, data.site.timezone)}
                  </TableCell>
                  <TableCell className="tabular-nums">
                    {timestamp(visitor.lastSeen, data.site.timezone)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {visitor.sessions}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {visitor.pageviews}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <div className="py-16 text-center text-muted-foreground">
            No visitors in this period
          </div>
        )}
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
          <p>
            Consented browsers ·{" "}
            {filters.from
              ? `${filters.from} – ${filters.to}`
              : `${filters.days} days`}{" "}
            · {data.site.timezone}
          </p>
          <nav className="flex items-center gap-2" aria-label="Visitor pages">
            <Button
              size="sm"
              disabled={filters.page === 0}
              onClick={() =>
                void navigate({
                  search: { ...filters, page: filters.page - 1 },
                })
              }
            >
              Previous
            </Button>
            <div className="tabular-nums">
              {filters.page + 1} / {Math.max(1, Math.ceil(data.total / 50))}
            </div>
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
          </nav>
        </div>
        {selected && (
          <JourneyDrawer
            key={`${siteId}:${selected.id}:${selected.asOf}`}
            siteId={siteId}
            visitorId={selected.id}
            asOf={selected.asOf}
            onClose={() => setSelected(null)}
            restoreFocus={() => trigger.current?.focus()}
          />
        )}
      </section>
    </WebsiteLayout>
  );
}
function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: [string, string][];
}) {
  return (
    <div className="inline-grid max-w-full grid-cols-[1fr_2rem]">
      <select
        name={label}
        aria-label={label}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="col-span-full row-start-1 h-9 min-w-0 appearance-none rounded-lg bg-control py-2 pr-8 pl-3 text-sm ring-1 ring-input shadow-xs dark:shadow-none focus-visible:outline-2 focus-visible:outline-ring"
      >
        {options.map(([key, text]) => (
          <option key={key} value={key}>
            {text}
          </option>
        ))}
      </select>
      <ChevronDown
        aria-hidden="true"
        className="pointer-events-none col-start-2 row-start-1 size-4 shrink-0 place-self-center stroke-muted-foreground"
      />
    </div>
  );
}
