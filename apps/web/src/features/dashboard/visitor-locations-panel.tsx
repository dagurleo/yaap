import { MapPin } from "lucide-react";
import { useState } from "react";
import { unknownValue, type Dimension } from "@/lib/report-filters";
import { BreakdownIcon } from "./breakdown-icon";
import type { overviewFn } from "./functions";
import type { ApplyFilter } from "./report-controls";
import { VisitorBreakdownPanel } from "./visitor-breakdown-panel";

type Report = Awaited<ReturnType<typeof overviewFn>>;
type LocationView = "countries" | "regions" | "cities";
type LocationRow = {
  key: string;
  country: string | null;
  label: string;
  visitors: number;
  filter: Partial<Record<Dimension, string>>;
};

const countryNames = new Intl.DisplayNames(["en"], { type: "region" });
const countryLabel = (code: string | null) =>
  code ? (countryNames.of(code) ?? code) : "Unknown country";

export function VisitorLocationsPanel({
  data,
  onFilter,
  onDetails,
}: {
  data: Report;
  onFilter: ApplyFilter;
  onDetails: () => void;
}) {
  const [view, setView] = useState<LocationView>("countries");
  const info = data.visitorInsights;
  const rows: LocationRow[] =
    view === "countries"
      ? info.visitorCountries.map((row) => ({
          key: row.country ?? unknownValue,
          country: row.country,
          label: countryLabel(row.country),
          visitors: row.visitors,
          filter: { country: row.country ?? unknownValue },
        }))
      : view === "regions"
        ? info.visitorRegions.map((row) => ({
            key: JSON.stringify([row.country, row.region]),
            country: row.country,
            label: `${row.region ?? "Unknown region"} · ${countryLabel(row.country)}`,
            visitors: row.visitors,
            filter: {
              country: row.country ?? unknownValue,
              region: row.region ?? unknownValue,
            },
          }))
        : info.visitorCities.map((row) => ({
            key: JSON.stringify([row.country, row.region, row.city]),
            country: row.country,
            label: `${row.city ?? "Unknown city"} · ${countryLabel(row.country)}`,
            visitors: row.visitors,
            filter: {
              country: row.country ?? unknownValue,
              region: row.region ?? unknownValue,
              city: row.city ?? unknownValue,
            },
          }));
  return (
    <VisitorBreakdownPanel
      icon={MapPin}
      label="Visitors by location"
      tabs={[
        { key: "countries", label: "Country" },
        { key: "regions", label: "Region" },
        { key: "cities", label: "City" },
      ]}
      selectedTab={view}
      onTabChange={setView}
      rows={rows.map((row) => ({
        key: row.key,
        label: row.label,
        visitors: row.visitors,
        icon: <BreakdownIcon kind="country" value={row.country} />,
        onClick: () => onFilter(row.filter),
      }))}
      emptyMessage="No identified visitors in this period."
      onDetails={onDetails}
    />
  );
}
