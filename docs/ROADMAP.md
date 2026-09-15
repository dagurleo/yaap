# Roadmap

Updated 2026-09-12. [Documentation](README.md) · [Detailed implementation plan](IMPLEMENTATION_PLAN.md)

## Built

- [x] One-owner workspace with multiple websites and protected reports
- [x] D1 and PostgreSQL backends, including local Hyperdrive integration tests
- [x] Traffic reports, combined filters, site reporting timezones and previous-period comparisons
- [x] Sessions, bounce rate, entry/exit pages, visitor cohorts and journeys
- [x] Full, anonymous and paused tracking; independent live presence
- [x] Custom event properties and typed event exploration
- [x] Page/event goals and ordered funnels with property conditions, editing and archive/restore
- [x] Goal conversion performance by acquisition source and landing page, with sorting and comparisons
- [x] Stripe and server-API payments, deduplication, refunds and durable first-touch/last-non-direct attribution with lookback and reconciliation
- [x] Collection rules, bot exclusion, independent retention and ingestion counters
- [x] Daily traffic/activity/session summaries and bounded PostgreSQL report execution
- [x] Responsive workspace with light, dark and system themes

These features are implemented and verified locally. The [implementation log](IMPLEMENTATION_PLAN.md#progress-log) records test and browser checks. Live Cloudflare provisioning and Stripe delivery remain unverified.

## Next

Work proceeds one stage at a time. Stage 4 is implemented; installation verification and diagnostics are next.

| Order | Slice | Outcome |
| --- | --- | --- |
| 5 | Installation diagnostics | First-event verification and actionable collection status |
| 6 | Saved report views | Named, versioned sets of report filters |
| 7 | Hourly charts | Finer-grained reporting; site reporting timezones are implemented |
| 8 | Chart annotations | Timestamped notes for launches and changes |
| 9 | Multi-site summary | Comparable traffic, goal performance and collection freshness |

Acceptance criteria and dependencies are in the [implementation plan](IMPLEMENTATION_PLAN.md).

## Planned ads integration

[Google Ads and Meta integration](ADS_IMPLEMENTATION_PLAN.md) has a separate implementation plan: ad attribution, connected-account spend reporting, then purchase forwarding. Our Cloudflare deployment uses our developer credentials; self-hosters configure their own. The first [campaign/ad attribution slice](ADS_ATTRIBUTION.md) is implemented; connections, raw click identifiers, spend and forwarding remain pending. This workstream does not change the ordered stages above.

## Before public release

- [ ] Owner recovery, including partial setup and session revocation
- [ ] Portable exports, backups and tested restores
- [x] Adopt Elastic License 2.0 with a self-hosting and contractor-use summary
- [x] Basic release/upgrade guidance (restore verification remains pending)
- [ ] Capacity, ingestion burst and cleanup-lag benchmarks
- [ ] Fresh-account Cloudflare deployment, resource renaming and upgrade verification
- [ ] Live Stripe test-mode delivery verification

The root deploy template is covered by local build checks; [release readiness](RELEASE_READINESS.md) records the remaining live verification. Retention is opt-in. Finalized payment attribution survives raw-event expiration; snapshots expire with payments.

## Deferred

Public dashboards, session replay, heatmaps, experiments, AI insights, scheduled reports/alerts and additional payment providers. Website viewer invitations and optional hosted billing are implemented; self-hosting remains the default.
