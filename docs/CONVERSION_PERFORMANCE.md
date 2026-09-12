# Conversion performance

Open **Overview → Conversions** and choose a goal. Compare acquisition sources or landing pages by sessions, converted sessions and conversion rate. Sort any metric and browse groups in pages of 50. The selected goal, report dates, filters and Conversions view persist in the URL; table dimension, sort and page reset when the report selection changes.

## Attribution and denominators

A session is a distinct visitor/session pair with at least one retained event in the selected period. Sessions that began earlier still qualify. Anonymous events contribute neither sessions nor conversions to this report.

- **Source** uses the source context of the session's earliest retained event, ordered by timestamp then event ID. It follows the traffic source precedence described in [Reporting](REPORTING.md), including Direct / unknown and Not recorded.
- **Landing page** is the first retained pageview path before the period ends. Custom-only sessions appear under **No pageview recorded**. A custom event's path is not a landing page.
- **Filters** qualify the first event's acquisition context. The page/path filter instead qualifies the landing page. They do not restrict the later goal event.
- **Converted sessions** contain at least one event matching the selected goal within the report period. Repeated completions count once. Exact page paths and typed property conditions use the [goal matching rules](CONVERSIONS.md).
- **Conversion rate** is converted sessions divided by qualifying sessions. Zero sessions produces an unavailable rate, not zero percent.

Comparison periods use the same goal definition and filters. A session active in both periods is counted independently in each; a later pageview cannot supply the earlier period's landing page. Groups found only in the previous period remain visible. Rate changes are percentage points; changes are unavailable if either rate has no denominator. Totals include every group, regardless of pagination.

The goal cards below this table filter individual events. Their totals can differ from acquisition-filtered conversion performance. Goal edits recalculate history; archived goals can still be selected explicitly. The default is the first active goal.

## Retention and query behavior

This report reads retained raw events, including acquisition history before the selected dates. Raw-event expiry can change attribution and denominators; rollups cannot reconstruct deleted acquisition paths or typed properties. Revenue is reported separately through [durable payment attribution](PAYMENTS.md#reports), whose touch models and lookback differ from this session acquisition report.

Indexed session lookups find acquisition events and landing pages. Reports do not poll, retry automatically or refetch on window focus; use **Refresh conversions**. An isolated PostgreSQL fixture with 100,000 events and 10,000 sessions completed in 433 ms on the development machine. This is a reproducible fixture measurement, not a production capacity guarantee. PostgreSQL statement and transaction bounds are described in [Conversions](CONVERSIONS.md#query-runtime).

## Owner-session API

`GET /api/sites/:siteId/conversions` requires an authenticated owner session and site ownership. It accepts the standard [report dates and filters](REPORTING.md), plus:

| Parameter | Values | Default |
| --- | --- | --- |
| `goalId` | Goal belonging to this website, including archived goals | First active goal |
| `dimension` | `source`, `landing` | `source` |
| `sort` | `sessions`, `convertedSessions`, `conversionRate` | `sessions` |
| `direction` | `asc`, `desc` | `desc` |
| `page` | Integer from 0 through 100000 | `0` |

The response includes `selected`, `goals`, `totals`, `rows`, `groups` and `hasMore`, along with filters and period boundaries. Rates are fractions or `null`. Rows include current and previous session counts and rates; a missing landing page has `key: null`. Undefined rates sort last in either direction; metric ties use the group key, with null keys first, consistently on D1 and PostgreSQL. An unknown goal returns 404 and malformed filters return 400. Without an active or explicitly selected goal, totals are null and rows are empty.
