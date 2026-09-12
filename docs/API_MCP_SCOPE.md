# Public API and MCP scope

Scoped 2026-09-10. Implementation began 2026-09-11; see [current API usage and compatibility](API.md). **User decision: reporting and management both ship in v1.** This document preserves the proposed scope. API.md records implemented contracts and remaining hardening.

YAAP remains a self-hosted, single-owner, multi-site product. “Public API” means a documented integration interface requiring authorization; it does not make analytics publicly readable.

## Architecture and existing coverage

Expose versioned REST at `/api/v1` and remote MCP at `/mcp` in the existing Worker. Both adapters call shared validated application services with an authorization context. Keep metric calculations in the existing provider-neutral report layer. The MCP need not make HTTP calls back into its own Worker.

Current `/api/*` routes require Better Auth owner sessions; writes also require the app Origin. They are not ready for external token clients. Preserve these routes and existing ingestion clients while adding v1.

| Current implementation | Public API work |
| --- | --- |
| `apps/web/src/api.ts`: sites, overview, events, explorer, visitors/journeys, live, goals, funnels, revenue, operations, payment settings | Versioned routes, scopes, stable schemas, errors and pagination |
| `apps/web/src/features/dashboard/functions.ts`: also site details and tracking rules | Bring existing management services into REST/MCP |
| `apps/web/src/server/overview.ts`: bundles traffic, audience, sessions, goals and optional live data | Separate bounded reports without recalculating every dashboard panel |
| `apps/web/src/server/event-explorer.ts`: events, name counts, typed property values | Independent discovery; property-key discovery is new |
| Goals/funnels: definitions mixed with report results | Separate definition reads from expensive report evaluation |
| Revenue: totals, source/campaign/landing breakdowns, payment rows | Separate aggregate and individual-payment access |
| Site-owned payment ingestion key | Separate public API credentials; never reuse this key for management |

## Endpoint and tool inventory

Every row below is v1 unless explicitly deferred. Paths are relative to `/api/v1`; `S` abbreviates `/sites/{siteId}`. Each method listed is a distinct operation. Tool arguments use `siteId` plus the corresponding request fields. “New” identifies new service behavior, even where adjacent functionality exists.

### Discovery and access

| HTTP operation | MCP tool | Contract / work |
| --- | --- | --- |
| `GET /me` | `get_access` | Credential identity, allowed sites, granted scopes; no owner email needed. New. |
| `GET /capabilities` | `get_capabilities` | API version, available reports, metrics/dimensions, filter support, limits, timezone and feature flags. New. |
| `GET /openapi.json` | — | Versioned machine-readable REST contract; no installation secrets. New. |
| `GET /api-keys` | — | Owner-only credential metadata; no plaintext keys. New. |
| `POST /api-keys` | — | Name, explicit site grants, scopes, expiry; return secret once. New. |
| `DELETE /api-keys/{keyId}` | — | Revoke immediately. Create replacement then revoke for rotation. New. |
| `GET /audit-log` | `list_audit_log` | Bounded, paginated management history, actor and changed field names; redact secrets and event payloads. New. |

Initial keys are created through an owner-session settings screen using the same credential service. Credential administration is session-only for v1; an agent cannot mint broader credentials. API-key listing/revocation can also be performed there. `/me` exposes only the calling credential's grants.

### Websites and collection

| HTTP operation | MCP tool | Contract / work |
| --- | --- | --- |
| `GET /sites` | `list_sites` | Paginated authorized sites; name search; no report computation. Existing service. |
| `POST /sites` | `create_site` | Name and exact primary origin; returns site and installation link. Existing service. |
| `GET S` | `get_site` | ID, name, origin, created time, current reporting timezone. Standalone read. |
| `PATCH S` | `update_site` | Name/origin changes; preserve site ID and history. Existing service. |
| `GET S/tracking-rules` | `get_tracking_rules` | Additional origins, allow-all, hostname/path exclusions, excludeBots. Standalone read. |
| `PATCH S/tracking-rules` | `update_tracking_rules` | Validate and atomically save supplied rule changes. Existing service needs partial-update adapter. |
| `GET S/installation` | `get_installation` | Generate snippet for `mode=full|anonymous|paused`, tracker URL and event/payment integration examples. New public packaging. |
| `GET S/retention` | `get_retention` | Event/payment policies and last successful cleanup. Standalone read. |
| `PATCH S/retention` | `update_retention` | Independent event/payment days: 0, 30, 90, 180, 365; 0 disables expiration. Existing service, separate public schema. |
| `GET S/ingestion-status` | `get_ingestion_status` | Available queued/stored/duplicate/bot/failure/expired counters, hourly buckets and freshness. Existing operations data. |

Installation mode currently changes the generated snippet, not server-enforced collection mode. `get_installation` does not deploy code to the website. Do not expose a misleading `pause_site` tool. Server-enforced pause would need an explicit new product feature.

Origin changes and exclusion changes affect future collection. Retention changes can cause later deletion by cron; return that consequence and the saved policy. Bot filtering belongs in tracking rules, even though the internal operations update currently also accepts it.

Site deletion/archive is deferred: there is no existing lifecycle implementation. Define tracker behavior, payment deliveries, pending queue writes, retention, restoration and cascading deletion before adding it.

### Traffic, audience and live reporting

Use named reports with constrained options. Do not expose SQL or an unrestricted query language. Reports below use GET with validated date/filter parameters; complex query bodies can be a later addition if needed.

| HTTP operation | MCP tool | Contract / work |
| --- | --- | --- |
| `GET S/reports/overview` | `get_overview` | Traffic/identity/session headline metrics and previous-period comparison; exclude raw visitors and payments. Existing calculations. |
| `GET S/reports/timeseries` | `get_timeseries` | Daily pageviews first; explicit supported metrics. Additional daily metrics require new aggregation and parity fixtures. |
| `GET S/reports/breakdown` | `get_breakdown` | One supported dimension and metric, bounded limit, stable sort, complete total and truncation flag. Existing traffic/audience calculations. |
| `GET S/reports/audience` | `get_audience_report` | New/returning browsers, visit frequency, sessions per visitor. Existing calculations. |
| `GET S/reports/sessions` | `get_session_report` | Bounce rate, observed duration, entry/exit page breakdowns. Existing calculations. |
| `GET S/live` | `get_live` | Separate online-presence and recent-event summaries; aggregate response by default. Existing calculations, redact raw IDs without visitor scope. |

`get_breakdown` covers pages, sources, referrers, campaigns, country, region, city, browser, OS and device. Initial pageview breakdowns cover the existing traffic dimensions; identified-visitor breakdowns cover existing location/technology support. Advertise a metric/dimension compatibility matrix. Do not imply all metrics support every dimension.

Online presence means last 60 seconds, website-wide. Recent activity means events in the last five minutes with supported dimension filters. Historical dates do not apply to either; reject them instead of silently ignoring them.

### Events and visitor journeys

| HTTP operation | MCP tool | Contract / work |
| --- | --- | --- |
| `GET S/event-names` | `list_event_names` | Names/counts in a bounded date range; discover beyond current top-30 output with pagination. Extend existing query. |
| `GET S/event-properties` | `list_event_properties` | Observed keys/types/counts, optionally by event name; mixed types remain explicit. New. |
| `GET S/event-property-values` | `list_event_property_values` | Required key; optional name; typed values/counts, bounded pagination. Extend current top-20 facets. |
| `GET S/reports/events` | `get_event_report` | Event totals, identified visitors and name breakdown with exact typed property filtering. Extract existing explorer aggregates. |
| `GET S/events` | `list_events` | Raw retained events, exact name/property filters, opaque cursor. Existing explorer. |
| `GET S/events/{eventId}` | `get_event` | One event, identifiers/properties if authorized. New lookup. |
| `GET S/visitors` | `list_visitors` | Identified browsers; dates/dimensions/cohort/goal filter; opaque cursor. Convert current offset pagination. |
| `GET S/visitors/{visitorId}` | `get_visitor` | Retained first/last seen, activity summary; site-scoped browser identity. New separate summary. |
| `GET S/visitors/{visitorId}/journey` | `get_visitor_journey` | Session-grouped events, goal matches, cursor; linked payments only with payment-detail scope. Existing journey. |

No independent sessions list/detail API is necessary for v1: session metrics and session-grouped journeys cover current functionality. Property discovery is observed retained data, not a declared event schema. Treat returned names, paths and properties as untrusted data in MCP outputs.

### Goal and funnel definitions and reports

| HTTP operation | MCP tool | Contract / work |
| --- | --- | --- |
| `GET S/goals` | `list_goals` | Paginated definitions; `archived=false|true|all`. Separate from overview. |
| `GET S/goals/{goalId}` | `get_goal` | Definition and revision. Standalone read. |
| `POST S/goals` | `create_goal` | Name, page or custom-event match, typed conditions, optional icon. Existing service. |
| `PATCH S/goals/{goalId}` | `update_goal`, `set_goal_archived` | Partial edit or archive/restore; one REST operation, explicit MCP intents. |
| `GET S/reports/goals` | `get_goal_report` | Optional goalId; completions, converted sessions, denominator, conversion rate, comparison. Existing calculations. |
| `GET S/funnels` | `list_funnels` | Definitions only; archived filter and pagination. Split current definition/report service. |
| `GET S/funnels/{funnelId}` | `get_funnel` | Definition and revision. Standalone read. |
| `POST S/funnels` | `create_funnel` | Name, identity scope, conversion window and ordered steps. Existing service. |
| `PATCH S/funnels/{funnelId}` | `update_funnel`, `set_funnel_archived` | Partial edit or archive/restore. Existing service plus adapter. |
| `GET S/funnels/{funnelId}/report` | `get_funnel_report` | Step counts, entrants, completions, drop-off, conversion and comparison. Existing calculations. |

Goals and funnel steps support at most three exact typed AND conditions on the same event. Funnels have 2–8 steps and 1/24/168/720-hour windows, with visitor/session scope. Changes recalculate retained history; archived definitions can be queried explicitly. No hard-delete methods needed for v1. Omitted PATCH fields must be preserved, unlike current goal replacement semantics; explicit empty conditions clears them.

### Revenue and integrations

| HTTP operation | MCP tool | Contract / work |
| --- | --- | --- |
| `GET S/reports/revenue` | `get_revenue_report` | Gross/refunds/net/payment count/identified customer count by currency; explicit live/test mode; comparison. Existing calculations. |
| `GET S/reports/revenue/breakdown` | `get_revenue_breakdown` | Source, campaign or landing page; currency remains part of every group. Existing calculations. |
| `GET S/payments` | `list_payments` | Authorized payment detail; date/mode/visitor/provider filters and opaque cursor. Some filters/pagination are new. |
| `GET S/payments/{provider}/{mode}/{externalId}` | `get_payment` | Composite identity; payment/refund state and available attribution. New lookup. |
| `GET S/payment-integration` | `get_payment_integration` | API key hint, Stripe test/live configured booleans and webhook URLs; never secrets. Existing status. |
| `PUT S/payment-integration/stripe/{mode}` | — | Set webhook signing secret through API/owner settings. Existing service. |
| `DELETE S/payment-integration/stripe/{mode}` | `disconnect_stripe` | Remove configured secret for that mode. Existing service. |
| `POST S/payment-integration/api-key` | — | Generate/rotate ingestion key, returned once; existing consumers need replacement. Existing service. |
| `DELETE S/payment-integration/api-key` | `revoke_payment_ingestion_key` | Revoke server payment ingestion. Existing service. |

MCP management includes integration status/disconnection. Secret-entry and secret-returning operations stay in REST/owner settings so credentials need not travel through model context. A future client-mediated secret setup flow can extend this.

Payment writes here record analytics; YAAP does not charge cards or execute refunds. Existing payment delivery records cumulative refund state. Attribution uses durable per-payment snapshots; aggregate metadata returns `attributionModel=per_payment_snapshot`. Payment reads expose captured first-touch/last-non-direct model, lookback, pending/finalized state and unmatched reason. Pending records reconcile for at least 72 hours and finalized attribution survives raw-event expiry. Policy controls remain in the owner-session payment settings API.

### Collection endpoints maintained separately

| Existing endpoint | v1 disposition |
| --- | --- |
| `POST /ingest`, `OPTIONS /ingest` | Preserve browser event/presence ingestion, public site ID and origin/rule validation. Never use it as management authentication. |
| `POST /payments/{siteId}` | Preserve authenticated server payment ingestion and idempotent payment identity. Document as supported collection API. |
| `POST /payments/stripe/{siteId}/{mode}` | Preserve signature-validated Stripe deliveries. |
| `GET /health` | Preserve basic installation liveness/database check; not a detailed analytics diagnostic. |

Authenticated server-side event ingestion, batch ingestion and historical imports are separate follow-up work: decide identity provenance, geo/source handling, event time versus receipt time, replay/idempotency and anonymous behavior first. No MCP event-injection tool in v1.

## Shared public contracts

| Concern | Proposed v1 rule |
| --- | --- |
| Dates | Explicit inclusive `from`/`to` UTC calendar dates, up to 366 days through today; MCP requires dates for historical queries. Return resolved start/end/asOf/timezone and current-day partial flag. |
| Comparisons | `compare=previous_period`; previous equal calendar-day range. Partial current day currently compares to a full previous period; expose this in metadata. No separate comparison endpoint. |
| Filters | Existing dimensions combine with AND. Exact scalar property types stay distinct. Reject unknown/unsupported fields rather than silently drop them; publish report-specific support. |
| Unknown values | Public structured unknown marker or explicit `is_unknown` operator; do not force callers to infer the internal `__unknown__` sentinel. Freeze encoding in OpenAPI. |
| Metrics | Stable machine names and units; rates as 0–1, duration in seconds, unavailable as null. Return conversion numerators/denominators. Distinct range visitors are never a sum of daily uniques. |
| Money | Integer minor units plus currency, with no cross-currency total. Live/test are separate. |
| Response | `{data, meta, pagination?}`; meta carries requestId, resolved query, asOf, semantics version and applicable limitations. Resource reads return revision/ETag. |
| Lists | Default 50, max 100; stable tie-breaks and opaque cursors bound to site, query and ordering. Discovery pagination is required; bounded top breakdowns instead return `truncated`. |
| Consistency | Cursor cutoff stabilizes event traversal; it is not a database snapshot. Retention, late writes and mutable payment/definition state can change results. Do not promise snapshot exports. |
| Writes | PATCH preserves omission, validates the merged object and updates atomically. Conditional writes with ETag/If-Match; stale writes return 412. New revision support on both providers. |
| Retries | Idempotency-Key for create/secret-rotation operations; same key + changed payload returns conflict. Store deduplication within declared expiry and principal/site boundary. Secret replay responses require protected short-lived storage or documented one-time recovery semantics. |
| Errors | Stable `{error:{code,message,details?,requestId}}`; 400 validation, 401 missing/invalid credentials, 403 insufficient scope, 404 unavailable site/resource, 409 conflict, 412 stale revision, 413 payload, 429 quota, 503 bounded-query failure. Include Retry-After when retry is appropriate. |
| Capacity | Per-credential/site rate and concurrency limits; bound dimensions, rows and total request time. Benchmark D1 and PostgreSQL before publishing numeric quotas. Do not poll funnels automatically. |
| Privacy | Aggregate scope cannot return raw event/visitor/payment rows through bundled responses, live data or linked journey payments. No secrets in diagnostics/audit logs. |

## Authorization scope

Credentials have explicit site grants plus action scopes. Proposed scopes: `sites:read`, `sites:create`, `sites:write`, `reports:read`, `events:read`, `visitors:read`, `goals:read`, `goals:write`, `funnels:read`, `funnels:write`, `revenue:read`, `payments:read`, `settings:read`, `settings:write`, `retention:write`, `integrations:read`, `integrations:write`, `operations:read`, `audit:read`.

Scope mapping follows endpoint families: goal/funnel definition reads use their read scopes; their reports use `reports:read`. Revenue aggregates use `revenue:read`; individual payments require `payments:read`. Event/property discovery and raw event access use `events:read`; aggregate event reports use `reports:read`. Raw browser identities additionally require `visitors:read`. Installation reads use `settings:read`; ingestion status uses `operations:read`. `/me` and capabilities need any valid credential; site listing requires `sites:read`.

`sites:create` is installation-level. New sites are added atomically to the creating credential's grants without increasing its action scopes. Existing-site tokens do not automatically gain future sites. The owner can explicitly issue an all-sites credential when desired. Every adapter passes the same authorized principal into services; an owner ID alone is insufficient for scoped external access.

## MCP connection and behavior

Ship a remote `/mcp` endpoint using Streamable HTTP with documented SDK/protocol versions and actual target-client compatibility tests. Protocol behavior is version-dependent; pin it before implementation instead of hand-writing a transport from older examples. The official repository documents a changed transport shape for revision 2026-07-28 ([transport reference](https://github.com/modelcontextprotocol/modelcontextprotocol/blob/main/docs/specification/2026-07-28/basic/transports/streamable-http.mdx)).

For broad remote-client compatibility, include OAuth authorization discovery, owner consent to sites/scopes, authorization-code + PKCE, token refresh/revocation and resource/audience validation. Personal tokens cover scripts and MCP clients supporting configured authorization headers, but that alone is not universal remote-client onboarding. Authorization metadata and supported client-registration mechanisms must match the chosen protocol and client matrix ([authorization reference](https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization)).

Reserve `GET /.well-known/oauth-protected-resource/mcp`, `GET /.well-known/oauth-authorization-server`, `GET /oauth/authorize`, `POST /oauth/token`, and `POST /oauth/revoke`; final paths are advertised metadata and depend on the selected provider. Client registration is a capability decision, not an assumed open `/register` endpoint. Owner login/consent reuses the existing session system; supporting OAuth clients is additional work.

Tools return bounded structured results with input/output JSON schemas and brief human-readable context. Set accurate read-only/destructive/idempotent annotations, and enforce authorization on the server regardless of annotations. Settings, retention and archive tools return saved state and consequences; missing sites or currencies prompt clarification in the client rather than guessed writes ([tools reference](https://modelcontextprotocol.io/specification/2025-11-25/server/tools)).

Tool discovery reflects granted capabilities, and every call rechecks authorization. Expose all v1 business tools listed above; do not automatically turn every REST operation into a tool. Metric/filter documentation can also be MCP resources (`yaap://docs/metrics`, `yaap://docs/filters`) while remaining accessible through `get_capabilities` for clients that use only tools. Prompts such as “weekly review” are optional follow-up conveniences. A stdio wrapper is optional and can call REST with an environment-provided token.

## Follow-up methods tied to product work

| Dependency | Candidate future surface |
| --- | --- |
| Conversion acquisition semantics | `GET S/reports/conversions/breakdown` / `get_conversion_breakdown` by source or landing page |
| Durable attribution | Attribution settings read/update, model-aware revenue reports; operator-controlled backfill |
| Installation diagnostics | `GET S/installation/status` / `get_installation_status`, based on evidence received by YAAP |
| Saved views | List/get/create/update/delete `S/views`; corresponding MCP tools |
| Annotations | List/get/create/update/delete `S/annotations`; corresponding MCP tools |
| Hourly/timezone support | Extend site settings, capabilities and timeseries; no incompatible metric change |
| Multi-site summaries | Bounded `GET /reports/sites`; `get_sites_report` |
| Exports | Create/get/download/cancel export jobs; scoped short-lived downloads. CSV/report exports separate from full backups. |
| Site lifecycle / erasure | Site archive/restore and deletion jobs; visitor erasure only with explicit identifier and replay policy |
| Outbound webhooks | Subscription CRUD, signing-secret lifecycle, delivery history/retry; only when a concrete integration requires it |

Owner recovery, database restore/import, rollup rebuild, queue replay and deployment remain operator procedures. Teams, public dashboards, alerts and subscription billing remain outside current product scope.

## Delivery sequence and acceptance

These are implementation slices of one v1 release, not a reporting-only launch:

1. Freeze schemas, metric compatibility matrix and client matrix. Add scoped credentials, owner credential UI, shared principal enforcement, idempotency/revisions and audit storage to both database providers.
2. Add site/settings/retention and goal/funnel management, discovery reads, independent report adapters and raw detail pagination. Preserve existing consumers.
3. Add revenue/integration adapters and MCP tools; complete remote authorization onboarding and documentation/examples.
4. Verify REST/MCP/dashboard metric parity on isolated D1 and PostgreSQL fixtures; exercise Hyperdrive, forbidden-site access, response-field scope isolation, pagination ties, typed properties, archived definitions, stale edits, duplicate writes, expiry/revocation and bounded query failures. Test actual supported MCP clients for both reports and mutations.

Representative acceptance workflows: create a site → obtain snippet → observe received events → discover event/property values → create a conditioned goal and ordered funnel → report conversion/drop-off → edit/archive/restore definitions → inspect revenue by currency → update exclusions/retention → verify saved settings and audit history.

The largest new work is credentials/OAuth and shared authorization, then reusable report contracts/discovery/pagination. Most business mutations and metric calculations already exist. No runtime implementation or deployment is part of this scoping document.
