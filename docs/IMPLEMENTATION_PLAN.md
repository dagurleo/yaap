# Next implementation stages

Started 2026-09-10. Work through stages sequentially; finish each stage's acceptance checks before starting the next. Preserve existing owner/analytics data and the in-progress PostgreSQL implementation. No deployment or publishing is part of this local implementation plan.

## Delivery rules

- Keep D1 and PostgreSQL schemas, migrations, and report behavior aligned.
- Preserve existing tracker calls and API consumers. Additive migrations default old events to empty properties.
- Use isolated fixtures for tests. Never use real visitor data to test mutations.
- Verify changed behavior with integration tests; verify new UI on desktop/mobile and in light/dark themes.
- Record actual validation and limitations below. Do not treat previous test results as current verification.

## Ordered stages

### 1. Custom properties and event explorer — implemented, verified, and active on local PostgreSQL

Implement `osAnalytics.track(name, properties?)` with explicit scalar properties: strings, finite numbers, booleans. At most 20 keys, 64 ASCII characters per key, 256 characters per string, and 2,048 UTF-8 bytes for the serialized properties. Keep the existing 4,096-byte ingest request limit. Reject nested/null/reserved/invalid data; do not automatically collect page content or form values. Validate at ingestion and queue consumption.

Store a JSON object on each event in both backends. Existing calls/events continue to work. Add an owner-protected explorer endpoint and server function; retain the existing recent-events API. Upgrade Events with date/event-name/exact typed-property filters, event-name totals, property-value counts, and paginated event details. Filters persist in the URL. Properties belong to individual events; they do not change existing traffic, goal, funnel, or revenue semantics.

Acceptance: tracker validation and retry payload stability; real queued storage and duplicate replay; old event compatibility; typed filtering (`1`, `"1"`, `true` remain distinct); injection-shaped inputs; stable ordering/pagination; site isolation and private server-function access; D1/Postgres/Hyperdrive parity; responsive empty/error/populated UI. Explain limits and query behavior in documentation.

### 2. Property-based goals and funnel steps — implemented, verified, and active on local PostgreSQL

Extend goal and funnel definitions with bounded exact property conditions; add page-path goals. Keep existing definitions valid. Make conversion denominators explicit and include historical events only when they match the current definition. Update uniqueness rules so different property variants can share an event name.

Acceptance: anonymous completion counts, identified conversion rates, repeated ordered steps, archive/edit behavior, missing properties, and both backend reports agree with fixtures.

### 3. Conversion performance by source and landing page — implemented and verified

Add sortable traffic/converted-session/conversion-rate breakdowns for a selected goal. Define session acquisition attribution and denominators before implementation; avoid treating event-level filters as session acquisition. Include comparisons. Add revenue columns only after stage 4 defines compatible attribution semantics.

Acceptance: direct/unknown sources, sessions spanning dates, anonymous traffic, multiple conversions, and combined filters produce documented totals.

### 4. Durable revenue attribution — implemented, verified, and active on local PostgreSQL

Introduce attribution records with explicit first-touch/last-non-direct models and a configurable lookback window. Define payment finalization, late-event reconciliation, and attribution retention separately from raw events. Backfill from retained history without implying deleted history can be recovered. Surface unmatched revenue and model/window definitions.

Acceptance: raw-event expiry cannot silently reassign finalized revenue; late/out-of-order delivery, refunds, missing identity, model changes, currencies, and backfills remain deterministic.

### 5. Installation verification and diagnostics — queued

Consolidate installation guidance in Settings, link from Events, and add first-event verification with freshness and identifier status. Explain origin, exclusion, paused collection, and common installation failures without claiming to detect requests that never reached the server.

Acceptance: fresh site, valid event, excluded event, anonymous/paused modes, bad origin, and stale collection have actionable states.

### 6. Saved report views — queued

Persist owner/site-scoped names and validated report filters; add save/open/rename/delete. Preserve relative dates as relative dates. Version the saved filter schema.

Acceptance: reopening restores the intended report; invalid or obsolete filters are handled; website isolation holds.

### 7. Hourly charts and reporting timezone — queued

Reporting timezone implemented: website preference, browser suggestion for new sites, shared local calendar boundaries, timestamps, comparisons, exports and API metadata. Non-UTC reports use indexed raw events; UTC rollups remain intact. Hourly series for short ranges and timezone-aware summary acceleration remain queued.

Acceptance: 23/25-hour days, UTC boundaries, partial-day comparisons, custom ranges, and raw/summary equivalence.

### 8. Chart annotations — queued

Add owner-managed timestamped notes for launches, campaigns, and incidents. Show notes on the timeline with accessible list/detail access. Support edit/delete and date filtering.

Acceptance: correct timezone placement, multiple notes, long text, keyboard/mobile access, and site isolation.

### 9. Multi-site summary — queued

Extend the directory with traffic, a chosen goal's conversion rate/change, and collection freshness for a shared period. Use bounded/batched summary reads and retain useful empty states.

Acceptance: zero-traffic sites, missing goals, many sites, currency separation where relevant, and query-cost measurements.

### 10. Owner recovery — required before public release

Add an operator recovery command for lost passwords and partially completed setup. Require infrastructure-level access, revoke sessions, and avoid turning bootstrap into a persistent authentication bypass. Keep email delivery optional.

Acceptance: recovery succeeds on both databases, failed recovery is safe, and old sessions cease working.

### 11. Export, backup, and restore — required before public release

Expand report CSV exports and add versioned portable site-data export/import. Document provider-native backups and restore drills, secret dependencies, and D1-to-Postgres migration. Separate portable analytics exports from full installation backups containing auth/integration state.

Acceptance: isolated round-trip restores preserve counts, definitions, payments, and deduplication; interrupted imports and schema mismatches have tested remedies.

### 12. Capacity and public-release verification — queued

Benchmark ingestion bursts, filtered reports, funnels, rollups, cleanup lag, and PostgreSQL per-site write contention. Publish measured capacity/cost assumptions. Reconcile stale scope/README statements, preserve the adopted [Elastic License 2.0](../LICENSE.md) and third-party notices, add contribution/upgrade guidance, and verify fresh installation and upgrades. Live Cloudflare/Stripe validation remains a separately authorized external action.

Acceptance: reproducible benchmark fixtures, documented operating envelope and failure remedies, passing CI on both providers, and recorded live checks when authorized.

## Deferred

Session replay, heatmaps, AI insights, teams, public dashboards, scheduled reports/alerts, and additional payment providers remain outside these stages.

## Progress log

- 2026-09-10: Reviewed the current implementation and created this sequence. Corrected the initial review's date-preset gap: Today and Yesterday are already implemented. Stage 1 started; no deployment or production data changes.
- 2026-09-10: Stage 1 implemented. `npm run check` passes (46 tests passed, 2 PostgreSQL-only tests skipped); `npm run test:postgres` and `npm run test:hyperdrive` each pass all 25 integration tests. Checks cover real queue delivery, duplicate replay, typed/empty/Unicode values, malformed payload rejection, filtering, cursors, site isolation, SSR and private server functions. Desktop (1440px) and mobile (390px) browser checks cover populated/empty results, invalid number feedback, property filtering across reload, pagination, and light/dark appearance; no browser errors or horizontal overflow observed. See [EVENTS.md](EVENTS.md).
- Local activation remains pending: applying PostgreSQL migration `0003_event_properties.sql` to the existing development database waited on a pre-existing long-running query. Canceled only the waiting migration; its transaction rolled back. Apply `npm run db:migrate:postgres` once that query releases its lock. Existing D1 development data was not migrated; apply `npm run db:migrate:local` before switching to D1. Both migrations passed in isolated test databases. No deployment, commit, or production data mutation.
- 2026-09-10 follow-up: Identified the blocker as an abandoned funnel-report SELECT (PostgreSQL PID 32743, started 10:44:42 UTC). Its client socket was closed while the query continued running. Canceled that specific read, then successfully applied and verified PostgreSQL migration 0003. No other active queries remained. The local PostgreSQL activation blocker is resolved; D1 development migration remains pending until that backend is used.
- Before stage 2: address expensive repeated scans in `funnelCounts` and add bounded database query execution. The abandoned report exposed a runtime gap that small correctness fixtures do not catch.
- Next feature stage: installation verification and diagnostics (stage 5).

- 2026-09-10: Funnel runtime fix uses indexed next-event seeks instead of rescanning all events for each attempt. Isolated PostgreSQL benchmark: 100,000 events, 10,000 visitors, three steps in 190 ms. PostgreSQL queries have a 15-second statement timeout, 3-second lock timeout, and 10-second idle transaction timeout, including analytics transactions through Hyperdrive. Tests confirm cancellation, rollback, lock release and subsequent query success. Removed automatic funnel polling/retries. Before stage 2 changes, D1 correctness tests passed (46), PostgreSQL passed (26 including runtime), and Hyperdrive passed (25).

- 2026-09-10: Stage 2 complete. Goals support exact page paths and up to three typed AND property conditions; funnel steps share these conditions. Added goal editing, canonical definition uniqueness, raw-event matching for richer goals alongside existing summary reads, historical comparisons, and multiple matching goal labels without duplicating visitor journey events. Existing event-only definitions and APIs remain valid. See [CONVERSIONS.md](CONVERSIONS.md) for denominators, retention and API semantics.
- Final checks: `npm run check` passes (47 tests passed, 3 PostgreSQL-only tests skipped, build/typecheck/local deployment configuration checks pass). PostgreSQL passes 27 tests including the 100,000-event runtime/cancellation fixture; Hyperdrive passes 26 integration tests in local emulation. Typed conversion fixtures cover anonymous counts, numeric/string/boolean distinctions, missing properties, normalized duplicates, page goals, current/previous periods, filtered and rolled-up results, repeated ordered steps, edits/archive and ownership.
- Browser QA used an isolated D1 workspace: created a property goal, edited it into a page goal, verified invalid number feedback at 390px, created a conditioned funnel with the expected 1 entrant / 1 completion, and reopened its editor with the condition preserved. Inspected light/dark and desktop/mobile layouts (1440px/390px); mobile funnel dialog and document have no horizontal overflow. Applied and verified PostgreSQL migration `0004_conversion_conditions.sql` locally with bounded lock waiting. D1 migrations 0015/0016 remain pending only for the existing unused D1 development database. No deployment or commit.

- 2026-09-10: Documentation refresh before stage 3. Rebuilt the README around current capabilities and a short setup path, added a documentation index and dedicated development/deployment/tracking/reporting guides, and reconciled scope, roadmap, provider support, property conversions and presence behavior. Checked local links/assets and deployment configuration; reviewed a local Markdown preview. No application or database changes in this documentation slice.

- 2026-09-11: Stage 3 complete. Overview → Conversions now selects a goal and compares sessions, converted sessions and conversion rates by acquisition source or landing page, with sortable metrics, 50-group pagination and previous-period comparisons. Acquisition filters qualify the earliest retained session event; path qualifies the first retained pageview. Repeated conversions count once, anonymous events are excluded, and comparison-only groups remain visible. The goal and view persist in the URL. See [CONVERSION_PERFORMANCE.md](CONVERSION_PERFORMANCE.md) for denominators, retention behavior and the owner-session API.
- Final stage 3 validation: `npm run check` passes (56 tests passed, 3 PostgreSQL-only tests skipped, with typecheck/build/deployment configuration checks); PostgreSQL passes all 36 tests and Hyperdrive local emulation passes all 35. Fixtures cover typed and page goals, cross-period sessions, acquisition versus later-event filters, anonymous and legacy traffic, repeated completions, null landing pages, archive selection, ownership, server functions, malformed inputs, rollup parity and multi-page sorting. The 100,000-event PostgreSQL conversion fixture measured 433 ms before the final explicit null-key tie-break; the final suite also passes its 10-second runtime bound.
- Browser QA on an isolated D1 workspace verified expected session/goal totals, source and landing views, sorting, previous-period controls, and desktop/mobile layouts at 1440px/390px in light and dark themes. Mobile document width remains 390px; the table has its own horizontal scroll region. Pagination and empty/error API behavior are covered by automated fixtures. README and reporting documentation now reflect stage 3; stage 4, durable revenue attribution, is next. No stage 3 migration, deployment or commit; existing workspace changes were preserved.

- 2026-09-11: Stage 4 implemented. Added durable payment attribution snapshots and captured first-touch/last-non-direct policies with a configurable 1–365-day lookback (default first touch, 30 days). Pending snapshots reconcile for at least 72 hours, then finalize on the next check. Refunds and late identity cannot reopen finalized attribution. Reports expose unmatched reasons, model/window and pending/finalized/backfill state; API and MCP payment reads share those snapshots. Bounded backfills preserve current policy per initialized record; raw retention protects eligible pageviews until initialization/finalization, and payment deletion cascades snapshots. Revenue polling/retries/focus refresh are disabled.
- Stage 4 automated validation: `npm run check` passes 58 tests with 3 PostgreSQL-only skips, including build/typecheck/deployment configuration checks. PostgreSQL passes 38 tests and Hyperdrive local emulation passes 37. Fixtures cover late/out-of-order history, direct fallback, deterministic ties, captured policy changes, missing/late identity, concurrent refunds/reconciliation, finalized stability, retained dimensions after cleanup, payment cascade deletion, pending retention protection, currency separation, 205-payment resumable backfill, ownership and API/MCP metadata. PostgreSQL's 200-payment backfill and report against 100,000 events measured 144 ms in the isolated runtime fixture.
- Applied and verified PostgreSQL migration `0007_payment_attribution.sql` on the existing local development database with 3-second lock and 15-second statement bounds. D1 migration `0019_payment_attribution.sql` passed isolated automated and browser-QA database upgrades; the existing unused D1 development database remains unmigrated. Browser QA completed on the existing port-8790 tab at the user's request: desktop/mobile (1440px/390px), light/dark, model selection without saving a changed policy, native lookback validation, manual reconciliation feedback, populated matched/unmatched totals and 50-row pagination. Dialog and document widths have no horizontal overflow; restored the original dark theme and viewport. No deployment or commit.
- Completed initial attribution backfill for all 5,380 payments in the local Atlas Demo website using bounded service batches; no records remain awaiting initialization. Snapshots retain the existing first-touch/30-day policy and their normal 72-hour pending interval. Verified current-period monetary totals remained unchanged after backfill. Source payments/events were not modified to test behavior. The user's port-8790 app remains running; the separate port-8791 QA server was stopped. Stage 5, installation verification and diagnostics, is next.
