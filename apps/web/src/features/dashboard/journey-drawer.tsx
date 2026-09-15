import { paymentProviders } from "@/lib/payment-providers";
import { formatTimestamp } from "@/lib/report-timezone";
import { useReportingTimezone } from "./report-timezone";
import { ReportLink as Link } from "./public-context";
import { money } from "@/lib/money";
import { useInfiniteQuery } from "@tanstack/react-query";
import { FileText, MousePointer2, Flag } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { useReportQueries } from "./report-queries";
import type { JourneyEvent } from "../../server/visitors";

export const visitorLabel = (id: string) => {
  const seeded =
    id.match(/^[a-f0-9-]{36}-v(\d+)$/) ?? id.match(/^demo-visitor-(\d+-\d+)$/);
  return `Visitor ${seeded ? seeded[1] : id.slice(0, 8)}`;
};
export const timestamp = formatTimestamp;
export function JourneyDrawer({
  siteId,
  visitorId,
  asOf,
  onClose,
  restoreFocus,
}: {
  siteId: string;
  visitorId: string;
  asOf: number;
  onClose: () => void;
  restoreFocus: () => void;
}) {
  const { journeyQuery } = useReportQueries();
  const timezone = useReportingTimezone();
  const query = useInfiniteQuery(journeyQuery(siteId, visitorId, asOf));
  const summary = query.data?.pages[0];
  const groups = new Map<string, JourneyEvent[]>();
  for (const event of query.data?.pages.flatMap((page) => page.events) ?? []) {
    const key = event.sessionId
      ? `session:${event.sessionId}`
      : `event:${event.id}`;
    const group = groups.get(key) ?? [];
    group.push(event);
    groups.set(key, group);
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        className="top-0 right-0 left-auto flex h-dvh max-w-full translate-x-0 translate-y-0 flex-col gap-0 rounded-none p-0 sm:max-w-xl data-[state=open]:zoom-in-100 data-[state=closed]:zoom-out-100"
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          restoreFocus();
        }}
      >
        <header className="space-y-2 border-b border-border px-5 py-6 pr-12 sm:px-6">
          <DialogTitle>{visitorLabel(visitorId)}</DialogTitle>
          <DialogDescription>
            Journey · All retained history · {timezone}
          </DialogDescription>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-6 sm:px-6">
          {query.isPending && <p role="status">Loading journey…</p>}
          {!!summary?.payments.length && (
            <section
              className="mb-6 space-y-3 border-b border-border pb-5"
              aria-label="Visitor payments"
            >
              <div className="flex justify-between gap-3">
                <h3 className="text-sm">Recent payments</h3>
                <Link
                  className="text-xs underline"
                  onClick={onClose}
                  to="/app/$siteId/revenue"
                  params={{ siteId }}
                  search={{ days: 90, mode: "live", page: 0, visitorId }}
                >
                  View revenue
                </Link>
              </div>
              {summary.payments.map((p) => (
                <div
                  key={`${p.provider}:${p.mode}:${p.externalId}`}
                  className="flex items-start justify-between gap-3 text-xs"
                >
                  <div>
                    <p>
                      {timestamp(p.paidAt, timezone)} ·{" "}
                      {p.provider === "api"
                        ? "API"
                        : paymentProviders[p.provider].label}
                      {p.mode === "test" ? " · Test" : ""}
                    </p>
                    <p className="pt-1 text-muted-foreground">
                      {p.refundedAmount
                        ? `${money(p.refundedAmount, p.currency)} refunded`
                        : "Paid"}
                    </p>
                  </div>
                  <span className="shrink-0 tabular-nums">
                    {money(p.amount - p.refundedAmount, p.currency)}
                  </span>
                </div>
              ))}
            </section>
          )}
          {summary && (
            <>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-5 border-b border-border pb-6 text-sm [&_dt]:font-medium [&_dd]:pt-1 [&_dd]:text-muted-foreground [&_dd]:tabular-nums">
                <div>
                  <dt>First seen</dt>
                  <dd>{timestamp(summary.firstSeen!, timezone)}</dd>
                </div>
                <div>
                  <dt>Last seen</dt>
                  <dd>{timestamp(summary.lastSeen!, timezone)}</dd>
                </div>
                <div>
                  <dt>Sessions</dt>
                  <dd>{summary.sessions}</dd>
                </div>
                <div>
                  <dt>Events</dt>
                  <dd>{summary.eventCount}</dd>
                </div>
              </dl>
              <div className="divide-y divide-border">
                {[...groups.entries()].map(([key, descending]) => {
                  const events = [...descending].reverse();
                  const session = events[0];
                  return (
                    <section
                      key={key}
                      className="space-y-4 py-6"
                      aria-label={`Session ${timestamp(session.sessionStart, timezone)}`}
                    >
                      <div className="space-y-2">
                        <h3 className="text-sm font-semibold">
                          {timestamp(session.sessionStart, timezone)}
                          {session.sessionId ? "" : " · No session ID"}
                        </h3>
                        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-sm [&_dt]:font-medium [&_dd]:text-muted-foreground [&_dd]:wrap-anywhere">
                          <dt>Entry</dt>
                          <dd>{session.entryPath}</dd>
                          <dt>Source</dt>
                          <dd>
                            {session.utmSource ??
                              session.referrerHost ??
                              "Direct / unknown"}
                          </dd>
                          {session.referrerHost && session.utmSource && (
                            <>
                              <dt>Referrer</dt>
                              <dd>{session.referrerHost}</dd>
                            </>
                          )}
                          {session.utmCampaign && (
                            <>
                              <dt>Campaign</dt>
                              <dd>{session.utmCampaign}</dd>
                            </>
                          )}
                          {session.utmMedium && (
                            <>
                              <dt>Medium</dt>
                              <dd>{session.utmMedium}</dd>
                            </>
                          )}
                        </dl>
                      </div>
                      {events[0].receivedAt > session.sessionStart && (
                        <p className="text-sm text-muted-foreground">
                          Earlier events below
                        </p>
                      )}
                      <ol
                        role="list"
                        className="space-y-4 border-l border-border pl-4"
                      >
                        {events.map((event) => {
                          const Icon = event.goalName
                            ? Flag
                            : event.name === "pageview"
                              ? FileText
                              : MousePointer2;
                          return (
                            <li
                              key={event.id}
                              className="flex items-start gap-3 text-sm"
                            >
                              <Icon
                                aria-hidden="true"
                                className={`size-4 shrink-0 ${event.goalName ? "stroke-success" : "stroke-muted-foreground"}`}
                              />
                              <div className="min-w-0 flex-1 space-y-1">
                                <div className="font-medium wrap-anywhere">
                                  {event.name === "pageview"
                                    ? event.path
                                    : event.name}
                                </div>
                                {event.name !== "pageview" && (
                                  <div className="wrap-anywhere text-muted-foreground">
                                    {event.path}
                                  </div>
                                )}
                                {event.goalName && (
                                  <div className="wrap-anywhere text-success">
                                    Goals:{" "}
                                    {event.goals
                                      .map(
                                        (goal) =>
                                          goal.name +
                                          (goal.archived ? " (archived)" : ""),
                                      )
                                      .join(", ")}
                                  </div>
                                )}
                              </div>
                              <time
                                className="shrink-0 text-muted-foreground tabular-nums"
                                dateTime={new Date(
                                  event.receivedAt,
                                ).toISOString()}
                              >
                                {new Intl.DateTimeFormat("en-GB", {
                                  timeZone: timezone,
                                  hour: "2-digit",
                                  minute: "2-digit",
                                  second: "2-digit",
                                  hourCycle: "h23",
                                }).format(event.receivedAt)}
                              </time>
                            </li>
                          );
                        })}
                      </ol>
                    </section>
                  );
                })}
              </div>
            </>
          )}
          {query.isError && (
            <div className="space-y-3" role="alert">
              <p>Could not load journey.</p>
              <Button
                size="sm"
                onClick={() =>
                  void (query.isFetchNextPageError
                    ? query.fetchNextPage()
                    : query.refetch())
                }
              >
                Retry
              </Button>
            </div>
          )}
          {query.hasNextPage && !query.isFetchNextPageError && (
            <Button
              className="w-full"
              disabled={query.isFetchingNextPage}
              onClick={() => void query.fetchNextPage()}
            >
              {query.isFetchingNextPage ? "Loading…" : "Load earlier events"}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
