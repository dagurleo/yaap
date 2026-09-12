import { formatTimestamp } from "@/lib/report-timezone";
import { useState, type FormEvent } from "react";
import { useSuspenseQuery } from "@tanstack/react-query";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { eventFilters, type EventFilters } from "@/lib/event-filters";
import { dimensionKeys } from "@/lib/report-filters";
import { eventExplorerQuery } from "./queries";
import { ActiveFilters, ReportDates } from "./report-controls";

const count = (value: number) => value.toLocaleString("en");
const valueLabel = (value: string | number | boolean) => JSON.stringify(value);
function fresh(filters: EventFilters): EventFilters {
  const { asOf, beforeAt, beforeId, ...rest } = filters;
  return rest;
}

export function EventExplorer({
  siteId,
  filters,
  onChange,
}: {
  siteId: string;
  filters: EventFilters;
  onChange: (filters: EventFilters) => void;
}) {
  const { data, error, isFetching, refetch } = useSuspenseQuery(
    eventExplorerQuery(siteId, filters),
  );
  const update = (change: Partial<EventFilters>) =>
    onChange(eventFilters({ ...fresh(filters), ...change }));
  const filtered =
    !!filters.eventName ||
    !!filters.propertyKey ||
    dimensionKeys.some((key) => filters[key]);
  return (
    <section
      className="min-w-0 space-y-6 text-base sm:text-sm"
      aria-label="Event explorer"
      aria-busy={isFetching}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-balance">Event explorer</h2>
          <p className="text-muted-foreground text-pretty">
            Inspect events and compare the properties you send.
          </p>
        </div>
        <ReportDates
          filters={filters}
          onChange={(next) =>
            onChange(
              eventFilters(
                fresh({ ...filters, ...next, from: next.from, to: next.to }),
              ),
            )
          }
        />
      </div>
      <ExplorerFilters
        key={JSON.stringify(fresh(filters))}
        filters={filters}
        names={data.names.map((row) => row.name)}
        onChange={onChange}
      />
      <ActiveFilters
        filters={filters}
        onChange={(next) => onChange(eventFilters(fresh(next)))}
      />
      {error && (
        <p role="alert" className="text-destructive">
          Could not refresh events. Your last results are shown. Try refreshing
          again.
        </p>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3 border-y border-border/70 py-3">
        <p className="tabular-nums" role="status">
          <strong>{count(data.total)}</strong> matching events ·{" "}
          {count(data.visitors)} identified visitors
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {filtered && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() =>
                onChange({
                  days: filters.days,
                  from: filters.from,
                  to: filters.to,
                })
              }
            >
              Clear filters
            </Button>
          )}
          <Button
            size="sm"
            disabled={isFetching}
            onClick={() =>
              filters.asOf ? onChange(fresh(filters)) : void refetch()
            }
          >
            {isFetching
              ? "Refreshing…"
              : filters.asOf
                ? "Back to latest"
                : "Refresh"}
          </Button>
        </div>
      </div>
      <div className="@container">
        <div className="grid gap-6 @2xl:grid-cols-2">
          <div className="min-w-0 space-y-2">
            <h3 className="font-medium">Event names</h3>
            <p className="text-muted-foreground">
              Top 30 by matching event count.
            </p>
            <ul role="list" className="divide-y divide-border/70">
              {data.names.map((row) => (
                <li key={row.name}>
                  <button
                    type="button"
                    className="flex min-h-12 w-full cursor-pointer items-center justify-between gap-3 py-2 text-left hover:text-primary focus-visible:outline-2 focus-visible:outline-ring"
                    onClick={() =>
                      update({
                        eventName:
                          filters.eventName === row.name ? undefined : row.name,
                      })
                    }
                    aria-pressed={filters.eventName === row.name}
                  >
                    <span className="min-w-0 wrap-anywhere">{row.name}</span>
                    <span className="shrink-0 tabular-nums">
                      {count(row.total)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            {!data.names.length && (
              <p className="text-muted-foreground">No matching event names.</p>
            )}
          </div>
          <div className="min-w-0 space-y-2">
            <h3 className="font-medium wrap-anywhere">
              {filters.propertyKey
                ? `Values for ${filters.propertyKey}`
                : "Property values"}
            </h3>
            <p className="text-muted-foreground">
              {filters.propertyKey
                ? "Top 20 recorded values, before the exact value filter. Quotes indicate text."
                : "Enter a property key above to compare its values."}
            </p>
            <ul role="list" className="divide-y divide-border/70">
              {data.properties.map((row) => (
                <li key={valueLabel(row.value)}>
                  <button
                    type="button"
                    className="flex min-h-12 w-full cursor-pointer items-center justify-between gap-3 py-2 text-left hover:text-primary focus-visible:outline-2 focus-visible:outline-ring"
                    onClick={() =>
                      update({ propertyValue: `json:${valueLabel(row.value)}` })
                    }
                    aria-pressed={
                      filters.propertyValue === `json:${valueLabel(row.value)}`
                    }
                  >
                    <span className="min-w-0 wrap-anywhere">
                      {valueLabel(row.value)}
                    </span>
                    <span className="shrink-0 tabular-nums">
                      {count(row.total)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            {filters.propertyKey && !data.properties.length && (
              <p className="text-muted-foreground">
                This property has no recorded values in the selected events.
              </p>
            )}
          </div>
        </div>
      </div>
      <div className="space-y-3">
        <h3 className="font-medium">
          {filters.asOf ? "Earlier events" : "Latest events"}
        </h3>
        {!data.events.length ? (
          <div className="space-y-2 py-8 text-center">
            <p>
              {filtered
                ? "No events match these filters."
                : "No events in this date range."}
            </p>
            <p className="text-muted-foreground">
              {filtered
                ? "Try another name, property, or date range."
                : "Install the tracking snippet below or choose another date range."}
            </p>
          </div>
        ) : (
          <ul role="list" className="divide-y divide-border/70">
            {data.events.map((event) => (
              <li key={event.id} className="py-3">
                <details>
                  <summary className="cursor-pointer rounded-sm py-1 focus-visible:outline-2 focus-visible:outline-ring">
                    <span className="font-medium">{event.name}</span>
                    {" · "}
                    <span className="wrap-anywhere">{event.path}</span>
                    <p className="pt-1 text-muted-foreground tabular-nums">
                      <time dateTime={new Date(event.receivedAt).toISOString()}>
                        {formatTimestamp(event.receivedAt, data.site.timezone)}
                      </time>{" "}
                      · {Object.keys(event.properties).length} properties
                    </p>
                  </summary>
                  <div className="space-y-2 py-3">
                    <p className="text-muted-foreground wrap-anywhere">
                      Event ID: {event.id}
                    </p>
                    <p className="text-muted-foreground wrap-anywhere">
                      {event.visitorId
                        ? `Visitor: ${event.visitorId}`
                        : "Anonymous event"}
                    </p>
                    {Object.entries(event.properties).map(([key, value]) => (
                      <div key={key}>
                        <button
                          type="button"
                          className="min-h-12 max-w-full cursor-pointer rounded-sm py-2 text-left wrap-anywhere hover:underline focus-visible:outline-2 focus-visible:outline-ring"
                          onClick={() =>
                            update({
                              propertyKey: key,
                              propertyValue: `json:${valueLabel(value)}`,
                            })
                          }
                          aria-label={`Filter ${key} by ${valueLabel(value)}`}
                        >
                          {key}: {valueLabel(value)}
                        </button>
                      </div>
                    ))}
                    {!Object.keys(event.properties).length && (
                      <p className="text-muted-foreground">
                        No custom properties were sent with this event.
                      </p>
                    )}
                  </div>
                </details>
              </li>
            ))}
          </ul>
        )}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-muted-foreground tabular-nums">
            {data.events.length} events shown · Newest first
          </p>
          {data.nextCursor && (
            <Button
              size="sm"
              disabled={isFetching}
              onClick={() => onChange({ ...filters, ...data.nextCursor! })}
            >
              Older events
            </Button>
          )}
        </div>
      </div>
    </section>
  );
}

function ExplorerFilters({
  filters,
  names,
  onChange,
}: {
  filters: EventFilters;
  names: string[];
  onChange: (filters: EventFilters) => void;
}) {
  const selected =
    filters.propertyValue === undefined
      ? undefined
      : JSON.parse(filters.propertyValue.slice(5));
  const [name, setName] = useState(filters.eventName ?? "");
  const [key, setKey] = useState(filters.propertyKey ?? "");
  const [type, setType] = useState(
    selected === undefined ? "any" : typeof selected,
  );
  const [value, setValue] = useState(
    selected === undefined ? "" : String(selected),
  );
  const [error, setError] = useState("");
  function submit(event: FormEvent) {
    event.preventDefault();
    try {
      let encoded: string | undefined;
      if (type === "string") encoded = JSON.stringify(value);
      if (type === "number") {
        if (!value.trim() || !Number.isFinite(Number(value)))
          throw new Error("Enter a finite number.");
        encoded = JSON.stringify(Number(value));
      }
      if (type === "boolean") {
        if (!["true", "false"].includes(value))
          throw new Error("Enter true or false.");
        encoded = value;
      }
      onChange(
        eventFilters({
          ...fresh(filters),
          eventName: name,
          propertyKey: key,
          propertyValue: encoded === undefined ? undefined : `json:${encoded}`,
        }),
      );
      setError("");
    } catch (error) {
      setError(error instanceof Error ? error.message : "Check your filters.");
    }
  }
  return (
    <form onSubmit={submit} className="@container space-y-3">
      <div className="grid items-end gap-3 @lg:grid-cols-2 @4xl:grid-cols-[1fr_1fr_8rem_1fr_auto]">
        <Label>
          Event name
          <Input
            name="event-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={64}
            placeholder="All events"
            list="explorer-event-names"
          />
        </Label>
        <datalist id="explorer-event-names">
          {names.map((name) => (
            <option key={name} value={name} />
          ))}
        </datalist>
        <Label>
          Property key
          <Input
            name="property-key"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            maxLength={64}
            placeholder="e.g. plan"
          />
        </Label>
        <Label>
          Match type
          <div className="inline-grid grid-cols-[1fr_--spacing(8)]">
            <select
              name="property-type"
              className="col-span-full row-start-1 h-9 min-w-0 appearance-none rounded-lg bg-control pl-3 pr-8 text-base ring-1 ring-input sm:text-sm focus-visible:outline-2 focus-visible:outline-ring"
              value={type}
              onChange={(e) => setType(e.target.value)}
            >
              <option value="any">Any value</option>
              <option value="string">Text</option>
              <option value="number">Number</option>
              <option value="boolean">Boolean</option>
            </select>
            <ChevronDown
              size={14}
              aria-hidden="true"
              className="pointer-events-none col-start-2 row-start-1 shrink-0 place-self-center"
            />
          </div>
        </Label>
        <Label>
          Exact value
          <Input
            name="property-value"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            disabled={type === "any"}
            maxLength={256}
            placeholder={
              type === "boolean"
                ? "true or false"
                : type === "number"
                  ? "e.g. 10"
                  : "e.g. pro"
            }
          />
        </Label>
        <Button type="submit" variant="primary">
          Apply filters
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-destructive">
          {error}
        </p>
      )}
    </form>
  );
}
