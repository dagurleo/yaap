import { useState, type CSSProperties, type ReactNode } from "react";
import { Route as RouteIcon, Files, type LucideIcon } from "lucide-react";
import { GraphiteIcon } from "@/components/graphite-icon";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { unknownValue } from "@/lib/report-filters";
import type { overviewFn } from "./functions";
import type { ApplyFilter } from "./report-controls";
import { TrafficSourceIcon } from "./traffic-source-icon";

type Report = Awaited<ReturnType<typeof overviewFn>>;
type Row = {
  key: string;
  label: string;
  icon?: ReactNode;
  count: number;
  filter: Parameters<ApplyFilter>[0];
};
const format = (n: number) => new Intl.NumberFormat("en").format(n);
function Breakdown({
  title,
  icon: Icon,
  tabs,
  rows,
  firstColumn,
  countColumn,
  total,
  onFilter,
}: {
  title: string;
  icon: LucideIcon;
  tabs: { label: string; selected: boolean; onClick: () => void }[];
  rows: Row[];
  firstColumn: string;
  countColumn: string;
  total: number;
  onFilter: ApplyFilter;
}) {
  const [open, setOpen] = useState(false),
    [query, setQuery] = useState("");
  function table(items: Row[]) {
    return (
      <table className="graphite-table">
        <thead>
          <tr>
            <th scope="col">{firstColumn}</th>
            <th scope="col">{countColumn}</th>
            <th scope="col">Share</th>
          </tr>
        </thead>
        <tbody>
          {items.map((row) => (
            <tr key={row.key}>
              <td>
                <button
                  type="button"
                  className="graphite-row-link"
                  aria-label={`Filter by ${row.label}`}
                  onClick={() => {
                    onFilter(row.filter);
                    setOpen(false);
                  }}
                >
                  <span
                    aria-hidden="true"
                    className="graphite-row-bar"
                    style={
                      {
                        "--share": `${total ? (row.count / total) * 360 : 0}%`,
                      } as CSSProperties
                    }
                  />
                  <span className="flex min-w-0 items-center gap-2">
                    {row.icon}
                    <span className="min-w-0">{row.label}</span>
                  </span>
                </button>
              </td>
              <td>{format(row.count)}</td>
              <td className="graphite-muted">
                {total ? ((row.count / total) * 100).toFixed(1) : "0.0"}%
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }
  return (
    <section>
      <div className="graphite-sectionhead">
        <h2 className="report-heading">
          <Icon aria-hidden="true" />
          {title}
        </h2>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <button
              type="button"
              className="graphite-textbutton"
              aria-label={`View all ${title.toLowerCase()}`}
            >
              View all <GraphiteIcon name="external" />
            </button>
          </DialogTrigger>
          <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-2xl">
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>
              All available{" "}
              {tabs.find((tab) => tab.selected)?.label.toLowerCase()} for this
              period. Select a row to filter traffic.
            </DialogDescription>
            <Input
              name="search-breakdown"
              aria-label={`Search ${title.toLowerCase()}`}
              placeholder="Search results…"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            {table(
              rows.filter((row) =>
                row.label.toLowerCase().includes(query.toLowerCase()),
              ),
            )}
          </DialogContent>
        </Dialog>
      </div>
      <div
        className="graphite-tabs"
        role="group"
        aria-label={`${title} breakdown`}
      >
        {tabs.map((tab) => (
          <button
            type="button"
            key={tab.label}
            aria-pressed={tab.selected}
            onClick={tab.onClick}
          >
            {tab.label}
          </button>
        ))}
      </div>
      {rows.length ? (
        table(rows.slice(0, 5))
      ) : (
        <p className="graphite-empty">No data in this period.</p>
      )}
    </section>
  );
}
export function OverviewBreakdowns({
  data,
  onFilter,
}: {
  data: Report;
  onFilter: ApplyFilter;
}) {
  const [source, setSource] = useState("Sources"),
    [page, setPage] = useState("Pages");
  const sourceRows: Row[] =
    source === "Sources"
      ? data.sources.map((row) => ({
          key: row.source,
          label: row.source,
          icon: <TrafficSourceIcon value={row.source} />,
          count: row.pageviews,
          filter: { source: row.source },
        }))
      : source === "Referrers"
        ? data.referrers.map((row) => ({
            key: row.host ?? unknownValue,
            label: row.host ?? "Unknown referrer",
            icon: <TrafficSourceIcon value={row.host} kind="referrer" />,
            count: row.pageviews,
            filter: { referrer: row.host ?? unknownValue },
          }))
        : data.campaigns.map((row) => ({
            key: JSON.stringify([row.campaign, row.source, row.medium]),
            label: row.campaign ?? "Unknown campaign",
            icon: <TrafficSourceIcon value={row.source} kind="campaign" />,
            count: row.pageviews,
            filter: { campaign: row.campaign ?? unknownValue },
          }));
  const pageRows: Row[] =
    page === "Pages"
      ? data.pages.map((row) => ({
          key: row.path,
          label: row.path,
          count: row.pageviews,
          filter: { path: row.path },
        }))
      : data.sessionStats[
          page === "Entry pages" ? "entryPages" : "exitPages"
        ].map((row) => ({
          key: row.path,
          label: row.path,
          count: row.sessions,
          filter: { path: row.path },
        }));
  return (
    <div className="graphite-reports">
      <Breakdown
        title="Traffic sources"
        icon={RouteIcon}
        tabs={["Sources", "Referrers", "Campaigns"].map((label) => ({
          label,
          selected: label === source,
          onClick: () => setSource(label),
        }))}
        rows={sourceRows}
        firstColumn={
          source === "Sources"
            ? "Source"
            : source === "Referrers"
              ? "Website"
              : "Campaign"
        }
        countColumn="Pageviews"
        total={data.pageviews}
        onFilter={onFilter}
      />
      <Breakdown
        title="Top pages"
        icon={Files}
        tabs={["Pages", "Entry pages", "Exit pages"].map((label) => ({
          label,
          selected: label === page,
          onClick: () => setPage(label),
        }))}
        rows={pageRows}
        firstColumn="Page"
        countColumn={page === "Pages" ? "Pageviews" : "Sessions"}
        total={
          page === "Pages" ? data.pageviews : data.sessionStats.pageviewSessions
        }
        onFilter={onFilter}
      />
    </div>
  );
}
