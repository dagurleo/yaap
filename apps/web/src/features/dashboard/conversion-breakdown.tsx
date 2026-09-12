import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { FunnelSelect } from "./funnel-editor";
import { conversionsQuery } from "./queries";
import type { ReportFilters } from "@/lib/report-filters";
import {
  conversionFilters,
  type ConversionFilters,
} from "@/lib/conversion-filters";
import { conditionsLabel } from "@/lib/conversion-conditions";

const number = (value: number) => new Intl.NumberFormat("en").format(value);
const rate = (value: number | null) =>
  value === null ? "—" : `${(value * 100).toFixed(1)}%`;
export function ConversionBreakdown({
  siteId,
  filters,
  goalId,
  onGoalChange,
}: {
  siteId: string;
  filters: ReportFilters;
  goalId: string;
  onGoalChange: (id: string) => void;
}) {
  const [dimension, setDimension] =
    useState<ConversionFilters["dimension"]>("source");
  const [sort, setSort] = useState<ConversionFilters["sort"]>("sessions");
  const [direction, setDirection] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(0);
  const query = useQuery(
    conversionsQuery(
      siteId,
      conversionFilters({
        ...filters,
        goalId,
        dimension,
        sort,
        direction,
        page,
      }),
    ),
  );
  const data = query.data;
  function sortBy(next: ConversionFilters["sort"]) {
    setDirection(sort === next && direction === "desc" ? "asc" : "desc");
    setSort(next);
    setPage(0);
  }
  return (
    <section
      className="@container min-w-0 space-y-5"
      aria-label="Conversion performance"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2>Conversion performance</h2>
        <Button
          size="sm"
          disabled={query.isFetching}
          onClick={() => void query.refetch()}
        >
          Refresh conversions
        </Button>
      </div>
      <p className="text-base text-muted-foreground sm:text-sm">
        Compare sources and landing pages by sessions that complete a goal.
        Filters use session acquisition context.
      </p>
      {data && data.goals.length > 0 && (
        <Label className="max-w-sm">
          Goal
          <FunnelSelect
            aria-label="Conversion goal"
            value={data.selected?.id ?? ""}
            onChange={(e) => onGoalChange(e.target.value)}
          >
            {!data.selected && <option value="">Choose a goal</option>}
            {data.goals.map((goal) => (
              <option key={goal.id} value={goal.id}>
                {goal.name}
                {goal.archived ? " (archived)" : ""}
              </option>
            ))}
          </FunnelSelect>
        </Label>
      )}
      {query.isPending && <p role="status">Loading conversion performance…</p>}
      {query.error && (
        <p role="alert" className="text-destructive">
          Could not load conversion performance. {query.error.message} Use
          Refresh conversions to try again.
        </p>
      )}
      {data && !data.selected && (
        <p>Create a goal below to compare converting sessions.</p>
      )}
      {data?.selected && data.totals && (
        <>
          <p className="text-sm text-muted-foreground wrap-anywhere">
            {data.selected.path ?? data.selected.eventName}
            {conditionsLabel(data.selected.conditions)
              ? ` · ${conditionsLabel(data.selected.conditions)}`
              : ""}
          </p>
          <dl className="grid gap-4 @md:grid-cols-3">
            {[
              [
                "Sessions",
                number(data.totals.sessions),
                number(data.totals.previousSessions),
              ],
              [
                "Converted sessions",
                number(data.totals.convertedSessions),
                number(data.totals.previousConvertedSessions),
              ],
              [
                "Session conversion",
                rate(data.totals.conversionRate),
                rate(data.totals.previousConversionRate),
              ],
            ].map(([label, value, previous]) => (
              <div key={label}>
                <dt className="truncate text-sm font-medium">{label}</dt>
                <dd className="pt-1 text-2xl tabular-nums">{value}</dd>
                {filters.compare && (
                  <dd className="text-sm text-muted-foreground tabular-nums">
                    Previously {previous}
                  </dd>
                )}
              </div>
            ))}
          </dl>
          <div
            role="group"
            aria-label="Conversion breakdown"
            className="flex gap-2"
          >
            {(["source", "landing"] as const).map((value) => (
              <Button
                key={value}
                size="sm"
                variant={dimension === value ? "secondary" : "ghost"}
                aria-pressed={dimension === value}
                onClick={() => {
                  setDimension(value);
                  setPage(0);
                }}
              >
                {value === "source" ? "Sources" : "Landing pages"}
              </Button>
            ))}
          </div>
          <div
            className="-my-2 overflow-x-auto"
            tabIndex={0}
            role="region"
            aria-label="Conversion breakdown table"
          >
            <div className="inline-block min-w-full py-2 align-middle">
              <table className="w-full text-sm tabular-nums">
                <caption className="sr-only">
                  {dimension === "source" ? "Sources" : "Landing pages"} for{" "}
                  {data.selected.name}
                </caption>
                <thead>
                  <tr className="border-b">
                    <th
                      className="py-3 pr-4 text-left whitespace-nowrap"
                      scope="col"
                    >
                      {dimension === "source" ? "Source" : "Landing page"}
                    </th>
                    {(
                      [
                        ["sessions", "Sessions"],
                        ["convertedSessions", "Converted sessions"],
                        ["conversionRate", "Conversion rate"],
                      ] as const
                    ).map(([key, label]) => (
                      <th
                        key={key}
                        className="px-3 py-3 text-right whitespace-nowrap"
                        scope="col"
                        aria-sort={
                          sort === key
                            ? direction === "desc"
                              ? "descending"
                              : "ascending"
                            : "none"
                        }
                      >
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => sortBy(key)}
                        >
                          {label}
                          {sort === key
                            ? direction === "desc"
                              ? " ↓"
                              : " ↑"
                            : ""}
                        </Button>
                      </th>
                    ))}
                    {filters.compare && (
                      <th
                        scope="col"
                        className="px-3 py-3 text-right whitespace-nowrap"
                      >
                        Rate change
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((row) => (
                    <tr
                      key={JSON.stringify(row.key)}
                      className="border-b last:border-0"
                    >
                      <th
                        scope="row"
                        className="min-w-40 max-w-sm py-4 pr-4 text-left font-normal wrap-anywhere"
                      >
                        {row.key ?? "No pageview recorded"}
                      </th>
                      <td className="px-3 py-4 text-right">
                        {number(row.sessions)}
                        {filters.compare && (
                          <p className="text-xs text-muted-foreground">
                            Previously {number(row.previousSessions)}
                          </p>
                        )}
                      </td>
                      <td className="px-3 py-4 text-right">
                        {number(row.convertedSessions)}
                        {filters.compare && (
                          <p className="text-xs text-muted-foreground">
                            Previously {number(row.previousConvertedSessions)}
                          </p>
                        )}
                      </td>
                      <td className="px-3 py-4 text-right">
                        {rate(row.conversionRate)}
                        {filters.compare && (
                          <p className="text-xs text-muted-foreground">
                            Previously {rate(row.previousConversionRate)}
                          </p>
                        )}
                      </td>
                      {filters.compare && (
                        <td className="px-3 py-4 text-right whitespace-nowrap">
                          {row.conversionRate === null ||
                          row.previousConversionRate === null
                            ? "—"
                            : `${row.conversionRate >= row.previousConversionRate ? "+" : ""}${((row.conversionRate - row.previousConversionRate) * 100).toFixed(1)} pp`}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          {!data.rows.length && (
            <p>
              No sessions match this goal report's dates and acquisition
              filters.
            </p>
          )}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground" role="status">
              {data.rows.length
                ? `${page * 50 + 1}–${page * 50 + data.rows.length} of ${number(data.groups)} groups`
                : `0 of ${number(data.groups)} groups`}
            </p>
            <div className="flex gap-2">
              <Button
                size="sm"
                disabled={page === 0 || query.isFetching}
                onClick={() => setPage(page - 1)}
              >
                Previous
              </Button>
              <Button
                size="sm"
                disabled={!data.hasMore || query.isFetching}
                onClick={() => setPage(page + 1)}
              >
                Next
              </Button>
            </div>
          </div>
          <details className="text-sm text-muted-foreground">
            <summary className="cursor-pointer">
              How sessions are attributed
            </summary>
            <p className="pt-2">
              Sessions active in the period are grouped by the source on their
              first retained event and their first retained pageview's path.
              Sessions without a pageview stay in a separate group. Filters
              apply to the first event; the page filter applies to the landing
              page. A goal can occur anywhere in that session within the period
              and counts once. Anonymous events are excluded. Retention can
              change the available acquisition history. These totals can differ
              from the event-filtered goal cards below.
            </p>
          </details>
        </>
      )}
    </section>
  );
}
