# Hosted pricing and Polar billing implementation plan

2026-09-13. Implementation is in progress. Six products are provisioned independently in both Polar sandbox and production, and the private production catalog plus signed webhook are wired into the live Worker. A successful paid production activation is still outstanding. This turns the pricing, website-sharing and limit-triggered upgrade discussion into a delivery plan and records completed slices.

## Intended outcome

An account owner starts a card-free trial, subscribes to an event-volume tier, sees usage pooled across unlimited websites, and upgrades inside Yaap when more capacity is needed. Polar collects payment; Yaap applies the verified entitlement change without resetting consumed usage. Viewers can use the sites shared with them but cannot approve charges or access billing.

Use the existing lightweight `workspaces` identity as the account/billing boundary. Shared hosting uses one application/database deployment across customers; adding a customer or website does not provision a database. Self-hosted installations retain their existing behavior without Polar.

This plan is the execution reference for [billing scope](HOSTED_BILLING_SCOPE.md) and the [product catalog](HOSTED_POLAR_CATALOG.md). The [website-sharing feature](WEBSITE_SHARING_FEATURE.md) owns account identity and site permissions; do not implement a second account model. Pricing economics and capacity assumptions remain in [the infrastructure model](HOSTED_INFRASTRUCTURE_COSTS.md).

## Implementation progress

Started 2026-09-12.

- Stage 0 foundation is complete in code: `YAAP_HOSTING_MODE` defaults to `self_hosted`; hosted mode validates its environment, secrets and exact six-product UUID allowlist before any request, queue batch or scheduled job can run. The provider boundary pins `@polar-sh/sdk` 0.49.0 with SDK retries disabled, and a Worker-style browser bundle smoke test guards compatibility. Ordinary tests inject a deterministic fake provider and make no Polar calls; the separately provisioned sandbox mapping is recorded in the [Polar catalog](HOSTED_POLAR_CATALOG.md#provisioned-sandbox-mapping).
- Current Polar v1 capabilities were checked against the provider documentation. Checkout supports immutable workspace binding through `external_customer_id`, explicit trial disabling and bounded return URLs. Subscription changes support immediate `invoice` upgrades and `next_period` downgrades. The documented APIs do not expose a charge-preview or general mutation-idempotency contract, so Yaap will keep the planned local estimate label, durable operation ledger and read-after-timeout reconciliation. Open checkout sessions can be found by external customer and updated to another allowlisted product; their expiry cannot be shortened through the documented update fields, so Stage 3 must reuse one current open session and reject stale operation links locally.
- Stage 1 is complete: the immutable v1 catalog, pure entitlement resolver, owner-only `GET /api/billing` read, and eight durable billing tables now exist with D1/Postgres migrations. Self-hosted reads expose no billing controls or catalog and do not touch Polar. Billing UI remains Stage 5 work.
- Stage 2 backend accounting is complete: hosted owner signup requires email verification and starts one 14-day/100k local trial exactly once; invited viewers cannot start one. The trial now has a 10% event buffer and a three-day post-trial collection grace. Hosted ingestion resolves the stored workspace, reserves shared capacity with a deduplicated durable receipt/outbox, and persists the event plus period/site usage in one database transaction. D1 and PostgreSQL triggers enforce the ceiling and receipt transition invariants. A queue publish failure remains recoverable, a one-minute bounded repair job does not run hourly analytics cleanup, and the 30-day replay horizon expires leaked reservations before deleting terminal payload receipts. Presence is also disabled while collection is paused. The tracker receives HTTP 409 with `{ accepted: false, reason: "collection_paused", retryable: false }` and does not retry it. Threshold crossings create revision-aware, durable 80%/100%/ceiling notification jobs.
- Stage 3 backend is complete in code: owner-only checkout, reconciliation and portal routes use the immutable workspace as Polar's external customer ID and accept only internal plan keys. Checkout explicitly resolves or creates a workspace-scoped team customer before purchase, preventing Polar's organization-wide email matching from attaching another product's customer; ambiguous customer creation is read back before retry. The operation ledger and partial unique indexes serialize one open checkout per workspace; ambiguous responses become recoverable instead of triggering a second create, and a newer plan request updates the same open provider session. Signed raw-body webhooks are durably deduplicated before a 2xx response and use their payload only to trigger an authoritative subscription fetch. Revision-guarded reconciliation rejects wrong customers, unknown products/statuses and parallel subscriptions, then creates a separate paid usage period without moving trial counts. The success return grants nothing by itself. Webhook and operation recovery run in bounded one-minute jobs. The six sandbox products and six private production products are provisioned and validated with environment-specific mappings. The production webhook and live Worker allowlist are configured; a successful end-to-end production activation remains an explicit external verification step.
- The first Stage 5 Billing experience slice is complete: owners can open `/app/billing` from the Websites page or account menu, review service state, plan, period, pooled usage, processing reservations and per-site usage, choose an initial plan, resume checkout, and open the hosted customer portal. Checkout and portal returns now land on Billing; pending activation performs bounded authoritative reconciliation and never trusts the return URL as proof of payment. The page has responsive plan selection plus explicit self-hosted, cancelled, pending, delayed, empty and error states. Usage buffer and trial-grace notices are visible in-app and delivered through the durable email job ledger. Existing subscribers remain read-only in the plan selector until Stage 4 implements Yaap-controlled upgrade/downgrade timing. Viewer collection-pause messaging and browser verification against a hosted sandbox remain Stage 5 work.
- Validation on 2026-09-12: `npm test` passed 83 tests with 3 expected PostgreSQL-only skips; `npm run test:postgres` passed 59/59; the production build, typecheck, formatting and deployment checks passed. Fresh PostgreSQL migration runs applied through `0014_billing_trial_grace.sql`; the D1 suite applied through `0026_billing_trial_grace.sql`. Tests cover trial idempotency, three-day grace boundaries, owner/operator notification dedupe and delivery, viewer exclusion, last-slot reservation races, unauthorized raw receipt writes, exact-once period/site totals, threshold dedupe, ambiguous publish recovery, quota pause, checkout double-click/two-tab serialization, lost provider responses, signed webhook replay, owner-only portal access, authoritative activation and self-hosted compatibility.

## Commercial configuration

| Plan key               | Monthly USD | Tracked events per period | Paid admission ceiling with 10% grace |
| ---------------------- | ----------- | ------------------------- | ------------------------------------- |
| hosted_100k_monthly_v1 | $9          | 100,000                   | 110,000                               |
| hosted_500k_monthly_v1 | $19         | 500,000                   | 550,000                               |
| hosted_1m_monthly_v1   | $29         | 1,000,000                 | 1,100,000                             |
| hosted_2m_monthly_v1   | $49         | 2,000,000                 | 2,200,000                             |
| hosted_5m_monthly_v1   | $99         | 5,000,000                 | 5,500,000                             |
| hosted_10m_monthly_v1  | $149        | 10,000,000                | 11,000,000                            |

All prices are before applicable tax. Above 10M: contact us. One feature set includes traffic/realtime analytics, custom events/properties, goals, funnels, journeys, revenue attribution through shipped integrations, API/MCP access under resource limits, standard email support and the proposed two-year analytics history. Site viewers are included without seat charges when sharing ships. Higher tiers remain unavailable until capacity checks pass.

Launch monthly-only, fixed price, quantity one. No automatic paid overages, annual billing, seat billing, credits/top-ups, feature add-ons or percentage of customers' revenue. Trial: 14 days from verified owner-account activation, 100k events total, no additional 10% trial buffer, no card. Invited viewers do not start trials. Upgrading from trial starts a separate paid period and ends the trial.

Customer-event definition: a pageview or custom event successfully stored in the analytics event table counts once, including its validated properties. Rejected/excluded traffic, bots, duplicate deliveries, presence heartbeats and payment records do not count. They still require independent resource limits. Billing history survives site deletion and analytics retention.

The 10% grace policy is the implementation baseline from the catalog discussion: warn at 80%/100%, stop admitting new events at the grace ceiling, leave retained reports/Billing accessible, and resume on verified upgrade or a newly authorized period. Disclose permanent loss of events sent while collection is paused. The trial/history/policy copy must match actual behavior before production sale.

## Current working-tree baseline

Re-read git status and these files before implementation. Website sharing and email changes are actively in progress, not necessarily committed or complete.

- Both analytics schemas now contain `workspaces` and `sites.workspace_id`; sharing migrations are being added. [Access helpers](../apps/web/src/server/access.ts) expose `requireAccountOwner`, `requireSiteView` and `requireSiteManage`; [services](../apps/web/src/server/services.ts) expose `requireUser` and use workspace-aware ownership initialization. Reuse the final versions after that work settles.
- [Ingestion](../apps/web/src/ingest.ts) sends one event per queue message. `consume()` inserts the event, then separately records operational counts. These counters are not a transactional billing ledger.
- [Worker configuration](../apps/web/wrangler.jsonc) has the event/DLQ bindings, a single consumer with 25-message batches, and an hourly cron. Billing recovery jobs need timely scheduling; do not run all analytics cleanup every minute to achieve this.
- [Worker entry](../apps/web/src/server.ts), [routes](../apps/web/src/api.ts), [database store](../apps/web/src/db/store.ts) and [types](../apps/web/src/types.ts) are extension points. The backend supports D1 and Postgres with separate migrations.
- Email sending, email templates and associated tests are being added. Reuse [outbound email](EMAIL.md); do not introduce a second delivery provider.
- Existing `payments` tables and `/payments/...` routes track sales on customer websites. Subscription billing uses a separate `billing_*` domain and `/api/billing/...` routes.

No Polar dependency or billing model was present at inspection. Do not overwrite unrelated schema, migration journal, email, layout, package or lockfile changes.

## Architecture and boundaries

Implement a small server-only billing module with a provider adapter, state reconciler, entitlement resolver, usage service and owner-only actions. Suggested files live under `apps/web/src/server/billing/`; pure versioned plan definitions may live under `src/lib/billing-plans.ts`. Adapt paths to the current repository rather than introducing a separate service.

Use a server-only deployment mode such as `YAAP_HOSTING_MODE=self_hosted|hosted`, defaulting to self-hosted. Hosted mode requires valid billing configuration and must fail closed on missing configuration; a missing secret cannot silently turn a paid deployment into free self-hosting. Browser inputs, cookies and query parameters never select mode. Self-hosted mode does not initialize Polar, start hosted trials or apply subscription quotas.

Suggested server configuration: `POLAR_ENVIRONMENT=sandbox|production`, `POLAR_ACCESS_TOKEN`, `POLAR_WEBHOOK_SECRET`, and a deployment-specific allowlist mapping internal plan keys to Polar product IDs. Validate API environment, currency, interval and mappings at startup/build validation where appropriate. Secrets never appear in client bundles, logs or public configuration. Pin and test the SDK/API version; verify the chosen SDK works in Workers before wiring business logic.

Use the actual workspace owner check on every billing read/mutation. API keys, OAuth tokens and site-viewer sessions cannot open billing or initiate changes. State-changing session routes retain same-origin/CSRF checks. Request DTOs accept internal plan keys and operation IDs, not arbitrary Polar product/customer/subscription IDs, prices or allowances.

## Persistent records

Use the existing provider abstraction; add equivalent D1 and Postgres schemas, constraints and forward migrations. Names below are proposed logical records, not a mandate for one table per concern if an existing durable job facility fits.

| Record                      | Required purpose/invariants                                                                                                                                                                                                                                                                 |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `billing_accounts`          | One row/workspace; environment, Polar customer mapping, trial start/end, lifecycle policy version. Unique `(environment,polar_customer_id)`. Do not duplicate `workspaces` ownership.                                                                                                       |
| `billing_subscriptions`     | Provider subscription ID, workspace, product/plan version, provider status, paid-through/period boundaries, scheduled cancellation, pending plan change, last reconciled revision/time. Retain historical subscriptions; enforce at most one nonterminal hosted subscription per workspace. |
| `billing_usage_periods`     | Stable period ID; workspace, trial/subscription source, immutable start/end, allowance/ceiling, persisted count, reserved count, notification markers. Unique period identity. Upgrade changes limits, never the period key or existing counts.                                             |
| `billing_usage_sites`       | Period/site totals for Billing; retain a minimal deleted-site label/identifier instead of cascading away charged usage.                                                                                                                                                                     |
| `billing_event_receipts`    | Deduplicated `(workspace_id,site_id,event_id)` admission, immutable ingress time/period, reservation state, terminal outcome and replay deadline. Can also hold the short-lived publish-outbox payload/status.                                                                              |
| `billing_operations`        | Owner checkout/upgrade/downgrade attempts, request fingerprint, expected subscription revision, selected plan, result/provider references, pending/unknown/complete/failed state. Unique workspace operation key; reused key with different input is rejected.                              |
| `billing_webhook_receipts`  | Unique `(environment,event_id)`, verified event type/subject, received time, processing state, attempts, retry time, bounded error detail. Durable before returning success.                                                                                                                |
| `billing_notification_jobs` | Durable threshold/trial notices and dedupe keys; delivery state, attempts and provider message ID. Reuse a suitable existing outbox if present.                                                                                                                                             |

Store provider status separately from effective Yaap permissions. Do not use one `isPaid` boolean. Store internal plan/policy versions so editing prices or the public catalog does not rewrite existing subscribers' entitlements.

Short-lived event receipts/outbox data incur real storage and writes. Use a bounded replay policy and expire terminal receipts after that horizon; retain aggregate billing periods separately. Never keep a second full indexed event history indefinitely by accident. Choose and test a concrete replay horizon in Stage 2 against event queue, DLQ and operational replay behavior; default design target is 30 days of dedupe evidence with automatic replay restricted to that window. Older DLQ replays require explicit recovery handling and cannot silently become fresh billable events. Existing raw rows still deduplicate replay while retained.

## Entitlements and lifecycle

Derive `canCollect`, `canReadRetainedReports`, `canManageAnalytics`, `canManageBilling`, `collectionPauseReason`, plan, allowance, period and next action from verified local state. Membership checks still apply independently. Viewing someone else's website never uses the viewer's own billing account.

| State                                                 | Collection                                                                         | Other behavior                                                                                                       |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Active trial and trial grace                          | Through the three-day post-trial deadline and 110k admission ceiling               | All core features; owner can buy.                                                                                    |
| Checkout pending                                      | Existing valid trial/paid entitlement only                                         | Show processing/recovery; checkout redirect grants nothing.                                                          |
| Paid active                                           | Within current period's ceiling                                                    | Normal paid access.                                                                                                  |
| 100–110% paid usage                                   | Continue while reservations fit                                                    | Grace banner and upgrade action.                                                                                     |
| Ceiling reached                                       | Pause new admissions                                                               | Preserve reports and billing; viewers see contact-owner messaging.                                                   |
| Cancellation scheduled                                | Current paid period remains valid                                                  | Show access-end date; no immediate data deletion.                                                                    |
| Failed renewal / past due                             | Proposed seven-day payment grace, within a verified renewal period and its ceiling | Owner gets payment-recovery action; repeat failures do not extend grace.                                             |
| Trial expired, unpaid after grace, subscription ended | Pause new admissions and analytics mutations                                       | Keep owner login/Billing, time-bounded retained-report/export recovery.                                              |
| Provider unavailable                                  | Honor already confirmed local access through its known expiry                      | Do not invent a successful purchase, extend paid-through indefinitely or reset allowance merely because time passed. |
| Refund/dispute                                        | Reconcile provider state and any explicit operator revocation                      | A partial refund alone does not imply cancellation or erase usage.                                                   |

Suggested lifecycle defaults requiring review before production publication: seven-day failed-renewal grace; 30-day read/export recovery after service ends, then cleanup under the published deletion policy. Implement as versioned configuration and test the boundaries. These were not previously settled commercial terms. Reactivation before cleanup may restore retained history but must not promise recovery after deletion. This plan does not claim legal retention requirements for billing records; keep those separate from analytics deletion.

A provider outage spanning a period boundary must trigger urgent reconciliation; without verified authorization for the next period, do not grant a fresh paid allowance. Keep login, billing recovery and retained reads available under the configured lifecycle. Distinguish this condition from quota exhaustion in the UI and telemetry.

## Atomic usage and queue handling

Baseline design: durable admission reservations plus transactional event accounting. A reservation is processing capacity, not yet a charged event.

1. Validate and filter the incoming event first. Resolve its site/workspace from stored records; never accept a caller-supplied workspace or billing period. Stamp server ingress time once. Route heartbeats separately; apply service-state/resource limits even though they consume no event allowance.
2. Resolve the entitled period using `[start,end)` UTC instants. Replayed requests use their original receipt and period. Look up deduplication before reserving more capacity. A duplicate cannot gain a second reservation by arriving after an upgrade or renewal.
3. Atomically create the receipt/publish-outbox entry and conditionally increment the period's reserved count only if `persisted + reserved < admissionCeiling`. Enforce the same invariant across all sites in the workspace. Atomically undo/no-op a losing duplicate race. PostgreSQL transaction and D1 atomic-batch implementations must both prove rollback and conditional-write correctness.
4. Publish a trusted message containing the receipt reference through the existing queue, with a durable retryable outbox for the database-to-queue gap. Immediate publishing reduces latency; a bounded scheduled worker repairs crashes/ambiguous sends. Duplicate publishing is safe. Do not rely solely on `waitUntil()` or refund a reservation while an ambiguously published message may still persist.
5. Consumer validates the receipt and atomically inserts the analytics event, changes receipt state, increments period/site persisted totals exactly once and releases the reservation. Ack after commit. Existing inserted events or already completed receipts must not increment again. Adapt `insertEvent`/executor boundaries so operational counters are not mistaken for the billing transaction.
6. Permanent rejection, deleted site, expired payload or abandoned delivery releases the reservation exactly once and records a terminal reason. Terminal messages cannot later write after capacity has been released. DLQ recovery must atomically reacquire any released admission or use a documented operator exception. No permanent reservation leakage.
7. Once admitted, a valid queued event belongs to its original period even if processed after renewal, cancellation or a trial-to-paid conversion. Account/site deletion can still invalidate it. Do not bill old-period backlog against the new allowance or drop admitted events solely because the new period uses a lower plan.

At the admission ceiling, return a documented non-retryable application result to the tracker so it does not aggressively retry a billing pause. Select the exact HTTP/result contract during Stage 2 and update the tracker tests; never return a false storage-success claim. Display persisted usage, processing reservations and pause status clearly in Billing. Notifications may consider admission pressure, but distinguish it from completed usage.

Use no Polar network calls on event ingestion or report reads. Hosted limits must also cover alternate event-write paths, imports, background jobs and public APIs. Imports/backfills cannot silently bypass quotas: either count them through a separately specified metering contract or disable hosted import routes until supported. Operational metrics remain separate.

## Polar catalog, checkout and synchronization

Create six monthly fixed-price USD products matching the catalog, with no native trial, meter, seat pricing or automated benefits requirement. Save actual sandbox IDs separately from production IDs. Verify customer uniqueness/multiple-subscription settings and enforce the invariant in Yaap too. See [products](https://polar.sh/docs/features/products) and [trial behavior](https://polar.sh/docs/features/subscriptions/trials).

Owner signup/account creation starts the local trial after email verification. Complete hosted signup/recovery and account provisioning without globally relaxing the self-hosted bootstrap path. Accepting an invitation never creates a Polar customer or trial.

Checkout action reuses/creates the customer mapped to the immutable workspace external ID, checks for an existing subscription or checkout operation, and creates a server-bound checkout. Reuse an active checkout when suitable. When the plan changes, invalidate/expire the prior checkout using supported provider behavior before replacing it; ensure two old checkout links cannot purchase parallel subscriptions. Validate success/cancel URLs against the app origin. Initial checkout failures/cancellation leave trial state intact until its original expiry.

Persist remote-mutation operation state before calling Polar. Verify actual API idempotency support in the pinned version; do not assume an arbitrary idempotency header works. On timeout, reconcile existing customer/checkout/subscription state before retrying a potentially successful purchase/change. Never issue a second charge because the first response was lost.

The return page shows activation pending and polls a server-authorized billing read/reconciliation endpoint with bounded retry. A server-verified API result may activate immediately; webhook reconciliation then converges to the same state. A forged URL, unknown product, wrong customer or wrong environment cannot grant access.

Webhook route: `/api/billing/webhooks/polar`, matched before session-authenticated API routes. Verify the original request bytes and signature/timestamp with the supported verifier, then persist a unique receipt. Return 2xx only after durable acceptance. Queue/durable retries process it; hourly-only reconciliation is insufficient for interactive activation. Monitor pending receipts and use a dedicated frequent, bounded recovery schedule. [Webhook handling](https://polar.sh/docs/integrate/webhooks/delivery).

Subscribe to the current version's customer-state, subscription and payment/order events needed for activation, change, renewal, failure and refund handling. Fetch authoritative subscription/customer/order state as needed; treat event payloads as triggers rather than unconditionally applying them in delivery order. Serialize reconciliation per workspace with a lease/revision check so a slow older read cannot overwrite newer state. Do not hold a database transaction open during network I/O. Unknown products/statuses trigger an operator-visible unresolved state, not guessed entitlements.

Maintain a reconciliation sweep for missed webhooks and period boundaries with pagination, backoff and bounded work per run. Persist provider and local revision times; expose stale/pending state without returning raw provider payloads or secrets to viewers.

## Limit-triggered upgrade

Owner sees an Upgrade action at 80%, at 100% and when collection is paused. Recommend the next tier that exceeds current admitted usage; allow selecting any enabled higher tier. A viewer sees only a contact-owner message.

Required confirmation fields: current/new plan, current usage and processing count, new total allowance, remaining capacity, estimated or authoritative charge today, taxes/discounts where available, next full renewal amount/date, immediate effective timing and whether it clears a pending downgrade. Do not label a locally calculated estimate as an exact tax-inclusive invoice.

Example with exactly half a period left: $29/1M → $49/2M gives an illustrative $10 pre-tax difference. `1M / 1M` becomes `1M / 2M`; remaining regular allowance is 1M, the renewal date stays the same, and the next renewal costs $49. The new ceiling is 2.2M including grace. Upgrading after some grace usage retains that usage too.

Execution:

1. Owner requests a short-lived preview bound to workspace, subscription, current plan/period revision and target plan. Verify the pinned Polar API's preview capabilities. If only an estimate is available, disclose it, account for currency/discount/tax inputs and obtain confirmation for the actual billing semantics; do not fabricate a preview endpoint.
2. Owner confirms an operation key. Revalidate ownership, subscription revision and enabled target. If a period rollover, price change, cancellation or other material change makes the preview stale, return a refreshed confirmation before charging.
3. Update the existing subscription with the mapped product and `proration_behavior=invoice`. Do not create a second checkout/subscription or use a cycle-reset behavior.
4. On success, reconcile authoritative payment/subscription state and atomically apply the new plan/ceiling to the current usage period. Preserve its counts and boundaries. Invalidate local entitlement caches; paused collection resumes when there is available admission capacity.
5. On payment failure, preserve the old plan/allowance and show recovery via Polar's hosted portal. On timeout/unknown result, show processing and reconcile; never grant guessed capacity or repeat the charge blindly.

Polar documents immediate prorated upgrades, failed-payment behavior and next-period changes. [Proration](https://polar.sh/docs/features/subscriptions/proration), [update subscription](https://polar.sh/docs/api-reference/subscriptions/update). The numeric example is illustrative; provider proration uses precise remaining time. Granting the full new ceiling for a late-period prorated upgrade is the chosen UX; monitor its economics, especially repeated upgrade/downgrade patterns, rather than assuming every extra event earns a full month's price difference.

## Downgrades, cancellation and Billing UI

Downgrade updates use `proration_behavior=next_period`. Keep the old paid terms through renewal; show the pending plan/date. Replacement/cancellation of pending changes must be reconciled. An immediate upgrade superseding a scheduled downgrade must disclose and reflect that change.

Cancellation normally happens in Polar's hosted portal at period end. Keep paid access until the confirmed boundary. Re-subscription after termination must reuse customer identity and create new verified period state without resetting old billing evidence or restarting the trial.

Billing UI is account-level, owner-only, and contains current plan/status, monthly price, usage and processing totals, shared/per-site breakdown (including deleted-site usage), period dates, pending changes, warnings, upgrade/downgrade actions and Manage billing. Loading, payment failure, stale sync, processing, expired trial and quota pause are distinct states. A shared website does not appear in the viewer's own bill.

Generate owner-authenticated portal sessions server-side. Use the hosted portal for invoices, payment details and cancellation. Disable portal plan switching initially so Yaap can apply different upgrade/downgrade timing and previews; disable self-service pause until explicitly supported. [Portal settings](https://polar.sh/docs/features/customer-portal/settings).

Yaap sends trial/usage notices to the account owner through the existing email infrastructure, with durable dedupe keyed by workspace, period, threshold and entitlement revision as appropriate. A hosted operator address (`BILLING_ALERT_EMAIL`) receives a one-time trial-ended notice. The one-minute repair job discovers trial ending/ended/grace-ended boundaries and retries failed delivery with a bounded backoff. Polar owns billing receipts/recovery emails. Deduplicate renewals and repeated webhook deliveries; do not spam at every event over a threshold. Display in-app notices even if email delivery fails.

## Delivery stages and completion criteria

| Stage                        | Work                                                                                                                                                          | Complete when                                                                                                                                      |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0. Reconcile foundations     | Inspect current sharing/email work, select pinned Polar API/SDK, confirm hosted mode, owner provisioning and operation/preview capabilities.                  | One account ID is reused; self-hosted behavior and dependency boundaries are documented; no conflicting schema migration is introduced.            |
| 1. Catalog and billing model | Versioned six-plan catalog, environment/product mapping, billing schema/migrations, pure entitlement/state transitions and owner-only Billing read.           | Both databases migrate fresh/existing fixtures; self-hosted requires no Polar; guest/viewer billing access is denied; plan snapshots cannot drift. |
| 2. Usage and local trial     | Verified-account trial, periods, durable reservation/outbox accounting, queue consumer transaction, replay policy, warnings and quota pause.                  | Concurrent events cannot exceed admission capacity or double count; crash/retry/replay tests pass; trial and paid periods stay separate.           |
| 3. Polar sandbox purchase    | Sandbox products, provider adapter, bound checkout, verified webhook inbox/reconciliation, pending activation and portal sessions.                            | Successful sandbox purchase activates exactly its workspace; failed/duplicate/timed-out operations converge without parallel subscriptions.        |
| 4. Upgrades and lifecycle    | Preview/confirmation UI, immediate prorated updates, retained usage, failed-charge recovery, scheduled downgrades, cancellation and renewal.                  | The 1M→2M example and all boundary/race scenarios pass; collection resumes only after verified entitlement update.                                 |
| 5. Billing experience        | Pricing selector, owner usage breakdown, viewer messaging, email templates/outbox, mobile and empty/error states.                                             | Copy matches the catalog and actual lifecycle; no owner-only control or data leaks to viewers.                                                     |
| 6. Operations and release    | Reconciliation dashboards/alerts, receipt cleanup, support overrides, measured queue/report/ledger capacity, retention/export gates and production checklist. | Supported tiers pass capacity tests, pending work is observable/recoverable, and all public promises have verified behavior.                       |

Keep these as reviewable implementation slices. Do not defer basic ledger correctness until after checkout, and do not treat sandbox success as production deployment verification.

## Required tests

Use local disposable D1/Postgres fixtures, fake email and a deterministic mocked Polar adapter for ordinary tests. Add sandbox contract tests separately; no real charges or messages in the normal suite.

- Owner A, Owner B and a viewer: only the actual workspace owner can read billing, open a portal, preview or execute a change. Guessed workspace/provider IDs, API/MCP tokens and forged return URLs fail.
- Self-hosted with no billing secrets preserves setup, collection and reports. Hosted with invalid environment/product mapping does not fail open. Sandbox events cannot activate production.
- Trial starts once after owner activation, not guest signup or invitation acceptance. Expiry/100k cap work, early purchase ends the trial, and retained trial events never move into paid usage.
- Duplicate event/queue delivery, transaction rollback, crash after outbox commit, ambiguous publish, crash after event insert, DLQ/replay and receipt expiry cannot double count or leak reservations. Metadata/property count does not affect units.
- Many sites concurrently reserve the last slots in one workspace. Persisted + reserved stays within the ceiling; other accounts are unaffected. Site deletion and raw retention preserve period totals.
- Events on each side of a UTC period boundary, delayed old-period queues, renewal failure/recovery, late webhook and pending downgrade create exactly the intended period/allowance. Do not silently pool annual or calendar-month allowances.
- Double-click checkout, two tabs, old checkout links, lost HTTP responses and reordered provider responses do not create multiple subscriptions or duplicate charges. Invalid/stale webhook signatures fail; receipt replay is idempotent.
- Half-period $29→$49 upgrade illustrates the $10 difference; exact quote/estimate labeling is correct. Failed payment keeps old entitlements, timeout shows pending, confirmed success preserves usage and clears quota pause. Test near-renewal, already-in-grace, newer catalog version, discount/tax inputs and simultaneous scheduled changes.
- Downgrade affects renewal only; cancel/resubscribe preserves history and billing evidence. Grace deadlines are not extended by repeated failures. Partial refunds and full revocations produce their distinct effects.
- Threshold notices are durable/deduplicated; email failure does not disable Billing. Portal links and payment metadata never leak to viewers.
- Aggregate accounting is repairable from retained receipts/evidence within its documented horizon; reconciliation cannot regress a newer plan/period. Operator overrides are audited, limited in duration/allowance and cannot silently charge a customer.

Run from `apps/web`: `rtk npm run check`, `rtk npm run test:postgres`, and `rtk npm run test:hyperdrive` as the affected layers are completed. Add new billing tests to the explicit Postgres/Hyperdrive script lists. Follow [database guidance](DATABASES.md); do not edit applied migrations. Browser verification covers owner upgrade/failed payment, viewer denial, return-page pending activation and mobile Billing.

## Launch gates and deferred decisions

The implementation can begin with the listed defaults. Before public sale, verify:

- The chosen single-node ARM configuration and revised ingestion/receipt writes meet peak traffic, maintenance and report workloads. Model average utilization separately from full-allowance stress; no assumption that all accounts average 25%.
- Two-year analytics history actually works across promised reports. Existing retention/rollup behavior and report range caps need an explicit retention verification task. A 90-day hot store/R2 archive is not included in this billing implementation.
- An authenticated export/recovery path and the post-cancellation cleanup policy exist before promising them. Data lifecycle changes are separate acceptance gates, not achieved merely by a subscription record.
- Hosted owner signup, verification/recovery and billing permissions are ready. Website sharing ships before viewer invitations are advertised; unfinished sharing does not authorize skipping account isolation.
- Seller onboarding, configured taxes, sender setup, supported product IDs, webhook delivery, failed-payment handling and operator recovery have been verified in the intended environment. Keep purchase/change actions disabled for unverified tiers.

Production product creation, deployments, real invitations/emails and actual charges are separate execution steps. This planning task authorizes none of them. Updating the Cork moodboard is also outside this document task.

## New-session starting prompt

> Implement `docs/HOSTED_BILLING_IMPLEMENTATION_PLAN.md` in its delivery stages. Read current repository instructions and git status first; preserve the website-sharing, email and other work already in progress. Reuse the existing workspace/account identity and owner authorization. Implement the versioned monthly catalog, durable usage/trial accounting, Polar sandbox checkout and reconciliation, then immediate prorated upgrades with no usage reset, scheduled downgrades and Billing UI. Maintain D1/Postgres parity and self-hosted behavior. Use mocked email/Polar in ordinary tests; keep production provisioning, deployment, real sends and live charges out of scope. Update this plan with completed stages, validation evidence and remaining launch gates.
