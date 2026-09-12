import { useSuspenseQuery } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { operationsQuery } from "./queries";
import { timestamp } from "./journey-drawer";
const labels = {
  queued: "Queued",
  stored: "Stored",
  duplicates: "Duplicates",
  bots: "Bots excluded",
  enqueueFailures: "Queue failures",
  writeFailures: "Write failures",
  expired: "Expired on replay",
};
export function IngestionSettings({ siteId }: { siteId: string }) {
  const { data, error, isFetching, refetch } = useSuspenseQuery(
    operationsQuery(siteId),
  );
  return (
    <>
      <section className="space-y-5">
        <div className="flex items-center justify-between">
          <h2 className="text-lg">Ingestion</h2>
          <Button
            size="icon"
            disabled={isFetching}
            aria-label="Refresh ingestion"
            onClick={() => void refetch()}
          >
            <RefreshCw
              className={isFetching ? "motion-safe:animate-spin" : ""}
            />
          </Button>
        </div>
        {error && (
          <p role="alert" className="text-destructive">
            Could not refresh ingestion.
          </p>
        )}
        <Card>
          <div className="flex flex-wrap justify-between gap-2 text-xs text-muted-foreground">
            <span>24 hourly buckets · {data.site.timezone}</span>
            <span>
              Last stored:{" "}
              {data.lastStoredAt
                ? timestamp(data.lastStoredAt, data.site.timezone)
                : "—"}
            </span>
          </div>
          <dl className="grid grid-cols-2 gap-5 sm:grid-cols-4 [&_dt]:text-xs [&_dt]:text-muted-foreground [&_dd]:pt-1 [&_dd]:text-2xl [&_dd]:tabular-nums">
            {Object.entries(labels).map(([key, label]) => (
              <div key={key}>
                <dt>{label}</dt>
                <dd>{data.counters[key as keyof typeof labels]}</dd>
              </div>
            ))}
          </dl>
          {(data.counters.enqueueFailures > 0 ||
            data.counters.writeFailures > 0) && (
            <p role="status" className="text-sm text-destructive">
              Delivery failures recorded. Check Worker logs and the dead-letter
              queue.
            </p>
          )}
          <details className="text-sm">
            <summary className="cursor-pointer">Hourly activity</summary>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr>
                    {[
                      "Hour",
                      "Queued",
                      "Stored",
                      "Duplicates",
                      "Bots",
                      "Queue failures",
                      "Write failures",
                      "Expired",
                    ].map((label) => (
                      <th
                        className="p-2 font-medium whitespace-nowrap"
                        key={label}
                      >
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.hours.map((row) => (
                    <tr key={row.hour} className="border-t border-border">
                      <td className="p-2 whitespace-nowrap">
                        {timestamp(row.hour, data.site.timezone)}
                      </td>
                      {Object.keys(labels).map((key) => (
                        <td className="p-2 tabular-nums" key={key}>
                          {row[key as keyof typeof labels]}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </Card>

        <p className="text-xs text-muted-foreground">
          Last retention run:{" "}
          {data.site.lastCleanupAt
            ? timestamp(data.site.lastCleanupAt, data.site.timezone)
            : "—"}
        </p>
      </section>
    </>
  );
}
