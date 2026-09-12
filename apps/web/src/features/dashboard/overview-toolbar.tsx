import { useReportingTimezone } from "./report-timezone";
import { useState } from "react";
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
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { ReportDates } from "./report-controls";
import {
  dimensionKeys,
  dimensionLabels,
  type Dimension,
  type ReportFilters,
} from "@/lib/report-filters";

export const shortDate = (value: number | string) =>
  new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(value));
export function OverviewToolbar({
  filters,
  onChange,
}: {
  filters: ReportFilters;
  onChange: (next: ReportFilters) => void;
}) {
  const timezone = useReportingTimezone();
  const [open, setOpen] = useState(false),
    [dimension, setDimension] = useState<Dimension>("path"),
    [value, setValue] = useState("");
  return (
    <div className="graphite-toolbar">
      <ReportDates filters={filters} onChange={onChange} />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            size="sm"
            type="button"
            className="max-[700px]:order-3"
            aria-label="Compare periods"
          >
            <GraphiteIcon name="compare" />
            {filters.compare ? "Previous period" : "Compare"}
            <GraphiteIcon name="chevron" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem
            onSelect={() => onChange({ ...filters, compare: true })}
          >
            Previous period
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => onChange({ ...filters, compare: false })}
          >
            No comparison
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button size="sm" type="button">
            <GraphiteIcon name="filter" />
            Filter
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogTitle>Filter traffic</DialogTitle>
          <DialogDescription>
            Match one dimension exactly. Filters apply across your reports.
          </DialogDescription>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (!value.trim()) return;
              onChange({ ...filters, [dimension]: value.trim() });
              setOpen(false);
            }}
          >
            <Label>
              Dimension
              <select
                name="dimension"
                className="h-9 rounded-md bg-control px-3 ring-1 ring-input"
                value={dimension}
                onChange={(event) =>
                  setDimension(event.target.value as Dimension)
                }
              >
                {dimensionKeys.map((key) => (
                  <option key={key} value={key}>
                    {dimensionLabels[key]}
                  </option>
                ))}
              </select>
            </Label>
            <Label>
              Value
              <Input
                name="filter-value"
                required
                maxLength={dimension === "path" ? 2048 : 512}
                value={value}
                onChange={(event) => setValue(event.target.value)}
                placeholder={dimension === "path" ? "/pricing" : "Exact value"}
              />
            </Label>
            <Button type="submit" variant="primary">
              Apply filter
            </Button>
          </form>
        </DialogContent>
      </Dialog>
      <span className="graphite-timezone">{timezone}</span>
    </div>
  );
}
