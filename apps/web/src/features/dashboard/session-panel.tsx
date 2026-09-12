import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { BreakdownIcon } from "./breakdown-icon";
import { FilterValue, type ApplyFilter } from "./report-controls";
import { JourneyDrawer, visitorLabel } from "./journey-drawer";
import { liveQuery } from "./queries";
import { TrafficSourceIcon } from "./traffic-source-icon";
import type { overviewFn } from "./functions";
type Report = Awaited<ReturnType<typeof overviewFn>>;
export const durationLabel = (milliseconds: number | null) => {
  if (milliseconds === null) return "—";
  const seconds = Math.round(milliseconds / 1000);
  return seconds >= 3600
    ? `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`
    : `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
};
export function SessionPanel({
  data,
  onFilter,
}: {
  data: Report;
  onFilter: ApplyFilter;
}) {
  const [tab, setTab] = useState<"entryPages" | "exitPages">("entryPages");
  const stats = data.sessionStats;
  const previous = data.comparison?.sessionStats;
  const live = useQuery({
    ...liveQuery(data.site.id, data.filters),
    initialData: data.live ?? undefined,
  });
  const [selected, setSelected] = useState<{ id: string; asOf: number } | null>(
    null,
  );
  const trigger = useRef<HTMLButtonElement | null>(null);
  return (
    <div className="grid items-start gap-4 md:grid-cols-2">
      <Card>
        <h3>Sessions</h3>
        <dl className="grid grid-cols-2 gap-5 [&>div]:min-w-0 [&_dt]:truncate [&_dt]:text-sm [&_dt]:text-muted-foreground [&_dd]:pt-1 [&_dd]:text-3xl [&_dd]:font-semibold [&_dd]:tabular-nums">
          <div>
            <dt title="Sessions with one pageview and no custom events, divided by sessions with a pageview.">
              Bounce rate
            </dt>
            <dd>
              {stats.bounceRate === null
                ? "—"
                : `${(stats.bounceRate * 100).toFixed(1)}%`}
            </dd>
            {previous && (
              <div className="pt-1 text-xs text-muted-foreground tabular-nums">
                {stats.bounceRate === null || previous.bounceRate === null
                  ? "—"
                  : `${((stats.bounceRate - previous.bounceRate) * 100).toFixed(1)} pp`}{" "}
                vs previous
              </div>
            )}
          </div>
          <div>
            <dt title="Average elapsed time between the first and last recorded event in each matched session.">
              Session duration
            </dt>
            <dd>{durationLabel(stats.averageDurationMs)}</dd>
            {previous && (
              <div className="pt-1 text-xs text-muted-foreground tabular-nums">
                Previously {durationLabel(previous.averageDurationMs)}
              </div>
            )}
          </div>
        </dl>
        <div
          className="flex gap-1 rounded-xl bg-muted p-1"
          role="group"
          aria-label="Session pages"
        >
          {(
            [
              ["entryPages", "Entry pages"],
              ["exitPages", "Exit pages"],
            ] as const
          ).map(([value, label]) => (
            <Button
              key={value}
              size="sm"
              aria-pressed={tab === value}
              variant={tab === value ? "default" : "ghost"}
              onClick={() => setTab(value)}
            >
              {label}
            </Button>
          ))}
        </div>
        {stats[tab].length ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Page</TableHead>
                <TableHead className="text-right">Sessions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {stats[tab].map((row) => (
                <TableRow key={row.path}>
                  <TableCell className="w-full max-w-0 whitespace-normal wrap-anywhere">
                    <FilterValue
                      label={row.path}
                      onClick={() => onFilter({ path: row.path })}
                    >
                      {row.path}
                    </FilterValue>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {row.sessions}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <p className="py-8 text-center">No sessions</p>
        )}
      </Card>
      <Card>
        <div className="flex items-center justify-between gap-3">
          <h3>Live activity</h3>
          <div className="flex items-center gap-2 text-sm tabular-nums">
            <span
              aria-hidden="true"
              className={`size-2 rounded-full ${live.data?.visitors ? "bg-success" : "bg-chart-previous"}`}
            />
            {live.data?.visitors ?? "—"}
          </div>
        </div>
        <p className="text-xs">Last 5 minutes</p>
        {live.isError && (
          <div
            role="alert"
            className="flex flex-wrap items-center gap-2 text-sm text-destructive"
          >
            Live refresh failed.
            <Button size="sm" onClick={() => void live.refetch()}>
              Retry
            </Button>
          </div>
        )}
        {live.data?.rows.length ? (
          <ul role="list" className="divide-y divide-border">
            {live.data?.rows.map((visitor) => (
              <li key={visitor.visitorId} className="py-3 first:pt-0 last:pb-0">
                <Button
                  variant="ghost"
                  className="h-auto w-full justify-start gap-3 whitespace-normal py-2 text-left"
                  onClick={(event) => {
                    trigger.current = event.currentTarget;
                    setSelected({
                      id: visitor.visitorId,
                      asOf: live.data?.asOf ?? data.asOf,
                    });
                  }}
                  aria-label={`View live journey for ${visitorLabel(visitor.visitorId)}`}
                >
                  <BreakdownIcon kind="country" value={visitor.country} />
                  <div className="min-w-0 flex-1 space-y-1">
                    <div>{visitorLabel(visitor.visitorId)}</div>
                    <div className="truncate font-normal text-muted-foreground">
                      {visitor.name === "pageview"
                        ? visitor.path
                        : `${visitor.name} · ${visitor.path}`}
                    </div>
                    <div className="flex min-w-0 items-center gap-1.5 text-xs font-normal text-muted-foreground">
                      <TrafficSourceIcon value={visitor.source} />
                      <span className="min-w-0 truncate">{visitor.source}</span>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2 text-xs font-normal text-muted-foreground tabular-nums">
                    {Math.floor(
                      ((live.data?.asOf ?? data.asOf) - visitor.receivedAt) /
                        1000,
                    )}
                    s
                    <ArrowRight aria-hidden="true" className="size-4" />
                  </div>
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="py-8 text-center">
            {live.isPending
              ? "Loading…"
              : live.isError
                ? "Live activity unavailable"
                : "No recent visitors"}
          </p>
        )}
        {live.data && live.data.visitors > live.data.rows.length && (
          <p className="text-xs">{live.data?.rows.length} most recent</p>
        )}
      </Card>
      {selected && (
        <JourneyDrawer
          key={selected.id}
          siteId={data.site.id}
          visitorId={selected.id}
          asOf={selected.asOf}
          onClose={() => setSelected(null)}
          restoreFocus={() => trigger.current?.focus()}
        />
      )}
    </div>
  );
}
