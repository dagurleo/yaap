import type { CSSProperties, ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { GraphiteIcon } from "@/components/graphite-icon";

export type VisitorBreakdownRow = {
  key: string;
  label: string;
  icon: ReactNode;
  visitors: number;
  onClick: () => void;
};

export function VisitorBreakdownPanel<Tab extends string>({
  label,
  icon: Icon,
  tabs,
  selectedTab,
  onTabChange,
  rows,
  emptyMessage,
  onDetails,
}: {
  label: string;
  icon: LucideIcon;
  tabs: readonly { key: Tab; label: string }[];
  selectedTab: Tab;
  onTabChange: (key: Tab) => void;
  rows: VisitorBreakdownRow[];
  emptyMessage: string;
  onDetails: () => void;
}) {
  const largest = Math.max(1, ...rows.map((row) => row.visitors));

  return (
    <section aria-label={label}>
      <div className="graphite-sectionhead">
        <h2 className="report-heading">
          <Icon aria-hidden="true" />
          {label}
        </h2>
        <button
          type="button"
          className="graphite-textbutton"
          aria-label={`View all ${label.toLowerCase()}`}
          onClick={onDetails}
        >
          View all <GraphiteIcon name="external" />
        </button>
      </div>
      <div
        className="graphite-tabs"
        role="group"
        aria-label={`${label} breakdown`}
      >
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            aria-pressed={selectedTab === tab.key}
            onClick={() => onTabChange(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      {rows.length ? (
        <table className="graphite-table">
          <thead>
            <tr>
              <th scope="col">
                {tabs.find((tab) => tab.key === selectedTab)?.label}
              </th>
              <th scope="col">Visitors</th>
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, 5).map((row) => (
              <tr key={row.key}>
                <td>
                  <button
                    type="button"
                    className="graphite-row-link"
                    aria-label={`Filter by ${row.label}`}
                    onClick={row.onClick}
                  >
                    <span
                      aria-hidden="true"
                      className="graphite-row-bar"
                      style={
                        {
                          "--share": `${(row.visitors / largest) * 95}%`,
                        } as CSSProperties
                      }
                    />
                    <span className="flex min-w-0 items-center gap-2">
                      {row.icon}
                      <span className="min-w-0">{row.label}</span>
                    </span>
                  </button>
                </td>
                <td>{row.visitors.toLocaleString("en")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="graphite-empty">{emptyMessage}</p>
      )}
    </section>
  );
}
