# Custom properties and event explorer

Pass explicit properties as the optional second argument:

```js
window.osAnalytics?.track("signup", {
  plan: "pro",
  seats: 3,
  trial: false,
  button_location: "pricing_table",
});
```

Existing `track("signup")` calls continue working. The promise resolves to false for invalid properties, paused collection, or unsuccessful delivery. Properties are copied before sending; retries keep the same values and event ID even if the caller changes the original object. Anonymous tracking supports properties; paused tracking sends nothing. Automatic pageviews and presence do not collect properties. No page content or form values are captured automatically.

## Limits

- Up to 20 keys. Keys begin with an ASCII letter and contain only ASCII letters, digits, or underscores, up to 64 characters. `constructor`, `prototype`, and `__proto__` are reserved.
- Values are strings, finite numbers, or booleans. Strings are at most 256 JavaScript UTF-16 code units and must be well-formed Unicode without control characters. Empty strings are valid. Arrays, objects, null, undefined, and non-finite numbers are rejected.
- Serialized properties are at most 2,048 UTF-8 bytes. The existing **4,096-byte complete ingest request limit** still applies; long paths/sources plus properties may exceed it even when individual fields are valid.
- HTTP ingestion and queue consumption both validate properties. Invalid HTTP properties return 400; oversized requests return 413. Invalid queued properties retry through the existing failure/dead-letter path.

Use properties for non-sensitive categories such as plans or content types. Values are explicitly supplied application data and stored as provided; the tracker does not redact arbitrary personal data inside them.

## Explorer

Open **Events**, choose a date range, optionally enter an exact event name, and enter a property key to compare its values. Choose Text, Number, or Boolean and an exact value to filter events. Booleans use `true` or `false`. Text with an empty value matches a recorded empty string.

Click a value in the breakdown or expanded event details to filter by it. Text displays with quotes so `"1"`, `1`, and `true` stay distinct. Click the selected event name again to clear it, or Clear filters to remove event/dimension filters while keeping dates. Existing URL dimension filters are honored and removable.

- Totals count matching retained events, including pageviews and anonymous events. Identified visitors are distinct visitor IDs on those same events.
- Event names show the top 30 within all active filters. The property panel shows the top 20 recorded values, honoring dates, name, and dimensions but ignoring the exact property value filter so another value can be selected. Missing properties are omitted; rows need not sum to the event total. A key with Any value selects a breakdown, not an existence filter.
- Events load 50 at a time, ordered by receipt timestamp descending, then event ID descending. Older events uses a cursor with a receipt-time cutoff; Back to latest resets it. The latest page polls every five seconds; cursor pages do not poll. Retention and delayed delivery can still change history within the cutoff; this is not a frozen database snapshot.
- Queries use raw retained events and the existing site/time index. Properties are grouped at read time, not from daily rollups. Large ranges require the later capacity benchmarks.
- Explorer filters apply to this report. Goals and funnel steps independently support up to three exact typed conditions; see [conversion definitions](CONVERSIONS.md).

## HTTP API

`GET /api/sites/:siteId/event-explorer` requires the owner's session, enforces ownership, and uses no-store responses. The existing `/api/sites/:siteId/events` endpoint keeps its recent-event behavior and includes stored `properties`.

Use existing `days=7|30|90`, inclusive site-local `from`/`to`, and dimension filters, plus optional `eventName` and `propertyKey`. `propertyValue` is `json:` followed by a JSON scalar, URL-encoded. The prefix prevents browser-router parsing from conflating types.

```text
?eventName=signup&propertyKey=plan&propertyValue=json%3A%22pro%22
?propertyKey=seats&propertyValue=json%3A3
?propertyKey=trial&propertyValue=json%3Afalse
```

Responses include `total`, `visitors`, `names`, `properties`, `events`, `asOf`, and `nextCursor`. Pass all `nextCursor` fields (`asOf`, `beforeAt`, `beforeId`) alongside unchanged filters for the next page. Counts and breakdowns cover the entire selected range. Comparison parameters are ignored; this explorer does not compare previous periods.

## Migrations

Apply D1 `0015_event_properties.sql` or PostgreSQL `0003_event_properties.sql` before deploying the updated application. Each adds non-null JSON-text `properties` with `{}` as the default. Historical events and queued messages without properties remain valid. Both Drizzle schemas and snapshots are updated. No historical properties are inferred and no new infrastructure is needed.

See [CONVERSIONS.md](CONVERSIONS.md) to use properties in goal and funnel definitions.
