import { calendarDate } from "@/lib/report-timezone";
import { useReportingTimezone } from "./report-timezone";
import { useState } from "react";
import {
  addDays,
  differenceInCalendarDays,
  format,
  startOfMonth,
  startOfWeek,
  startOfYear,
  subDays,
  subYears,
} from "date-fns";
import type { DateRange } from "react-day-picker";
import {
  ArrowLeftRight,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  dimensionKeys,
  dimensionLabels,
  reportFilters,
  unknownValue,
  type ReportFilters,
  type Dimension,
} from "@/lib/report-filters";

export type ApplyFilter = (values: Partial<Record<Dimension, string>>) => void;

function parseCalendarDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function calendarValue(date: Date) {
  return format(date, "yyyy-MM-dd");
}

function initialRange(filters: ReportFilters, today: Date): DateRange {
  return filters.from && filters.to
    ? {
        from: parseCalendarDate(filters.from),
        to: parseCalendarDate(filters.to),
      }
    : { from: subDays(today, filters.days - 1), to: today };
}

function periodLabel(from: Date, to: Date) {
  if (calendarValue(from) === calendarValue(to)) return format(from, "MMM d");
  if (
    from.getFullYear() === to.getFullYear() &&
    from.getMonth() === to.getMonth()
  ) {
    return `${format(from, "MMM d")} → ${format(to, "d")}`;
  }
  return `${format(from, "MMM d")} → ${format(to, "MMM d")}`;
}

export function FilterValue({
  children,
  onClick,
  label,
}: {
  children: React.ReactNode;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Filter by ${label}`}
      className="min-w-0 cursor-pointer rounded-sm text-left hover:underline focus-visible:outline-2 focus-visible:outline-ring"
    >
      {children}
    </button>
  );
}
export function ActiveFilters({
  filters,
  onChange,
}: {
  filters: ReportFilters;
  onChange: (filters: ReportFilters) => void;
}) {
  const active = dimensionKeys.filter((key) => filters[key] !== undefined);
  if (!active.length) return null;
  return (
    <div className="flex flex-wrap gap-2" aria-label="Active filters">
      {active.map((key) => (
        <Button
          key={key}
          size="sm"
          className="max-w-full"
          aria-label={`Remove ${dimensionLabels[key].toLowerCase()} filter`}
          onClick={() => {
            const next = { ...filters };
            delete next[key];
            onChange(next);
          }}
        >
          <span className="truncate">
            {dimensionLabels[key]}:{" "}
            {filters[key] === unknownValue ? "Unknown" : filters[key]}
          </span>
          <X aria-hidden="true" />
        </Button>
      ))}
      <Button
        size="sm"
        variant="ghost"
        onClick={() => {
          const next = { ...filters };
          for (const key of dimensionKeys) delete next[key];
          onChange(next);
        }}
      >
        Clear filters
      </Button>
    </div>
  );
}
export function ReportDates({
  filters,
  onChange,
  comparison = false,
}: {
  filters: ReportFilters;
  onChange: (filters: ReportFilters) => void;
  comparison?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<"presets" | "calendar">("presets");
  const [error, setError] = useState("");
  const timezone = useReportingTimezone();
  const today = parseCalendarDate(calendarDate(Date.now(), timezone));
  const [range, setRange] = useState<DateRange>(() =>
    initialRange(filters, today),
  );
  const current = initialRange(filters, today);
  const currentFrom = current.from ?? today;
  const currentTo = current.to ?? currentFrom;

  function setCalendarRange(from: Date, to: Date) {
    onChange(
      reportFilters({
        ...filters,
        from: calendarValue(from),
        to: calendarValue(to),
      }),
    );
    setOpen(false);
    setView("presets");
    setError("");
  }

  function apply() {
    if (!range.from || !range.to) {
      setError("Choose a start and end date");
      return;
    }
    try {
      onChange(
        reportFilters({
          ...filters,
          from: calendarValue(range.from),
          to: calendarValue(range.to),
        }),
      );
      setOpen(false);
      setError("");
    } catch (error) {
      setError(error instanceof Error ? error.message : "Invalid dates");
    }
  }

  function setPreset(days: number) {
    const { from, to, ...rest } = filters;
    onChange({ ...rest, days });
    setOpen(false);
    setView("presets");
    setError("");
  }

  function movePeriod(direction: -1 | 1) {
    const length = differenceInCalendarDays(currentTo, currentFrom) + 1;
    let nextFrom = addDays(currentFrom, direction * length);
    let nextTo = addDays(currentTo, direction * length);
    if (nextTo > today) {
      nextTo = today;
      nextFrom = addDays(today, 1 - length);
    }
    setCalendarRange(nextFrom, nextTo);
  }

  const todayValue = calendarValue(today);
  const yesterday = subDays(today, 1);
  const selectedRange = filters.from
    ? `${filters.from}:${filters.to}`
    : `days:${filters.days}`;
  const presets = [
    {
      label: "Today",
      value: `${todayValue}:${todayValue}`,
      select: () => setCalendarRange(today, today),
    },
    {
      label: "Yesterday",
      value: `${calendarValue(yesterday)}:${calendarValue(yesterday)}`,
      select: () => setCalendarRange(yesterday, yesterday),
    },
    { label: "Last 7 days", value: "days:7", select: () => setPreset(7) },
    {
      label: "Last 30 days",
      value: "days:30",
      select: () => setPreset(30),
    },
    {
      label: "Last 90 days",
      value: "days:90",
      select: () => setPreset(90),
    },
    {
      label: "Last 12 months",
      value: `${calendarValue(addDays(subYears(today, 1), 1))}:${todayValue}`,
      select: () => setCalendarRange(addDays(subYears(today, 1), 1), today),
    },
    {
      label: "Week to date",
      value: `${calendarValue(startOfWeek(today, { weekStartsOn: 1 }))}:${todayValue}`,
      select: () =>
        setCalendarRange(startOfWeek(today, { weekStartsOn: 1 }), today),
    },
    {
      label: "Month to date",
      value: `${calendarValue(startOfMonth(today))}:${todayValue}`,
      select: () => setCalendarRange(startOfMonth(today), today),
    },
    {
      label: "Year to date",
      value: `${calendarValue(startOfYear(today))}:${todayValue}`,
      select: () => setCalendarRange(startOfYear(today), today),
    },
  ];
  const buttonLabel =
    presets.find((preset) => preset.value === selectedRange)?.label ??
    periodLabel(currentFrom, currentTo);
  const rangeLabel =
    range.from && range.to
      ? `${format(range.from, "MMM d, yyyy")} – ${format(range.to, "MMM d, yyyy")}`
      : range.from
        ? `${format(range.from, "MMM d, yyyy")} – choose end date`
        : "Choose a date range";
  return (
    <div className="flex max-w-full flex-wrap items-center gap-2">
      <div
        className="inline-flex max-w-full items-center rounded-lg bg-control ring-1 ring-input shadow-xs dark:shadow-none"
        role="group"
        aria-label="Date range navigation"
      >
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          className="rounded-r-none text-foreground focus-visible:z-10"
          aria-label="Previous date range"
          onClick={() => movePeriod(-1)}
        >
          <ChevronLeft aria-hidden="true" />
        </Button>
        <Popover
          open={open}
          onOpenChange={(next) => {
            setOpen(next);
            if (next) {
              setRange(initialRange(filters, today));
              setView("presets");
              setError("");
            }
          }}
        >
          <PopoverTrigger asChild>
            <Button
              size="sm"
              type="button"
              variant="ghost"
              className="min-w-32 max-w-[calc(100vw-7rem)] rounded-none border-x border-border/70 px-3 text-foreground focus-visible:z-10"
              aria-label="Choose date range"
            >
              <span className="truncate">{buttonLabel}</span>
            </Button>
          </PopoverTrigger>
          <PopoverContent
            align="start"
            className={
              view === "calendar"
                ? "w-auto max-w-[calc(100vw-2rem)] p-0"
                : "w-60 p-1"
            }
          >
            {view === "presets" ? (
              <div className="space-y-1">
                <p className="px-2 py-1.5 text-sm text-muted-foreground">
                  Reports use {timezone}.
                </p>
                {presets.map((preset) => (
                  <Button
                    key={preset.label}
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="w-full justify-start font-normal"
                    onClick={preset.select}
                  >
                    {preset.label}
                    {selectedRange === preset.value && (
                      <Check className="ml-auto" aria-hidden="true" />
                    )}
                  </Button>
                ))}
                <div className="-mx-1 border-t border-border/70 pt-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="w-full justify-start font-normal"
                    onClick={() => setView("calendar")}
                  >
                    Custom
                    <CalendarDays className="ml-auto" aria-hidden="true" />
                  </Button>
                </div>
              </div>
            ) : (
              <>
                <div className="space-y-1 px-4 pt-4">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="-ml-2"
                    onClick={() => setView("presets")}
                  >
                    <ChevronLeft aria-hidden="true" />
                    Date ranges
                  </Button>
                  <h2 className="text-sm font-semibold">Custom date range</h2>
                  <p className="text-sm text-muted-foreground">
                    Choose up to 366 days. Reports use {timezone}.
                  </p>
                </div>
                <Calendar
                  mode="range"
                  selected={range}
                  onSelect={(next) => {
                    setRange(next ?? { from: undefined });
                    setError("");
                  }}
                  defaultMonth={range.from}
                  disabled={{ after: today }}
                  max={365}
                  autoFocus
                />
                <div className="flex flex-col gap-3 border-t border-border/70 p-3 sm:flex-row sm:items-center sm:justify-between">
                  <p className="min-w-0 text-sm text-muted-foreground">
                    {rangeLabel}
                  </p>
                  <Button
                    type="button"
                    variant="primary"
                    size="sm"
                    className="self-end"
                    disabled={!range.from || !range.to}
                    onClick={apply}
                  >
                    Apply
                  </Button>
                </div>
                {error && (
                  <p
                    role="alert"
                    className="px-3 pb-3 text-sm text-destructive"
                  >
                    {error}
                  </p>
                )}
              </>
            )}
          </PopoverContent>
        </Popover>
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          className="rounded-l-none text-foreground focus-visible:z-10"
          aria-label="Next date range"
          disabled={calendarValue(currentTo) >= todayValue}
          onClick={() => movePeriod(1)}
        >
          <ChevronRight aria-hidden="true" />
        </Button>
      </div>
      {comparison && (
        <Button
          size="sm"
          aria-pressed={!!filters.compare}
          onClick={() => onChange({ ...filters, compare: !filters.compare })}
        >
          <ArrowLeftRight aria-hidden="true" />
          Compare
        </Button>
      )}
    </div>
  );
}
