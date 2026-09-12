# Yaap documentation

[← Project overview](../README.md)

## Install and run

| Guide | What it covers |
| --- | --- |
| [Local development](DEVELOPMENT.md) | First setup, synthetic demo data, commands, code layout and contribution conventions |
| [Database backends](DATABASES.md) | D1, local PostgreSQL, production Hyperdrive, migrations and provider tests |
| [Cloudflare deployment](DEPLOYMENT.md) | Workers Builds, deploy-button configuration, secrets and validation status |
| [Release readiness](RELEASE_READINESS.md) | Deployment audit, verified checks, and remaining launch work |
| [Operations](OPERATIONS.md) | Retention, ingestion counters, failed deliveries and release verification |

## Collect and understand data

| Guide | What it covers |
| --- | --- |
| [Tracking and identity](TRACKING.md) | Script lifecycle, full/anonymous/paused modes, browser identifiers and source context |
| [Events and properties](EVENTS.md) | Custom properties, validation limits, explorer filters and HTTP API |
| [Reports and metrics](REPORTING.md) | Dates, filters, sessions, audiences, journeys and live presence |
| [Conversion performance](CONVERSION_PERFORMANCE.md) | Session acquisition, landing pages, comparisons and conversion rates |
| [Goals and funnels](CONVERSIONS.md) | Exact matching, property conditions, denominators, editing and runtime bounds |
| [Payments](PAYMENTS.md) | Server API, Stripe metadata/webhooks, refunds and attribution |
| [Public API and MCP](API.md) | Scoped tokens, reporting/management endpoints, MCP connections and OAuth |
| [Website settings](settings.md) | Installation, origins, exclusions, retention and tracking defaults |
| [Performance](PERFORMANCE.md) | Rollups, query design, measured fixtures and their limits |

## Project direction

- [Roadmap](ROADMAP.md): what is built, what comes next and public-release gates.
- [Implementation plan](IMPLEMENTATION_PLAN.md): ordered stages, acceptance criteria and verification log.
- [Ads integration plan](ADS_IMPLEMENTATION_PLAN.md): Google/Meta credentials, attribution, spend imports and purchase forwarding; planned work based on [research](ADS_INTEGRATION_RESEARCH.md).
- [Product scope](SCOPE.md): product boundaries and technical decisions.
- [Hosted billing scope](HOSTED_BILLING_SCOPE.md): optional Polar integration for the first-party hosted version, including workspace prerequisites and usage accounting.
- [Hosted pricing research](HOSTED_PRICING_RESEARCH.md): niche analytics competitors, published pricing ladders and recommended Yaap event tiers with cost assumptions.
- [Hosted infrastructure costs](HOSTED_INFRASTRUCTURE_COSTS.md): Cloudflare and PlanetScale rates, local event storage measurements, retention economics and revised pricing candidates.
- [Hosted Polar catalog](HOSTED_POLAR_CATALOG.md): latest product structure, event tiers, included features, trial and subscription-change proposal.
- [Hosted billing implementation plan](HOSTED_BILLING_IMPLEMENTATION_PLAN.md): staged implementation of pricing, trial/usage accounting, Polar checkout, limit-triggered upgrades and billing lifecycle tests.
- [Account registration scope](ACCOUNT_REGISTRATION_SCOPE.md): invitation-flow gaps, hosted public signup, verification, account provisioning and password recovery.
- [Website sharing feature](WEBSITE_SHARING_FEATURE.md): implementation handoff for lightweight accounts, site-specific Viewer invitations, access rules and provider-parity tests.

The guides describe the current implementation. Test counts and dated verification notes live in the implementation plan; local verification does not establish live deployment readiness.
