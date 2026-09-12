import { Monitor } from "lucide-react";
import { useState } from "react";
import { unknownValue, type Dimension } from "@/lib/report-filters";
import { BreakdownIcon } from "./breakdown-icon";
import type { overviewFn } from "./functions";
import type { ApplyFilter } from "./report-controls";
import { VisitorBreakdownPanel } from "./visitor-breakdown-panel";

type Report = Awaited<ReturnType<typeof overviewFn>>;
type TechnologyView = "browsers" | "operatingSystems" | "devices";
type TechnologyRow = {
  key: string;
  kind: "browser" | "os" | "device";
  label: string;
  value: string | null;
  visitors: number;
  filter: Partial<Record<Dimension, string>>;
};

export function VisitorTechnologyPanel({
  data,
  onFilter,
  onDetails,
}: {
  data: Report;
  onFilter: ApplyFilter;
  onDetails: () => void;
}) {
  const [view, setView] = useState<TechnologyView>("browsers");
  const info = data.visitorInsights;
  const rows: TechnologyRow[] =
    view === "browsers"
      ? info.visitorBrowsers.map((row) => ({
          key: row.browser ?? unknownValue,
          kind: "browser",
          label: row.browser ?? "Unknown browser",
          value: row.browser,
          visitors: row.visitors,
          filter: { browser: row.browser ?? unknownValue },
        }))
      : view === "operatingSystems"
        ? info.visitorOperatingSystems.map((row) => ({
            key: row.os ?? unknownValue,
            kind: "os",
            label: row.os ?? "Unknown OS",
            value: row.os,
            visitors: row.visitors,
            filter: { os: row.os ?? unknownValue },
          }))
        : info.visitorDevices.map((row) => ({
            key: row.device ?? unknownValue,
            kind: "device",
            label: row.device ?? "Unknown device",
            value: row.device,
            visitors: row.visitors,
            filter: { device: row.device ?? unknownValue },
          }));

  return (
    <VisitorBreakdownPanel
      icon={Monitor}
      label="Visitors by technology"
      tabs={[
        { key: "browsers", label: "Browser" },
        { key: "operatingSystems", label: "OS" },
        { key: "devices", label: "Device" },
      ]}
      selectedTab={view}
      onTabChange={setView}
      rows={rows.map((row) => ({
        key: row.key,
        label: row.label,
        visitors: row.visitors,
        icon: <BreakdownIcon kind={row.kind} value={row.value} />,
        onClick: () => onFilter(row.filter),
      }))}
      emptyMessage="No identified visitors in this period."
      onDetails={onDetails}
    />
  );
}
