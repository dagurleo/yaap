# Reports and metric definitions

[Documentation](README.md) · [Tracking and identity](TRACKING.md) · [Goals and funnels](CONVERSIONS.md)

## Dates and filters

Reports use the website’s saved reporting timezone and server receipt timestamps. Choose an IANA timezone such as `Asia/Tokyo` in Settings → General. Existing websites default to UTC; new websites suggest the browser timezone. The date picker includes Today, Yesterday, 7/30/90-day ranges, Last 12 months, week/month/year to date, and custom inclusive ranges of up to 366 days ending today or earlier. The current day is partial, ending at query time. Daily charts include zero-filled days. Hourly series are planned. Date presets, custom ranges, comparisons, daily charts, timestamps and CSV exports use the saved timezone. Previous-period comparisons cover the preceding equal number of calendar days, including 23/25-hour daylight-saving days; a partial current day still compares with a full previous period. Event timestamps stay in UTC. Changing the setting immediately reinterprets retained history using the new boundaries.

Comparison uses the immediately preceding equal number of calendar days. A partial current period is compared with the full previous period. Report filters persist in the URL; country, region, city, path, browser, OS, device, source, referrer and campaign conditions combine with AND. Unknown dimension values use `__unknown__` in API parameters.

Overview filters select events. Distinct visitor/session counts come from those matching events, while session details and first-seen history use the broader retained context described below. Traffic source breakdowns are event-context reports. The [conversion performance table](CONVERSION_PERFORMANCE.md) instead filters and groups sessions by acquisition context. Revenue has its own [attribution/filter rules](PAYMENTS.md#reports), and funnel dimensions qualify the [first step](CONVERSIONS.md#counts-and-denominators).

## Traffic and audiences

| Metric | Definition |
| --- | --- |
| Pageviews | Stored events named exactly `pageview`, including anonymous views |
| Pages | Distinct recorded page paths on matching pageviews |
| Identified visitors | Distinct browser IDs on matching events |
| Sessions | Distinct session IDs on matching events |
| Custom events | Events whose name is not `pageview`; tracked separately from pageviews |
| New visitors | Active browser IDs whose earliest retained event falls within the report range |
| Returning visitors | Active browser IDs with an earlier retained event before the report range |
| Visit frequency | Browsers with 1, 2–3, or 4+ distinct sessions in the range |

New and returning are mutually exclusive. A browser first seen and then returning within one selected range remains new for that range. Anonymous events do not enter identity metrics. Cleared storage, expiration, multiple browsers and disabled identifiers limit recognition; these are browser counts, not verified people.

Page/source/campaign/location/technology traffic breakdowns count pageviews. The Overview also offers identified-visitor location and technology breakdowns; follow the displayed metric label. Top-group limits do not truncate overall report totals. Cities retain region and country to distinguish namesakes. Source precedence and campaign persistence are defined in [tracking](TRACKING.md#source-and-campaign-definitions).

Location and technology are derived server-side from request metadata and broad user-agent categories. They can be unknown or affected by proxies and masked agents. Analytics events do not store raw IP addresses, user-agent strings, coordinates or referrer paths. Better Auth operational records are separate and may retain owner IP/user-agent information.

## Sessions

Session metrics select identified visitor/session pairs with at least one event matching the dates and filters. They inspect that session's retained events before the report end. Filtering to one page therefore does not turn a multi-page session into a bounce.

- **Bounce rate:** sessions with exactly one pageview and no custom events, divided by sessions containing a pageview. Custom-only sessions are excluded from the denominator.
- **Average duration:** elapsed time from first to last recorded event per matched session, including custom-only sessions. Single-event sessions measure zero; no sessions returns an unavailable value.
- **Entry/exit pages:** first and last recorded pageviews in the session. A later custom event does not change the exit page.

Duration measures observed event span, not attention or time spent after the final event. Presence heartbeats do not extend measured sessions or enter event reports.

## Visitor lists and journeys

Visitors lists identified browser IDs active in the range, with cohort and goal filters. Goal filters use the current full definition, including paths and property conditions. Counts cover the selected range; row metadata comes from the latest matching event. Lists return 50 visitors per page.

A journey shows all retained events for that browser on that site, grouped by session. Session entry context comes from the first recorded event. Ordering uses receipt time, with event ID breaking ties. Journeys load 100 events at a time against a timestamp cutoff and preserve entry context across pagination. Anonymous events are never linked later.

Current goal definitions apply to history, including archived goals. Events matching several goals appear once with all matching labels. Linked payments are available when retained identity history remains; see [payments](PAYMENTS.md).

## Online presence and recent activity

| | Online now | Recent activity |
| --- | --- | --- |
| Meaning | Identified browsers with presence updated in the last 60 seconds | Identified browsers with an event in the last five minutes |
| Updates | Visible pageviews and visible-page heartbeats every 20 seconds | Received events |
| Scope | Website-wide; independent of historical filters | Dimension filters apply; date range does not |
| Storage | Separate presence table | Retained event history |
| Display refresh | Every five seconds | Every five seconds |

Background/closed tabs and disabled identifiers stop heartbeats. A prior presence record expires after 60 seconds. Multiple tabs for one browser count once, showing the most recently active path. The recent activity feed shows up to 20 browsers and its total count. Neither metric counts anonymous visitors.

## Refresh and retained history

Overview polls every 15 seconds. The event explorer polls its latest page every five seconds; cursor pages do not poll. Funnels have manual refresh and no automatic interval or failed-query retries.

Daily traffic/activity/session summaries accelerate unfiltered retained history. Range-wide unique counts are deduplicated, never summed from daily uniques. Filtered reports and page/property goals read raw events where summaries lack the necessary dimensions. Late writes and retention invalidate affected summaries. See [performance](PERFORMANCE.md) for implementation and measurements.

Deleted raw history cannot be recovered from these summaries. Retention can change first-seen classification, journeys, goals and funnels. Finalized [payment attribution](PAYMENTS.md#backfill-and-retention) survives raw-event expiry; it expires with its payment. See [operations](OPERATIONS.md#retention) before enabling expiration.
