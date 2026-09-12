# Hosted billing scope — Polar

Draft, 2026-09-11. This proposes billing for the first-party hosted version of Yaap. It is not implemented. Confirmed direction: customers may add unlimited websites, with one event allowance shared across their account. Prices, allowance sizes and lifecycle policies below remain proposals for discussion.

Execution handoff: [Hosted billing implementation plan](HOSTED_BILLING_IMPLEMENTATION_PLAN.md). It supersedes older open-ended alternatives below with a concrete catalog baseline, quota/queue design and the agreed immediate prorated upgrade flow; newly suggested lifecycle defaults are explicitly marked for review before publication.

The [2026-09-12 Polar catalog proposal](HOSTED_POLAR_CATALOG.md) supplies the latest concrete packaging and provider configuration: six monthly event tiers, shared features, two-year history target, a local card-free trial and a proposed bounded overage policy. Its specific proposals take precedence over older open-ended alternatives below; none have been provisioned or implemented.

The [website sharing feature](WEBSITE_SHARING_FEATURE.md) scopes the account prerequisite and site-specific Viewer invitations. Use the same lightweight workspace ID for ownership and billing. Invited viewers do not receive their own paid account or workspace-wide access; there is no seat charge. This remains planned work.

## Recommendation

Use Polar for hosted checkout, recurring charges and customer billing management. Start with one subscription per account/workspace, unlimited websites, and an included monthly event allowance pooled across all those sites. Adding a website does not change the bill or allocate a separate allowance. Keep subscription entitlements and usage enforcement in Yaap.

Polar acts as merchant of record and handles transaction sales taxes. Its hosted customer portal supports invoices, payment-method updates and cancellation, with optional plan changes. These remove substantial payment infrastructure work. [Merchant of record](https://polar.sh/docs/merchant-of-record/introduction), [customer portal](https://polar.sh/docs/features/customer-portal/introduction).

Polar's published Starter rate is currently 5% + $0.50 per transaction, with an additional 1.5% for non-US cards; payout fees also apply. Model these costs alongside ingestion, storage and query costs before setting Yaap prices. [Current fees](https://polar.sh/docs/merchant-of-record/fees).

## Existing product and prerequisites

The current [product scope](SCOPE.md) and [roadmap](ROADMAP.md) describe a self-hosted, single-owner installation. Public signup is disabled in `apps/web/src/auth/options.ts`; sites belong directly to users in both analytics schemas. `apps/web/src/server/access.ts` checks site ownership. There is no hosted billing model yet.

Hosted launch needs an explicit tenant boundary and signup/recovery flow. Proposed default: one owner and one workspace per customer initially, with unlimited websites sharing its subscription. Introduce a stable workspace ID for billing without requiring teams in this release. Decide whether hosting uses shared infrastructure or separately provisioned installations before implementing tenant access and provisioning; both need the billing-to-workspace mapping.

For shared hosting, scope every dashboard, API/MCP, token, export and background operation to the correct workspace. Collection resolves the workspace from the stored site, never from a caller-supplied billing identity. Existing owner checks are useful foundations, not proof of complete tenant isolation.

Hosted billing gets workspace-level **Settings → Billing**. Existing **Revenue → Payment settings**, the `payments` tables and `/payments/...` endpoints continue to describe sales on customers' websites. Use separate `billing_*` records and routes for subscriptions to Yaap.

Self-hosted installations remain usable without Polar credentials or subscription checks. Select hosted behavior through deployment configuration, not browser input.

## Competitor comparison

Checked official pages on 2026-09-11. Examples are published USD monthly prices at the stated volumes, not normalized feature-for-feature comparisons. Live pricing pages take precedence over older search excerpts.

| Product | Shared usage model and website allowance | What happens above the allowance |
| --- | --- | --- |
| [Pirsch](https://pirsch.io/pricing) | Standard starts at $6/month for 10k monthly pageviews and 50 sites. Plus starts at $12/month for 10k and unlimited sites. Usage includes pageviews, custom events and 10% of session-extension events; deleted sites still contribute to the current period. | Access is limited to the day the limit was reached; collection continues for five more days, allowing time to upgrade or reach reset. |
| [Plausible](https://plausible.io/) | Pageviews plus custom events are pooled across a team. Starter includes 1 site, Growth 3, Business 10; larger site allowances require Enterprise. Features also vary by plan. | One over-limit month is tolerated. After two consecutive months, an upgrade is requested; unresolved overages can lock dashboards while collection continues. [Usage and overage policy](https://plausible.io/docs/subscription-plans). |
| [Fathom](https://usefathom.com/pricing) | Starts at $15/month for 100k monthly pageviews, including custom events, shared across sites. At least 50 sites are included; extra packs of 50 cost $10/month. | Occasional spikes do not stop analytics. Substantial or sustained overages trigger an upgrade request; unresolved overages may restrict dashboard/API access while collection continues. |

The expanded [niche-provider pricing research](HOSTED_PRICING_RESEARCH.md) covers DataFast, Rybbit, Swetrix, Databuddy, Umami, Pirsch, Cabin and Tinylytics, with full observed monthly ladders and a concrete Yaap recommendation. Unlimited sites also appear at Databuddy, on Rybbit Pro, Cabin Scale and Umami Business. Yaap can keep its offer simple: unlimited websites on every paid volume tier, with the same core analytics features. This is a positioning recommendation, not a claim that unlimited sites is unique in the market.

Example: 60k events on one site plus 25k and 15k on two others consumes a 100k account allowance. Adding ten idle websites costs nothing. A pageview followed by two custom events consumes three units, regardless of the number of validated properties. Recommended monthly prices are $9/100k, $19/500k, $29/1M, $49/2M, $99/5M and $149/10M, with custom pricing above that. These are market-informed proposals, pending cost/capacity checks and a product decision; see the research for annual options and assumptions.

Overage policies vary materially. Recommend tolerating one occasional over-limit period, then requesting an explicit upgrade after sustained excess; use a disclosed, bounded grace period before restricting report/API access while continuing collection. Do not auto-charge or silently upgrade. Decide the final policy and maximum tolerated excess before launch; unlimited continued ingestion under an unpaid upgrade request is not a sustainable promise.

## First release

| Area | Proposed scope |
| --- | --- |
| Packaging | Monthly event-volume tiers, unlimited websites on every paid tier, with pooled usage and the same core analytics features recommended. Prices, number of tiers and retention limits remain open. |
| Trial | Recommend a 14-day trial without a card, managed locally, followed by Polar checkout. One trial per eligible account, with signup abuse controls. Trial duration and eligibility need a decision. |
| Checkout | Authenticated owner selects an allowed plan; server creates a Polar checkout bound to the workspace. Show an activation-pending state on return until server verification succeeds. |
| Billing page | Current plan, subscription/trial status, total allowance used, per-site usage breakdown, usage reset date, renewal/cancellation date, upgrade action and Manage billing link. |
| Portal | Generate an authenticated Polar portal link for the owner. Delegate invoices, payment details and cancellation to the hosted portal. |
| Plan changes | Immediate upgrades with an explicit charge/proration preview; downgrades at renewal. Block unsupported transitions or explain which limits will change. Use Yaap's controlled change flow initially. |
| Notifications | In-app trial, usage and payment-status messages. Polar handles its billing emails; Yaap owns trial and allowance notices. |
| Support | Operator can inspect sync status, retry reconciliation and apply an audited, expiring access override. Refund processing stays in Polar. |

Polar supports configurable subscription change timing and proration. Disable unrestricted portal plan switching until its configured behavior matches Yaap's upgrade/downgrade policy. [Subscription management](https://polar.sh/docs/features/subscriptions/manage), [portal settings](https://polar.sh/docs/features/customer-portal/settings).

Defer annual billing, automatic overage charges, seats, add-ons, prepaid credits, custom invoice UI and enterprise contracts. Polar also supports metered pricing if actual-usage billing becomes desirable, but that adds usage export and invoice reconciliation work. [Metered billing](https://polar.sh/docs/features/usage-based-billing/billing).

## Usage contract

Proposed unit: **tracked events**, clearly defined as pageviews plus custom events, pooled across the workspace. Do not label this allowance as pageviews if custom events consume it. Anonymous events count; presence heartbeats, excluded/bot requests, rejected events, payment records and duplicate deliveries do not.

Count a unique event once when it is successfully persisted. Assign it to a usage period using its original server-received timestamp. For monthly subscriptions, use explicit UTC period boundaries aligned with the subscription; display the actual dates in Billing. Trials have a separate allowance period. Plan upgrades preserve already-used units rather than granting an accidental reset. Late queue deliveries update the original period.

The existing `consume()` path in `apps/web/src/ingest.ts` inserts events and updates operational counters separately. A crash between these operations can make those counters differ from persisted events. Build a durable usage ledger/counter with an atomic write or a recoverable outbox, deduplicated by workspace/site/event ID. Retain usage accounting independently of raw analytics retention and site deletion. Define a replay horizon and retain deduplication evidence for it; old replay must not become new usage after raw events expire.

Proposed allowance policy: warn at 80% and 100%, tolerate an occasional over-limit period, then request an upgrade for sustained excess as described above. Thresholds, grace length, report/API restrictions, recovery on period reset and the ultimate collection ceiling remain open. Payment expiry is a separate state from exceeding an allowance on a paid subscription. If a final hard collection ceiling is adopted, disclose that data arriving while collection is paused cannot be recovered.

Use local entitlement state on collection; do not call Polar for each event. Bound queue/caching overshoot, expose the usage freshness time, and add independent abuse/rate limits because public tracking IDs can receive forged traffic. A traffic allowance alone is not an abuse control. Rate-limit automated site creation and paginate site lists; avoid introducing a hidden billable site cap. Background maintenance must avoid unbounded per-site work for idle sites, so unlimited low-traffic websites remain economical.

## Billing synchronization

Use one Polar customer per workspace, with the workspace ID as the stable external ID. Email is a contact field, not the tenant key. Polar's Customer State API and `customer.state_changed` webhook provide a basis for synchronizing access. [Customer state](https://polar.sh/docs/integrate/customer-state).

Conceptual local records:

- `billing_accounts`: workspace/customer mapping, provider environment and billing contact.
- `billing_subscriptions`: provider subscription/product IDs, internal plan version, status, period boundaries, scheduled cancellation/change and last successful sync.
- `billing_usage_periods` plus deduplication/outbox records: units consumed and the durable evidence needed to repair interrupted processing.
- `billing_webhook_receipts`: unique provider event ID, processing state, attempts and failure details.

Store only the provider fields needed for billing and support. Keep card details out of Yaap. Internal plan keys map to an allowlist of environment-specific Polar products; the server resolves customer, workspace, price/product and return URLs. Do not trust those values from query parameters. Prevent duplicate checkout attempts from creating parallel subscriptions.

Verify webhook signatures against the original body, durably record receipt before acknowledging, and process idempotently. Treat a webhook as a reconciliation trigger: fetch authoritative current state, serialize updates per workspace and prevent an older concurrent fetch from overwriting newer state. Retry failed processing and run periodic reconciliation to repair missed delivery. Keep sandbox and production credentials, products and records separate. [Webhook handling](https://polar.sh/docs/integrate/webhooks/delivery).

For full lifecycle details, reconcile subscription records as well as Customer State; absence from its active-subscription list alone does not explain whether a customer is past due or fully ended. Checkout redirects never grant access by themselves.

Polar offers a TanStack Start adapter. Prefer a thin server-only integration around Yaap's own authorization and Cloudflare bindings; evaluate the SDK/adapter in a Worker sandbox before choosing packages. [TanStack Start integration](https://polar.sh/docs/integrate/sdk/adapters/tanstack-start).

## Access policy to settle

| State | Proposed behavior |
| --- | --- |
| Trial or paid active | Collect and report within plan limits. |
| Cancel scheduled | Keep paid access until the confirmed period end. Show that date. |
| Past due | Show recovery action; allow a bounded payment grace period aligned with Polar's recovery configuration. |
| Trial expired / unpaid / subscription ended | Pause new collection and paid mutations; preserve login, Billing, retained reports and an export path. |
| Refunded / disputed | Reconcile actual subscription/access state; do not treat every partial refund as cancellation. Explicitly revoke access when the chosen refund/support policy requires it. |
| Polar unavailable | Keep existing confirmed access for a bounded outage grace; queue reconciliation. Do not invent new paid access. |

Payment grace, outage grace and post-cancellation retention/export deadlines remain open. Cancellation must not itself delete analytics. Hosted data retention must have a defined limit and communicated deletion policy; current self-hosted defaults disable automatic retention. An export path is a hosted-launch dependency, not an existing promise.

## Delivery slices and acceptance

1. **Hosted foundation and commercial decisions:** choose tenancy/deployment model; implement workspace identity, hosted signup/recovery and authorization; set prices, allowances, trial and retention rules. Verify one customer's session/tokens cannot access another customer's data or billing.
2. **Purchase and access:** add plan mapping, authenticated checkout, verified webhook receipt, subscription reconciliation and local entitlements. Sandbox purchase activates only its workspace; duplicate, delayed and reordered events converge correctly; returning before the webhook shows pending activation safely.
3. **Billing page and lifecycle:** add usage/status display, portal link and controlled plan changes. Exercise trial expiry, failed renewal/recovery, cancellation at period end, upgrade, downgrade, refund and provider outage. Billing remains accessible after paid access expires.
4. **Usage and launch verification:** implement durable accounting, warnings and enforcement. Prove retries, crashes, retention, site deletion, late events and period boundaries cannot double count or reset usage. Verify webhook delivery through the deployed Cloudflare path, recovery from missed webhooks and operator reconciliation. Confirm the seller account can complete Polar onboarding/payout setup before accepting real subscriptions.

The billing integration can be developed in sandbox alongside the hosted foundation, but a public paid launch depends on both. No production Polar account, products, credentials or charges were created for this scope.
