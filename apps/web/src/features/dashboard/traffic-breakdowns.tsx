import { FilterValue, type ApplyFilter } from "./report-controls";
import { unknownValue } from "@/lib/report-filters";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  TableCaption,
} from "@/components/ui/table";
import type { overviewFn } from "./functions";
import { TrafficSourceIcon } from "./traffic-source-icon";

type Report = Awaited<ReturnType<typeof overviewFn>>;

export function TrafficBreakdowns({
  data,
  onFilter,
}: {
  data: Report;
  onFilter: ApplyFilter;
}) {
  return (
    <div className="grid min-w-0 gap-4 md:grid-cols-2">
      <Card>
        <h3>Traffic sources</h3>
        {data.sources.length ? (
          <Table>
            <TableCaption className="sr-only">
              Traffic sources by pageviews
            </TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead scope="col">Source</TableHead>
                <TableHead scope="col">Pageviews</TableHead>
                <TableHead scope="col">Share</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.sources.map((row) => (
                <TableRow key={row.source}>
                  <TableCell>
                    <FilterValue
                      label={row.source}
                      onClick={() => onFilter({ source: row.source })}
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <TrafficSourceIcon value={row.source} />
                        <span className="min-w-0">{row.source}</span>
                      </span>
                    </FilterValue>
                  </TableCell>
                  <TableCell>{row.pageviews}</TableCell>
                  <TableCell>
                    {((row.pageviews / data.pageviews) * 100).toFixed(1)}%
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <p>No data</p>
        )}
      </Card>
      <Card>
        <h3>Referring websites</h3>
        {data.referrers.length ? (
          <Table>
            <TableCaption className="sr-only">
              External referrer hosts
            </TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead scope="col">Website</TableHead>
                <TableHead scope="col">Pageviews</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.referrers.map((row) => (
                <TableRow key={row.host}>
                  <TableCell>
                    <FilterValue
                      label={row.host ?? "Unknown referrer"}
                      onClick={() =>
                        onFilter({ referrer: row.host ?? unknownValue })
                      }
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <TrafficSourceIcon value={row.host} kind="referrer" />
                        <span className="min-w-0">
                          {row.host ?? "Unknown referrer"}
                        </span>
                      </span>
                    </FilterValue>
                  </TableCell>
                  <TableCell>{row.pageviews}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <p>No data</p>
        )}
      </Card>
      <Card>
        <h3>Campaigns</h3>
        {data.campaigns.length ? (
          <Table>
            <TableCaption className="sr-only">
              Campaign source and medium by pageviews
            </TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead scope="col">Campaign</TableHead>
                <TableHead scope="col">Pageviews</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.campaigns.map((row) => (
                <TableRow
                  key={JSON.stringify([row.campaign, row.source, row.medium])}
                >
                  <TableCell>
                    <FilterValue
                      label={row.campaign ?? "Unknown campaign"}
                      onClick={() =>
                        onFilter({ campaign: row.campaign ?? unknownValue })
                      }
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <TrafficSourceIcon value={row.source} kind="campaign" />
                        <span className="min-w-0">
                          {row.campaign ?? "Unknown campaign"}
                        </span>
                      </span>
                    </FilterValue>
                    <p className="pt-1 text-xs text-muted-foreground">
                      {row.source ?? "No source"} · {row.medium ?? "No medium"}
                    </p>
                  </TableCell>
                  <TableCell>{row.pageviews}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <p>No data</p>
        )}
      </Card>
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3 [&>div]:min-w-0">
          <h3>Custom events</h3>
          <p>
            {data.customTotals.count} events · {data.customTotals.names} names
          </p>
        </div>
        {data.customEvents.length ? (
          <Table>
            <TableCaption className="sr-only">
              Custom event counts, separate from pageviews
            </TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead scope="col">Event</TableHead>
                <TableHead scope="col">Count</TableHead>
                <TableHead scope="col">Visitors</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.customEvents.map((row) => (
                <TableRow key={row.name}>
                  <TableCell>{row.name}</TableCell>
                  <TableCell>{row.count}</TableCell>
                  <TableCell>{row.visitors || "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <p>No data</p>
        )}
      </Card>
    </div>
  );
}
