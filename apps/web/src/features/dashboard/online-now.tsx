import { useQuery } from "@tanstack/react-query";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { reportFilters } from "@/lib/report-filters";
import { liveQuery } from "./queries";
import { BreakdownIcon } from "./breakdown-icon";
import { TrafficSourceIcon } from "./traffic-source-icon";

const regions = new Intl.DisplayNames(["en"], { type: "region" });
export function OnlineNow({ siteId }: { siteId: string }) {
  // Presence always describes this website now, independent of report dates/segments.
  const live = useQuery(liveQuery(siteId, reportFilters({})));
  const online = live.data?.online;
  const unavailable = live.isError;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex h-8 items-center gap-2 rounded-md px-2 text-xs text-muted-foreground hover:bg-accent hover:text-accent-foreground focus-visible:outline-2 focus-visible:outline-ring"
          title="Visible pages active within the last 60 seconds"
          aria-label="Show visitors online now"
        >
          <span
            aria-hidden="true"
            className={`size-1.5 rounded-full ${!unavailable && online?.visitors ? "bg-success" : "bg-muted-foreground/50"}`}
          />
          <span className="tabular-nums">
            {unavailable
              ? "Online unavailable"
              : online
                ? `${online.visitors.toLocaleString()} online now`
                : "Checking online…"}
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-[380px] max-w-[calc(100vw-2rem)] p-0"
        aria-label="Visitors online now"
      >
        <div className="border-b px-4 py-3">
          <h2 className="text-sm font-semibold">Online now</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Visible pages active within the last 60 seconds.
          </p>
        </div>
        {unavailable ? (
          <div role="alert" className="space-y-2 p-4 text-sm">
            Couldn’t refresh online visitors.
            <Button
              size="sm"
              variant="outline"
              onClick={() => void live.refetch()}
            >
              Retry
            </Button>
          </div>
        ) : !online ? (
          <p className="p-6 text-center text-sm text-muted-foreground">
            Loading visitors…
          </p>
        ) : online.rows.length ? (
          <ul className="max-h-80 divide-y overflow-auto px-4">
            {online.rows.map((visitor) => (
              <li
                key={visitor.visitorId}
                className="flex items-start gap-3 py-3"
              >
                <BreakdownIcon kind="country" value={visitor.country} />
                <div className="min-w-0 flex-1">
                  <div
                    className="truncate text-sm font-medium"
                    title={visitor.path}
                  >
                    {visitor.path}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {visitor.country
                      ? regions.of(visitor.country)
                      : "Unknown country"}
                  </div>
                  <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                    <TrafficSourceIcon value={visitor.source} />
                    <span className="truncate">{visitor.source}</span>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="p-6 text-center text-sm text-muted-foreground">
            No visitors online right now.
          </p>
        )}
        <div className="border-t px-4 py-3 text-xs text-muted-foreground">
          {online && online.visitors > online.rows.length && !unavailable && (
            <p className="mb-1">
              Showing the {online.rows.length} most recently active visitors.
            </p>
          )}
          Consented visitors across this website · Refreshes every 5s
        </div>
      </PopoverContent>
    </Popover>
  );
}
