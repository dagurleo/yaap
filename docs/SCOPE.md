# Product scope

Updated 2026-09-10. [Roadmap](ROADMAP.md) · [Implementation plan](IMPLEMENTATION_PLAN.md)

Yaap is self-hosted website analytics for an owner managing multiple websites. It brings traffic, visitor behavior, conversions and payment reports into a private workspace deployed in the owner's Cloudflare account.

## Product decisions

| Area | Current decision |
| --- | --- |
| Ownership | One owner per installation; no public signup or teams |
| Runtime | One Cloudflare Worker for the dashboard, APIs, queue consumer and scheduled maintenance |
| Storage | D1 by default, or PostgreSQL for the entire installation; Hyperdrive in production |
| Authentication | Better Auth email/password; a separate bootstrap secret authorizes initial owner creation |
| Database layer | Drizzle schemas, shared store/executor and explicit provider-specific SQL expressions |
| Migrations | Wrangler for D1; checked-in PostgreSQL migrations with transactional checksum tracking |
| Collection | Full identifiers by default; anonymous and paused modes are available |
| Identity | Browser/session identifiers, hashed per site; no inferred person or account identity |
| Reporting | Site-local calendar ranges, retained event history and exact range-wide identity counts |
| Payments | Optional Stripe/server API; refunds and currencies remain separate |
| Appearance | Shared semantic theme tokens, light/dark/system themes and responsive UI |

Switching database providers selects a different store; it does not migrate data. Secrets and account-specific resource IDs stay out of the reusable source configuration.

## Implemented behavior

Traffic, custom properties, event exploration, visitor journeys, session metrics, page/event goals, ordered funnels, live presence, payments, collection controls and rollups are built. See the [README](../README.md#whats-built) and [metric definitions](REPORTING.md) for the current capabilities.

Tracking configuration does not establish consent. Website integrations decide when to collect events and use identifiers. Anonymous history is not retroactively linked to a browser. Event properties are explicit application data; no form or page content is captured automatically.

Revenue uses durable per-payment snapshots with first-touch or last-non-direct models and a configurable 1–365-day lookback. Records reconcile for at least 72 hours and then freeze; settings changes affect new attribution records. Backfills use retained history only. Snapshots survive raw-event expiry and expire with their payments. Event and payment retention are independent and disabled by default. There is no permanent aggregate-history archive beyond raw retention.

## Planned work

The [implementation plan](IMPLEMENTATION_PLAN.md) defines ordered feature slices and acceptance criteria. Conversion performance by source/landing page comes next, followed by durable attribution. Installation diagnostics, saved views, annotations and multi-site summaries follow.

Owner recovery, export/restore, capacity testing and a verified fresh installation are required before public release. Yaap is source-available under [Elastic License 2.0](../LICENSE.md); see the [license summary](../README.md#license) for internal use, contractor setup and hosted-service restrictions.

## Outside the current scope

Session replay, heatmaps, experiments, teams, public dashboards, hosted SaaS billing, AI insights, scheduled reports/alerts and additional payment providers. Third-party services are optional integrations rather than requirements for basic analytics.
