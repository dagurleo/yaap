# Goals and funnels

Goals match a custom event name or an exact page path. Each goal and each funnel step can require up to three property conditions. All conditions must match the **same event**. Values use the event-property limits in [EVENTS.md](EVENTS.md): strings, finite numbers and booleans, with a combined 2,048-byte JSON limit. Matching is exact and case-sensitive; missing keys never match, including when the expected value is `false`, `0`, or an empty string. The number `1`, text `"1"`, and boolean `true` are distinct.

## Definitions and editing

The owner can create and edit goals through Overview → Manage goals, and edit funnel conditions through Funnels. Page paths start with `/`, contain no query or fragment, and match only `pageview` events. `/thanks` does not match `/thanks/` or a custom event recorded on `/thanks`.

Existing event-only goals and funnel definitions remain valid. Multiple goals can share an event name when their conditions differ. The same definition cannot be duplicated, even under a different display name or with conditions in a different order. Archived definitions retain their uniqueness; restore or edit the existing goal.

Edits immediately recalculate retained history and comparison periods against the current definition. Archiving preserves a definition and its counts. An event can complete several goals; visitor journeys show it once with all matching goal labels.

## Counts and denominators

These are the goal-card and funnel rules. The [conversion performance table](CONVERSION_PERFORMANCE.md) uses session acquisition filters and its own documented denominator.

- **Goal completions** count every matching event, including repeats and anonymous events.
- **Converted sessions** count distinct identified sessions containing a matching event in the selected date range and report dimensions.
- **Session conversion** divides converted sessions by all identified sessions with any activity matching the report range and dimensions. Goal properties do not narrow this denominator. Anonymous completions add no identified sessions. With no identified sessions the rate is unavailable.
- **Funnels** count identified visitors or visitor/session pairs. Every ordered step requires a later event, ordered by timestamp then event ID; one event cannot satisfy repeated steps. Any first-step attempt may complete the funnel within the chosen window and report end. Report dimensions qualify the first step; later steps must meet their own definitions, identity scope and time bounds. Funnel conversion divides completions by entrants.

Daily activity summaries do not retain paths or properties. Unconstrained event goals can use those summaries; page and property goals read raw events. They cannot recover matches from deleted raw history. Funnel reports also depend on retained raw events. Raw and summary-backed reports are verified against the same fixtures before and after rollup.

## API examples

Create with `POST /api/sites/:siteId/goals`:

```json
{"name":"Pro signup","eventName":"signup","conditions":{"plan":"pro","seats":1,"trial":false}}
```

```json
{"name":"Thank-you page","path":"/thanks"}
```

Update the full definition with `PATCH /api/sites/:siteId/goals/:goalId` using the same body. Omitted conditions reset to no conditions; omitted path selects a custom event definition. Archive/restore remains `{"archived":true}` / `{"archived":false}`. Existing callers using only `name` and `eventName` keep working. All mutations require an owner session and same-origin requests.

Funnel step example:

```json
{"kind":"event","value":"signup","conditions":{"plan":"pro"}}
```

## Query runtime

Funnel reports use indexed next-event seeks rather than correlated rescans of a materialized copy of all events. A reproducible PostgreSQL test covers 100,000 events and 10,000 visitors with three steps (190–201 ms on the local development machine; this is a fixture measurement, not a capacity guarantee).

PostgreSQL analytics transactions set a 15-second statement timeout, 3-second lock timeout, and 10-second idle transaction timeout. Settings are local to each transaction for [Hyperdrive transaction pooling](https://developers.cloudflare.com/hyperdrive/concepts/connection-pooling/). These are per-statement bounds, not a total request deadline. Integration tests verify server cancellation, rollback, lock release and successful subsequent queries. Funnel reports no longer poll every 15 seconds or automatically retry failed queries; use Refresh to request a new calculation.

Run `npm run test:postgres` for the runtime and integration fixtures. Tests create and remove isolated databases; they do not alter an existing owner's analytics.
