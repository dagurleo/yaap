import { useReportingTimezone } from "./report-timezone";
import { ChartNoAxesCombined } from "lucide-react";
import { useId, useMemo, useState } from "react";
import { areaY, defineChart, lineY } from "@tanstack/charts";
import { Chart } from "@tanstack/charts/react/core";
import { tooltip, type ChartTooltipOptions } from "@tanstack/charts/tooltip";
import { portal } from "@tanstack/charts/tooltip/portal";
import { motion } from "@tanstack/charts/motion";
import { scaleLinear } from "@tanstack/charts/scales/linear";
import { decorative } from "@tanstack/charts/mark/decorative";
import { focusGuideX } from "@tanstack/charts/focus/guide";
import { GraphiteIcon } from "@/components/graphite-icon";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { shortDate } from "./overview-toolbar";
const chartRenderer = motion({
  initial: "always",
  transition: { type: "tween", duration: 250, easing: (t) => 1 - (1 - t) ** 3 },
  respectReducedMotion: true,
});
const compactNumber = new Intl.NumberFormat("en", {
  notation: "compact",
  maximumFractionDigits: 1,
});
type Day = { date: string; pageviews: number };
export function PageviewChart({
  series,
  previous,
}: {
  series: Day[];
  previous?: Day[];
}) {
  const timezone = useReportingTimezone();
  const [weekly, setWeekly] = useState(false);
  const labelId = useId();
  const definition = useMemo(() => {
    const aggregate = (days: Day[]) => {
      const rows = weekly
        ? days.reduce<Day[]>((rows, day, index) => {
            if (index % 7 === 0) rows.push({ ...day });
            else rows[rows.length - 1].pageviews += day.pageviews;
            return rows;
          }, [])
        : days;
      return rows.map((day, index) => ({ ...day, index }));
    };
    const current = aggregate(series);
    const prior = aggregate(previous ?? []);
    const largest = Math.max(
      3,
      ...current.map((d) => d.pageviews),
      ...prior.map((d) => d.pageviews),
    );
    const magnitude = 10 ** Math.floor(Math.log10(largest / 3));
    const interval = Math.ceil(largest / 3 / magnitude) * magnitude;
    const lastIndex = Math.max(current.length, prior.length) - 1;
    const tooltipOptions: ChartTooltipOptions<(typeof current)[number]> = {
      portal,
      className: "graphite-chart-tooltip",
      motion: false,
      placement: ["top", "bottom", "left", "right"],
      offset: 12,
      content: ([point]) => {
        if (!point) return { rows: [] };
        const day = point.datum;
        const endDate = weekly
          ? series[Math.min(day.index * 7 + 6, series.length - 1)]?.date
          : undefined;
        const comparison = prior[day.index];
        return {
          title:
            endDate && endDate !== day.date
              ? `${shortDate(day.date)} – ${shortDate(endDate)}`
              : shortDate(day.date),
          rows: [
            {
              label: "Pageviews",
              value: day.pageviews.toLocaleString("en"),
              color: "var(--chart-1)",
            },
            ...(previous
              ? [
                  {
                    label: "Previous period",
                    value: comparison
                      ? comparison.pageviews.toLocaleString("en")
                      : "—",
                    color: "var(--chart-previous)",
                  },
                ]
              : []),
          ],
        };
      },
    };
    const definition = defineChart(
      defineChart(({ width }) => ({
        motion: { path: "morph", delay: 0 },
        marks: [
          decorative(
            areaY(current, {
              id: `pageview-area-${weekly ? "weekly" : "daily"}-${current.length}`,
              x: "index",
              y1: 0,
              y2: "pageviews",
              fill: "var(--chart-area)",
              fillOpacity: 1,
            }),
          ),
          decorative(
            lineY(prior, {
              id: `previous-pageviews-${weekly ? "weekly" : "daily"}-${prior.length}`,
              x: "index",
              y: "pageviews",
              stroke: "var(--chart-previous)",
              strokeWidth: 1.5,
              strokeDasharray: "4 5",
              points: prior.length === 1,
            }),
          ),
          lineY(current, {
            id: `pageviews-${weekly ? "weekly" : "daily"}-${current.length}`,
            x: "index",
            y: "pageviews",
            key: "date",
            stroke: "var(--chart-1)",
            strokeWidth: 2.2,
            points: current.length === 1,
          }),
          focusGuideX(current, {
            motion: false,
            marker: {
              radius: 4,
              fill: "var(--chart-1)",
              stroke: "var(--card)",
              strokeWidth: 2,
            },
            x: "index",
            y: "pageviews",
            xRule: {
              stroke: "var(--chart-previous)",
              strokeWidth: 1.5,
              strokeDasharray: "4 5",
            },
          }),
        ],
        scales: {
          x: {
            scale: scaleLinear().domain(
              lastIndex > 0 ? [0, lastIndex] : [-1, 1],
            ),
            axis: {
              line: false,
              motion: false,
              tickLabels: { fontSize: 11 },
              ticks: {
                values: current.length
                  ? [
                      ...new Set(
                        Array.from({ length: width < 480 ? 3 : 5 }, (_, i) =>
                          Math.round(
                            (i * (current.length - 1)) / (width < 480 ? 2 : 4),
                          ),
                        ),
                      ),
                    ]
                  : [],
                size: 0,
                padding: 12,
                format: (index: number) =>
                  current[index] ? shortDate(current[index].date) : "",
              },
            },
          },
          y: {
            scale: scaleLinear().domain([0, interval * 3]),
            grid: { stroke: "var(--chart-grid)", strokeOpacity: 1 },
            axis: {
              line: false,
              ticks: {
                values: [0, interval, interval * 2, interval * 3],
                format: (value: number) =>
                  compactNumber.format(value).toLowerCase(),
                padding: 10,
                size: 0,
              },
              motion: false,
              tickLabels: { fontSize: 11 },
            },
          },
        },
        // Shared, stable gutters align labels and keep changing tick widths from interrupting motion.
        margin: { top: 10, bottom: 28, left: 40, right: 24 },
        theme: {
          muted: "var(--muted-foreground)",
          foreground: "var(--muted-foreground)",
        },
      })),
      {
        tooltip: { use: tooltip, ...tooltipOptions },
        focus: "nearest-x",
        maxFocusDistance: Infinity,
        focusRing: false,
      },
    );
    return definition;
  }, [series, previous, weekly]);
  const range = (days: Day[]) =>
    days.length
      ? `${shortDate(days[0].date)} – ${shortDate(days.at(-1)!.date)}`
      : "No data";
  return (
    <section className="graphite-trend" aria-labelledby={labelId}>
      <div className="graphite-sectionhead">
        <h2 id={labelId} className="report-heading">
          <ChartNoAxesCombined aria-hidden="true" />
          Pageviews
        </h2>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" type="button" aria-label="Chart interval">
              {weekly ? "Weekly" : "Daily"}
              <GraphiteIcon name="chevron" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              onSelect={() => {
                setWeekly(false);
              }}
            >
              Daily
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => {
                setWeekly(true);
              }}
            >
              Weekly
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <div className="graphite-plot">
        <Chart
          renderer={chartRenderer}
          definition={definition}
          className="graphite-chart"
          height={200}
          initialWidth={1120}
          ariaLabel={`${weekly ? "Weekly" : "Daily"} pageviews`}
          ariaDescription={`Use arrow keys to inspect each ${weekly ? "week" : "day"}, or open the data table below.`}
        />
      </div>
      <div className="graphite-chart-footer">
        <div className="graphite-legend">
          <span>
            <i />
            {range(series)}
          </span>
          {previous && (
            <span>
              <i className="dashed" />
              {range(previous)}
            </span>
          )}
        </div>
        <Dialog>
          <DialogTrigger asChild>
            <button type="button" className="graphite-textbutton">
              View data <GraphiteIcon name="external" />
            </button>
          </DialogTrigger>
          <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-xl">
            <DialogTitle>Daily pageviews</DialogTitle>
            <DialogDescription>
              Pageviews by date in {timezone}. Dashed chart lines show the
              previous period.
            </DialogDescription>
            <table className="graphite-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Pageviews</th>
                  {previous && <th>Previous period</th>}
                </tr>
              </thead>
              <tbody>
                {series.map((day, index) => (
                  <tr key={day.date}>
                    <td>{day.date}</td>
                    <td>{day.pageviews.toLocaleString("en")}</td>
                    {previous && (
                      <td>
                        {previous[index]?.pageviews.toLocaleString("en") ?? "—"}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </DialogContent>
        </Dialog>
      </div>
    </section>
  );
}
