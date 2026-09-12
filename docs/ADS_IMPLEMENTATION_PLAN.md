# Google Ads and Meta implementation plan

Created 2026-09-11. Status: planned; no connector implemented. Based on [integration research](ADS_INTEGRATION_RESEARCH.md) and the current tracker, payment attribution, database and Worker code.

## Agreed deployment model

Use the same implementation in our Cloudflare deployment and self-hosted installations. We configure our own Google/Meta developer applications and credentials in Cloudflare. Self-hosters create their own developer applications, configure callback URLs, and supply their own credentials. Distribute integration code and setup documentation, never our secrets. There is no shared credential relay or requirement for self-hosters to authenticate through our deployment.

Developer credentials identify the Yaap installation to the platforms; they do not grant access to somebody else's advertising account. The owner still connects Google/Meta, selects accessible advertising assets, and enables the features they want. Keep the existing single-owner/multiple-site architecture; this project does not introduce teams or SaaS billing.

This document specifies a feature workstream. It does not renumber or supersede the existing [implementation stages](IMPLEMENTATION_PLAN.md). Preparing this plan does not deploy resources, provision credentials, or enable conversion exports.

## Release scope

Deliver three incremental releases:

1. **Attribution:** campaign/ad dimensions connected to existing visits, goals and payment reports. Tagged campaign attribution remains usable without an account connection.
2. **Spend:** owner-connected Google Ads and Meta accounts, campaign costs and attributed return on ad spend (ROAS).
3. **Purchase forwarding:** verified Stripe/server purchases sent to explicitly enabled destinations, with consent, deduplication, retries and diagnostics.

Defer qualified-lead delivery, customer email/phone matching, coordinated browser-tag installation, remarketing audiences, ad creation/editing, automatic cross-device identity, and combined platform-claimed conversion totals. Existing browser tags must have a documented coexistence path before purchase forwarding is enabled.

## 0. Verify provider contracts

Before committing connector interfaces, record a dated provider capability matrix and tested API versions under `docs/ads/`. Use official documentation and designated test/development advertiser assets.

- Google: use Ads API for spend and Data Manager API for new conversion ingestion, following the research's June 2026 migration finding. Verify account hierarchy, required scopes, refresh flow, reporting permissions, conversion destination types, permitted click-ID combinations, consent fields, event deadlines, asynchronous diagnostics, batch errors, transaction deduplication and adjustment support.
- Meta: verify the current login/token flow, minimum read and conversion permissions, accessible account/dataset/pixel enumeration, own-account versus external-account review requirements, Insights pagination/async jobs, URL macros, event matching requirements, deadlines, test events and browser/server deduplication. Documentation access was incomplete during research; these are unresolved contracts, not assumed capabilities.
- For both: document application setup, callback registration and credential renewal for our deployment and self-hosters. Public connection eligibility and own-account testing are separate checks.
- Prove the exact Worker-compatible authentication and REST calls. Prefer bounded REST adapters with pinned versions; do not assume a vendor SDK or local credential helper runs in Workers.

Acceptance: a redacted example of an authorized account read and a validation/test conversion request per provider, or a documented external access blocker with the affected release disabled. No live customer conversion is used as a test. Source work and mock-backed tests can proceed while access is pending, but cannot be labeled live-verified.

## 1. Advertising context and consent

Touch `packages/client/src/index.ts`, `apps/web/src/ingest.ts`, `apps/web/src/types.ts`, queue validation/storage, and the tracking guide. Keep existing tracker calls and version-1/version-2 collection working; introduce a versioned optional advertising envelope with strict bounds at both ingestion and queue consumption.

- Add campaign/ad identifiers as strings: provider, account when known, campaign, ad group/ad set, and ad. Keep labels separate from IDs. Include `utm_medium`, `utm_content` and `utm_term` where explicitly configured; do not collect arbitrary query strings.
- Define documented, allowlisted URL parameter mappings and provider-specific ad-link examples after stage 0. Never parse campaign IDs out of opaque click IDs. A Meta referrer or click ID alone is not proof of paid traffic; keep unresolved traffic distinct.
- Capture permitted Google click identifiers and Meta click/browser context in a separate envelope, with a stable touch ID and original touch timestamp. Repeated pageviews carrying the same context must not become new clicks. A subsequent ad click creates a new touch. Direct returns preserve history rather than overwriting it.
- Keep internal attribution and advertising export controls distinct. Propose `setAdvertisingConsent(...)` with explicit granted/denied/unknown states for storage, user-data sharing and personalization, plus a consent-policy version. Existing `setConsent` remains the legacy identity toggle. Final public names are fixed before publishing examples.
- Default advertising identifier storage and sharing off. Connect the new control to the site's consent manager before capture. Anonymous analytics stays available; no retrospective identification or replay of denied-period activity.
- Persist an authenticated-by-context receipt of the site's reported consent state, timestamp and policy version; do not claim the SDK independently verifies a human consent action. Apply withdrawal to queued unsent deliveries and clear advertising storage. Check current eligible state again before dispatch; capture-time consent alone is insufficient after known withdrawal.
- Use the existing visitor handoff for checkout and add an opaque site-scoped context/receipt reference where needed. The server resolves it; the browser never supplies trusted purchase amounts. Context references cannot read raw identities or cross sites.
- Establish explicit byte/field limits and whether the current 4,096-byte request bound remains sufficient. Never silently expand collection limits across the whole API.

Acceptance: SPA/full-load/direct-return/new-click behavior, bounded opaque IDs, blocked storage, denied/unknown/withdrawn consent, duplicate retries, site isolation, and legacy tracker compatibility. Analytics still works without any ad credentials.

## 2. Durable data and attribution

Add equivalent D1/PostgreSQL schemas and migrations through the existing migration workflow. Proposed entities:

| Entity | Purpose and constraints |
| --- | --- |
| `ad_connections` | Owner/provider authorization, encrypted tokens, granted scopes, expiry, status and connection generation |
| `site_ad_accounts` | Site-to-connection/account mapping, reporting currency/time zone, selected campaign scope and spend toggle |
| `ad_touches` | Site/visitor/touch/time, campaign dimensions, consent reference and protected match context; unique site/touch |
| `ad_consent_receipts` | Site/visitor consent changes and policy version with bounded retention |
| `ad_entities` | Provider/account/entity IDs, parent IDs and current display labels |
| `ad_daily_spend` | Provider/account/date/grain/entity totals, currency, time zone and sync provenance; idempotent natural key |
| `ad_sync_runs` | Cursor/checkpoint, lease, attempt status, freshness and sanitized error details |
| `ad_conversion_mappings` | Site/destination/purchase mapping, enabled state, activation time, counting mode and configuration version |
| `ad_conversion_deliveries` | Stable logical conversion/destination key, payload version, consent reference, lease, attempt count, next attempt, provider receipt and status |

Account-scoped spend is stored once per connection/account/grain, with site views applying explicit campaign scopes. If an account serves multiple sites, require disjoint campaign assignments for site ROAS or mark cost as shared/unallocated and suppress site ROAS. Do not duplicate an account's entire spend onto every website.

Extend payment snapshots and report dimensions with medium and stable ad IDs. Preserve existing finalized snapshots: old data is `not recorded`, never inferred from campaign names. New/pending snapshots may use retained context according to the captured attribution policy. Keep first-touch/last-non-direct semantics and the 72-hour reconciliation behavior documented; recognize eligible ad context when ranking a non-direct touch.

Internal revenue selects its configured winning touch. Export selects each destination's eligible evidence independently; do not suppress Meta export solely because Google won Yaap's local attribution. Preserve original click times for eligibility.

Define configurable, bounded retention for raw click/match context and consent receipts based on the verified provider windows. Export queues must not retain identifiers indefinitely. Payment snapshots may retain non-sensitive reporting dimensions after raw context expires. Site/payment deletion cancels related unsent work; cleanup preserves only required pending context within its hard retention deadline.

Acceptance: migration from populated old schemas, deterministic late/out-of-order touch handling, finalized snapshot stability, refunds, retention/deletion, shared-account allocation, numeric ID precision, D1/PostgreSQL/Hyperdrive parity.

## 3. Connection setup and secret lifecycle

Add `apps/web/src/server/ads/` with provider adapters and owner-protected connection services. Extend `apps/web/src/api.ts`, dashboard server functions, `apps/web/src/types.ts`, deployment/setup checks and documentation.

Proposed deployment configuration:

| Cloudflare configuration | Role |
| --- | --- |
| `GOOGLE_ADS_CLIENT_ID`, `GOOGLE_ADS_CLIENT_SECRET` | Installation's Google OAuth application |
| `GOOGLE_ADS_DEVELOPER_TOKEN` | Google Ads reporting access |
| `META_APP_ID`, `META_APP_SECRET` | Installation's Meta application |
| `ADS_TOKEN_ENCRYPTION_KEY` | Versioned encryption key for stored provider credentials/match data |
| Canonical application origin and pinned provider versions | Callback construction and adapter compatibility; non-secret configuration |

Store deployment secrets using Cloudflare secrets and local ignored development configuration. Store per-owner access/refresh tokens encrypted in the selected database. Client/app IDs need not be confidential, but client secrets and tokens must never appear in browser bundles, URLs outside the prescribed OAuth flow, logs, exports or API/MCP reports.

Use AES-GCM envelopes with key version and authenticated owner/provider/connection context. The existing payment helper is payment-specific: do not silently change its key derivation or make Stripe secrets unreadable. Document ad-key rotation, reconnect fallback, and restore dependencies.

Implement short-lived single-use OAuth state bound to owner session and requested provider; use PKCE where supported. Validate callbacks, prevent open redirects, handle denial and insufficient scopes, and persist only verified authorization. Namespace ad callbacks separately from existing public API/MCP OAuth endpoints. Serialize token refresh per connection; mark revoked/expired connections as requiring reconnection without endless retries.

The owner flow is: connect provider → select account and permitted campaign scope → enable spend → optionally select a conversion destination and configure purchase forwarding. Read access does not implicitly enable writes. Validate asset access on save and during use. Missing installation credentials show operator setup instructions; basic analytics startup and deployment remain unaffected.

Acceptance: OAuth replay/CSRF rejection, owner isolation, scope denial, concurrent refresh, expiry/revocation, reconnect to a different account, disconnect with queued work, secret redaction and a self-hosted setup rehearsal. A connection-generation change prevents old queued jobs from sending under a new account's credentials.

## 4. Spend synchronization and reporting

Implement bounded provider clients, normalized money parsing, resumable backfills and incremental refresh. Start with campaign/day grain; ad-level synchronization is an optional bounded follow-up within the same schema.

- Initial backfill: configurable range, default 30 days. Refresh the most recent 7 days daily, with manual bounded resync for older corrections. Persist cursor and run status, respect provider retry hints and enforce per-run budgets.
- Use exact decimal/integer conversion for spend, including Google's micros and currency-specific precision. Keep currencies separate. Never substitute missing data for zero or divide by zero.
- Preserve the provider's local report date and account time zone. Bucket Yaap outcomes into that same zone for comparable campaign reports. Do not relabel daily provider data as UTC. Until common reporting boundaries exist, compare one compatible account/time-zone group at a time; avoid blocking on the broader site-timezone roadmap feature.
- Define period ROAS as Yaap-attributed net revenue from payments in the selected period divided by spend in that period. Label it as period-based, not a same-click-cohort lifetime return. Refunds restate the original payment period consistently with Revenue.
- Initially show purchases, cost per purchase and ROAS. If signup/goal cost metrics are added, specify the count/denominator and its acquisition model separately; do not silently mix converted-session attribution with payment attribution.
- Keep platform-reported conversions/value separately labeled and optional. Joining is by provider/account/stable entity ID, not mutable names. Never sum campaign and ad grains together.

Build an Ads report plus website integration settings following existing dashboard patterns. Include connected/disconnected, syncing/stale, no spend, unmatched revenue, shared/unallocated account costs, error and partial-data states. Expose model/window, currency, reporting time zone and refresh time. Add ad filters to Revenue and visitor journeys without revealing raw click identifiers.

Acceptance: pagination, async provider reports where required, interrupted/resumed backfill, 429/5xx/token failures, repeated sync, campaign rename, DST boundaries, mixed currencies, zero spend, incomplete dates and shared accounts. Verify desktop/mobile and light/dark UI with synthetic data.

## 5. Purchase conversion delivery

Use payment acceptance as the trusted source; do not forward browser-declared purchase amounts. Add outbox creation to payment persistence using a transaction or an idempotent repairable sequence compatible with both backends. Extend `apps/web/src/server/payments.ts`, `apps/web/src/server.ts`, maintenance services and `apps/web/wrangler.jsonc`.

- Logical occurrence: one site/provider/payment-mode/external-payment-ID purchase. Destination uniqueness includes provider/account/conversion-action-or-dataset. Mapping edits/reconnects must not accidentally resend the same occurrence to the same destination.
- Default activation is prospective: only eligible payments at/after mapping activation. Never upload retained historical purchases simply because an integration was enabled. Historical export would require its own reviewed feature and eligibility preview.
- Map captured payment amount, currency and actual purchase time to the verified provider format. Normalize Stripe currency units deliberately, including its compatibility exceptions. Keep gross exported purchase value distinct from local net-revenue reports.
- Resolve match context promptly. Do not wait for local attribution finalization. Missing eligible context becomes a visible bounded waiting/skipped state; later metadata can repair it only within consent, retention and provider deadlines.
- Send Google conversions through the stage-0-verified Data Manager route and Meta purchases through CAPI. Record provider request IDs and diagnostics. HTTP acceptance is `accepted`, not proof of attribution or bidding use.
- Add dedicated `ADS_JOBS` and `ADS_JOBS_DLQ` bindings and queue-name dispatch so delivery failures never block the existing `EVENTS` consumer. Messages contain row/job references, not full match payloads. Claim DB work with leases and compare-and-set semantics; retries remain safe after a crash between provider acceptance and local acknowledgement.
- Implement exponential backoff with jitter, retry hints, attempt/time limits, permanent-error classification, DLQ visibility and explicit replay eligibility. Recheck enabled state, asset generation and known consent withdrawal immediately before sending. Scheduled repair re-enqueues outbox rows missed between commit and queue publication.
- Test payments use only supported validation/test flows, never ordinary live destinations. Synthetic tests are visibly separate.
- Require an existing-tracking selection in setup. Default to a single purchase producer. Where Pixel/tag events also send purchases, require the verified common event/transaction identity and platform-specific deduplication strategy. Do not assume Google deduplicates a GA4-imported action against a separate direct-import action.
- Stage 0 determines adjustment support. Implement documented corrections where supported. Otherwise keep refund changes local and explicitly label exported value as unadjusted gross value; do not send negative purchases or claim refund-adjusted platform ROAS.

Acceptance: duplicate/concurrent payments, cumulative refunds, out-of-order metadata, missing consent, withdrawal before dispatch, amount/currency accuracy, provider timeout after acceptance, worker restart, expired eligibility, mapping edits and token revocation. No duplicate logical conversion under replay. Record a controlled test/validation receipt and platform diagnostics per provider before enabling that connector for production use.

## 6. Operations, documentation and rollout

- Document provider application creation, required review/access, exact callback URLs, Cloudflare configuration, self-hosted renewal/rotation, ad URL setup, consent-manager wiring, checkout linkage, currency/time-zone semantics and tag coexistence.
- Add status for sync age, last successful delivery, waiting/skipped/permanent failure counts, reconnect needs and sanitized provider diagnostics. Owner actions: pause spend, pause forwarding, disconnect, bounded resync and eligible delivery retry.
- Use independent spend/forwarding feature flags. Attribution works first; spend follows; forwarding is enabled only after provider-specific verification. Disabling ads must not stop analytics or payments.
- Extend retention/export/restore documentation: secrets excluded from portable reports; full encrypted backups require keys; restore starts forwarding paused to prevent accidental replay.
- Verify ad queue provisioning and optional secret handling in deployment scripts. Do not make default analytics deployments require ad resources until the feature is configured; document whether provisioning uses an optional config overlay or setup-script generation before implementing it.
- Publish known limits: missing identifiers, unsupported ad formats/macros, cross-device gaps, independent platform attribution, gross/net differences and unavailable permissions. Do not promise a specific match rate.

Acceptance: isolated upgrade and restore rehearsal, disconnected-provider operation, queue repair/DLQ replay, operator setup from the written guide, and connector-specific live verification log. Production deployment and real conversion transmission are subsequent operational actions, not part of writing this plan.

## Verification and implementation checkpoints

Use focused tracker, database and provider-adapter fixtures during each stage. Before merging behavior changes, run the appropriate existing `npm run check`, `npm run test:postgres` and `npm run test:hyperdrive` checks. Add meaningful tests for authorization, attribution, monetary correctness, resumability and duplicate delivery. UI stages require responsive visual verification. Documentation-only planning does not require application tests.

Suggested reviewable checkpoints, in dependency order:

1. Provider contract notes and deployment configuration specification.
2. Consent/context collection with compatible schemas and tracker tests.
3. Payment attribution dimensions and internal ad reports.
4. Encrypted credentials, Google connection and account selection.
5. Meta connection and account selection.
6. Spend adapters, resumable jobs and report UI.
7. Shared delivery outbox, lifecycle and operational controls.
8. Google purchase forwarding and diagnostics.
9. Meta purchase forwarding and diagnostics.
10. Self-hosted setup, restore/rotation guide and release verification.

All checkpoints are currently pending. No migrations, application changes, provider connections or deployments were performed when preparing this plan.
