import { useQuery } from "@tanstack/react-query";
import { useReportQueries } from "./report-queries";
import { FilterValue, type ApplyFilter } from "./report-controls";
import { unknownValue, type Dimension } from "@/lib/report-filters";
import { useState, type ReactNode } from "react";
import { BreakdownIcon } from "./breakdown-icon";
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
import type { overviewFn } from "./functions";
type Report = Awaited<ReturnType<typeof overviewFn>>;
const countryNames = new Intl.DisplayNames(["en"], { type: "region" });
const countryLabel = (code: string | null) =>
  code ? (countryNames.of(code) ?? code) : "Unknown country";
function Breakdown({
  rows,
  total,
  label,
  onFilter,
}: {
  rows: {
    key: string;
    label: string;
    pageviews: number;
    icon: ReactNode;
    filters: Partial<Record<Dimension, string>>;
  }[];
  onFilter: ApplyFilter;
  total: number;
  label: string;
}) {
  const shown = rows.reduce((sum, row) => sum + row.pageviews, 0);
  return rows.length ? (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{label}</TableHead>
            <TableHead className="text-right">Pageviews</TableHead>
            <TableHead className="text-right">Share</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.key}>
              <TableCell className="max-w-0 w-full whitespace-normal wrap-anywhere">
                <span className="flex items-center gap-2.5">
                  {row.icon}
                  <FilterValue
                    label={row.label}
                    onClick={() => onFilter(row.filters)}
                  >
                    {row.label}
                  </FilterValue>
                </span>
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {row.pageviews}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {((row.pageviews / total) * 100).toFixed(1)}%
              </TableCell>
            </TableRow>
          ))}
          {shown < total && (
            <TableRow>
              <TableCell>Other categories</TableCell>
              <TableCell className="text-right tabular-nums">
                {total - shown}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {(((total - shown) / total) * 100).toFixed(1)}%
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </>
  ) : (
    <p className="py-8 text-center">No data</p>
  );
}
export function VisitorInsights({
  data,
  onFilter,
}: {
  data: Report;
  onFilter: ApplyFilter;
}) {
  const { liveQuery } = useReportQueries();
  const live = useQuery({
    ...liveQuery(data.site.id, data.filters),
    enabled: data.site.capabilities.visitors,
  });
  const [geo, setGeo] = useState<"countries" | "regions" | "cities">(
    "countries",
  );
  const [device, setDevice] = useState<
    "browsers" | "operatingSystems" | "devices"
  >("browsers");
  const info = data.visitorInsights;
  const geoRows =
    geo === "countries"
      ? info.countries.map((row) => ({
          key: JSON.stringify(row.country),
          filters: { country: row.country ?? unknownValue },
          label: countryLabel(row.country),
          icon: <BreakdownIcon kind="country" value={row.country} />,
          pageviews: row.pageviews,
        }))
      : geo === "regions"
        ? info.regions.map((row) => ({
            key: JSON.stringify([row.country, row.region]),
            filters: {
              country: row.country ?? unknownValue,
              region: row.region ?? unknownValue,
            },
            icon: <BreakdownIcon kind="country" value={row.country} />,
            label: `${row.region ?? "Unknown region"} · ${countryLabel(row.country)}`,
            pageviews: row.pageviews,
          }))
        : info.cities.map((row) => ({
            key: JSON.stringify([row.country, row.region, row.city]),
            filters: {
              country: row.country ?? unknownValue,
              region: row.region ?? unknownValue,
              city: row.city ?? unknownValue,
            },
            icon: <BreakdownIcon kind="country" value={row.country} />,
            label: `${row.city ?? "Unknown city"} · ${row.region ? row.region + ", " : ""}${countryLabel(row.country)}`,
            pageviews: row.pageviews,
          }));
  const deviceRows =
    device === "browsers"
      ? info.browsers.map((row) => ({
          key: row.browser ?? "unknown",
          filters: { browser: row.browser ?? unknownValue },
          icon: <BreakdownIcon kind="browser" value={row.browser} />,
          label: row.browser ?? "Unknown browser",
          pageviews: row.pageviews,
        }))
      : device === "operatingSystems"
        ? info.operatingSystems.map((row) => ({
            key: row.os ?? "unknown",
            filters: { os: row.os ?? unknownValue },
            icon: <BreakdownIcon kind="os" value={row.os} />,
            label: row.os ?? "Unknown OS",
            pageviews: row.pageviews,
          }))
        : info.devices.map((row) => ({
            key: row.device ?? "unknown",
            filters: { device: row.device ?? unknownValue },
            icon: <BreakdownIcon kind="device" value={row.device} />,
            label: row.device ?? "Unknown device",
            pageviews: row.pageviews,
          }));
  return (
    <section aria-label="Visitor insights" className="space-y-4">
      <Card>
        <h3>Visitor insights</h3>
        <div className="@container">
          <dl className="grid grid-cols-2 gap-6 @2xl:grid-cols-4 [&>div]:min-w-0 [&_dt]:truncate [&_dt]:text-sm [&_dt]:text-muted-foreground [&_dd]:pt-1 [&_dd]:text-3xl [&_dd]:font-semibold [&_dd]:tabular-nums">
            <div>
              <dt>New visitors</dt>
              <dd>{info.newVisitors}</dd>
            </div>
            <div>
              <dt>Returning visitors</dt>
              <dd>{info.returningVisitors}</dd>
            </div>
            <div>
              <dt>Active in last 5 min</dt>
              <dd>{live.data?.visitors ?? "—"}</dd>
            </div>
            <div>
              <dt>Sessions / visitor</dt>
              <dd>
                {info.sessionsPerVisitor === null
                  ? "—"
                  : info.sessionsPerVisitor.toFixed(1)}
              </dd>
            </div>
          </dl>
        </div>
      </Card>
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <h3>Locations</h3>
          <div
            className="flex max-w-full gap-1 overflow-x-auto rounded-xl bg-muted p-1"
            role="group"
            aria-label="Location breakdown"
          >
            {(
              [
                ["countries", "Countries"],
                ["regions", "Regions"],
                ["cities", "Cities"],
              ] as const
            ).map(([key, label]) => (
              <Button
                key={key}
                size="sm"
                variant={geo === key ? "default" : "ghost"}
                aria-pressed={geo === key}
                onClick={() => setGeo(key)}
              >
                {label}
              </Button>
            ))}
          </div>
          <Breakdown
            rows={geoRows}
            onFilter={onFilter}
            total={data.pageviews}
            label="Location"
          />
        </Card>
        <Card>
          <h3>Technology</h3>
          <div
            className="flex max-w-full gap-1 overflow-x-auto rounded-xl bg-muted p-1"
            role="group"
            aria-label="Technology breakdown"
          >
            {(
              [
                ["browsers", "Browser"],
                ["operatingSystems", "OS"],
                ["devices", "Device"],
              ] as const
            ).map(([key, label]) => (
              <Button
                key={key}
                size="sm"
                variant={device === key ? "default" : "ghost"}
                aria-pressed={device === key}
                onClick={() => setDevice(key)}
              >
                {label}
              </Button>
            ))}
          </div>
          <Breakdown
            rows={deviceRows}
            onFilter={onFilter}
            total={data.pageviews}
            label="Category"
          />
        </Card>
      </div>
      <Card>
        <h3>Visit frequency</h3>
        <dl className="grid grid-cols-3 gap-4 [&_dt]:text-sm [&_dt]:text-muted-foreground [&_dd]:pt-1 [&_dd]:text-2xl [&_dd]:font-semibold [&_dd]:tabular-nums">
          <div>
            <dt>1 session</dt>
            <dd>{info.oneSession}</dd>
          </div>
          <div>
            <dt>2–3 sessions</dt>
            <dd>{info.twoOrThreeSessions}</dd>
          </div>
          <div>
            <dt>4+ sessions</dt>
            <dd>{info.fourPlusSessions}</dd>
          </div>
        </dl>
      </Card>
    </section>
  );
}
