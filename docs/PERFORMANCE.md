# Report performance

## Initial query optimization

Local profiling on the 180-day seeded site (374,659 events, 47,375 identified visitors) found two avoidable costs:

- Visitor metadata was joined before pagination. Materializing the 50-row page first and looking up metadata afterward avoids repeated joins across the complete result set.
- Cohorts grouped all retained history on every request. Reports now group matching activity and use the existing visitor/time index for first-seen lookups.

Session reporting now materializes the relevant session events once and shares page ordering across entry/exit results. Migration 0007 adds `(site_id, visitor_id, session_id, received_at)` for complete-session lookups. It adds index storage and ingestion write overhead; it does not remove data or change report definitions.

Indicative SQL-only timings using the actual report functions through a Node SQLite adapter against the local database in read-only mode:

| Report | Before | After |
| --- | ---: | ---: |
| 7-day Visitors | 16.9 s | 0.12 s |
| 7-day Overview | 0.84 s | 0.30 s |
| 90-day Overview | 5.13 s | 3.69 s |
| 90-day Visitors | Baseline stopped during long query | 1.08 s |

These are individual local observations, not production benchmarks or browser page-load guarantees. Worker RPC, SSR, development compilation, concurrency and cache state affect elapsed load time. The profiler and query plans are in ignored `apps/web/.wrangler/profile-reports.mjs` and `apps/web/.wrangler/profile-{7,90}.json` for this local investigation.

The seeded overview and 90-day visitor list also render in the browser. An SVG title containing multiple text children caused a React hydration mismatch; rendering it as one string fixes the client rebuild.

Broad reports still aggregate raw events repeatedly. The following sections describe subsequent rollup and session-summary work. This initial query fix introduced no approximation or retention changes. Arbitrary filters, new/returning classification, session boundaries, comparisons, ordering and pagination retain their existing semantics.

## Daily traffic rollups

Unfiltered Overview totals, daily charts and page/source/referrer/campaign/location/technology breakdowns now read daily summaries. Comparisons use the same path. Unique visitors, sessions, cohorts, custom events and unconstrained event goals use the exact activity summaries described below. Page/property goals read retained raw events. Reports with dimension filters use the raw traffic path because independent dimension summaries cannot answer intersections correctly.

`daily_traffic` holds every grouped key, not just the daily top ten. Rankings and distinct page counts are computed over the complete selected range. JSON tuple keys distinguish nulls and compound values. `rollup_days` marks completed UTC days; today, incomplete days and invalidated days use indexed raw-event queries. Reads combine disjoint rolled and raw days through the shared database layer.

Event insert/update/delete triggers invalidate affected days and add them to `rollup_pending` in the same transaction. Duplicate inserts do neither. Rebuilding replaces a day's rows and completion marker and removes its pending marker atomically in the selected backend. Failed jobs leave the day pending and readers on raw data. The pending-day index lets hourly maintenance find work without scanning event history. The migration queues existing history once.

The hourly Worker cron processes up to 14 pending complete days after retention cleanup. For an initial local import:

```sh
npm run db:migrate:local
npm run db:rollup:local
```

The second command uses the shared rollup builder against local SQLite, one transaction per day, and never connects to Cloudflare. It can be interrupted and rerun. No raw events, credentials or retention settings are changed. With multiple local analytics databases, pass `-- --database /path/to/local.sqlite`.

On the seeded site, backfilling 179 complete days took 4.8 seconds and produced 15,215 summary rows. Seven- and 90-day report objects matched before/after, excluding moving timestamps/live data. The 90-day SQL-only overview dropped from 4.65 seconds with empty summaries to 2.23 seconds with coverage. Session and identity calculations now dominate. These timings are local observations, not page-load guarantees.

These summaries currently accelerate retained history; **they are not a permanent archive**. Retention deletions invalidate affected days so summaries cannot silently retain counts that raw/filtered reports have removed. Invalidated payload rows are discarded during maintenance. A separate long-term history policy requires durable identity/session/attribution records and explicit behavior for filters and journeys beyond raw retention; that is not part of this migration.

## Exact activity and session summaries

Migrations 0010–0011 add daily visitor/session/event membership, indexed visitor first-seen records, and complete-session summaries. Range uniques are deduplicated across memberships; daily unique counts are never added together. Unconstrained event goals join current definitions to summarized event names, so newly created goals include historical activity. Page/property goals read raw events because these summaries do not contain paths or properties.

Session summaries store duration endpoints, pageview/custom-event counts and entry/exit paths. Event mutations remove the affected cached sessions transactionally. Missing caches and sessions crossing a historical report cutoff use indexed raw session queries. Complete-day rebuilding refreshes the caches in the same transaction as daily summaries. First-seen records follow inserts, edits and deletions, including retention. Dimension filters continue to use the raw path to preserve intersections.

The dashboard requests live activity separately, so its refresh/error state does not block the historical overview. The HTTP overview API retains its existing live payload by default.

After the local migrations, backfilling 181 site-days took 14.5 seconds without changing raw events. With 374,659 seeded events, local SQL-only overview measurements were about **70 ms for 7 days** and **718 ms for 90 days**, versus roughly 2.23 seconds for the earlier 90-day traffic-only rollups. Exact membership deduplication still scales with visitors/sessions in the range; this is not a constant-time 90-row query. These timings exclude browser/network/dev compilation overhead and are not production guarantees.

Regression coverage compares summarized reports against raw filtered equivalents, including cross-day sessions, timestamp ties, anonymous/custom-only activity, goals, cohorts, comparisons, historical cutoffs and late inserts/edits/deletions. At that checkpoint, all 30 tests, typechecking, production build and local deployment configuration checks passed. Current verification is recorded in the [implementation plan](IMPLEMENTATION_PLAN.md#progress-log). The seeded 90-day dashboard was also checked in the browser.

## Funnel runtime and PostgreSQL bounds

The funnel calculation seeks the next matching event through site/visitor/time indexes. It no longer rescans a materialized copy of all visitors' events for each attempt. The isolated PostgreSQL fixture processes 100,000 events across 10,000 visitors and three steps in roughly 190–201 ms on the development machine. This is a local fixture measurement, not a production capacity guarantee.

PostgreSQL analytics transactions set statement, lock and idle-transaction timeouts; tests verify actual server cancellation, rollback and released locks. Funnels no longer poll every 15 seconds or retry failed reports automatically. See [query runtime](CONVERSIONS.md#query-runtime) for exact bounds and test commands.

Property matching reads event JSON and has no dedicated property index. Broader filtered-query, concurrency, ingestion and retention-backlog benchmarks remain part of the [capacity stage](IMPLEMENTATION_PLAN.md).

## Dashboard loading pass (September 2026)

The active local PostgreSQL database had 374,659 events, 180 pending days and **no completed rollups**. Development does not automatically run the production hourly cron. Backfilling its 179 complete UTC days took 12.2 seconds, left raw events unchanged and cleared the completed-day backlog. Today's partial day stays raw.

Migration `0017_visitor_dimensions.sql` (PostgreSQL: `0005_visitor_dimensions.sql`) adds exact daily visitor membership across country, region, city, browser, OS and device. Previously, these six overview panels scanned the entire raw date range even with traffic/activity rollups available. The new report deduplicates visitor/dimension tuples across covered days, merges uncovered raw days, and shares one materialized result among all six panels. Multiple locations or technologies for the same visitor remain represented. Dimension-filtered reports materialize their matching raw membership once; arbitrary intersections and path/property goals still require raw events. This is not a claim that funnels, event exploration or every possible filtered query can use daily totals.

Other loading changes:

- PostgreSQL traffic panels share one SQL statement and snapshot instead of twelve query round trips. D1 retains its single batch RPC because it limits bound parameters per statement.
- Comparisons request only traffic totals and the chart, skipping ten unused breakdowns.
- Independent overview reads start together. Activity reporting avoids copying its materialized facts and resolves uncached sessions before looking up raw session events.
- Overview queries stay fresh for 60 seconds and current ranges refresh once a minute. Completed historical ranges do not poll. Live activity retains its separate five-second refresh.

On the active local PostgreSQL seed after rebuilding, three direct report calls measured 860/413/413 ms for 30 days and 996/726/711 ms for 90 days. These include database connection startup on the first call, exclude browser/network rendering, and are local observations rather than production guarantees. A separate SQLite copy preserved the full 30/90-day report objects before and after the changes (excluding moving timestamps/live state).

Apply the selected backend's migrations, then backfill local data explicitly after seeding or upgrading:

```sh
# Local PostgreSQL (reads DATABASE_URL from the environment or .dev.vars)
npm run db:migrate:postgres
npm run db:rollup:postgres

# Local D1
npm run db:migrate:local
npm run db:rollup:local
```

The new migration invalidates and queues existing completed days so old coverage cannot hide missing visitor membership. Both backfill commands are restartable, use the shared transactional builder and leave raw events intact. Production maintenance continues to process 14 pending days per hourly run; migration rollout should allow for that backlog. Production deployment/backfill was not performed in this pass.

## Local reporting days

UTC reports continue using UTC daily rollups. Non-UTC reports use indexed raw-event queries with exact calendar boundaries, including daylight-saving transitions. The daily series joins a bounded set of local-day intervals. Existing UTC rollups are never treated as local-day totals. This preserves accuracy when changing timezone but can make large non-UTC reports slower; timezone-aware summary acceleration remains future work.
