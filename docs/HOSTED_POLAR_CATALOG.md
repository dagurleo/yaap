# Hosted Polar catalog proposal

2026-09-13. Concrete launch proposal. The six products below are provisioned separately in both Polar sandbox and production. Production products remain private until the launch checklist is complete. This is the latest packaging recommendation after the competitor, retention, single-node ARM and allowance-utilization discussion. Read with [billing scope](HOSTED_BILLING_SCOPE.md), [competitor research](HOSTED_PRICING_RESEARCH.md) and [infrastructure scenarios](HOSTED_INFRASTRUCTURE_COSTS.md).

The [billing implementation plan](HOSTED_BILLING_IMPLEMENTATION_PLAN.md) turns this catalog and the confirmed limit-triggered upgrade flow into staged engineering work, including durable accounting and acceptance tests. Use it as the new-session execution reference.

## Customer offer

One hosted Yaap subscription per workspace. Unlimited websites, one event allowance shared across them, the same core features at every volume. Present one plan card and an event-volume selector. The only paid-tier difference is the monthly event allowance.

| Polar product name | Internal plan key      | Monthly USD | Price in cents | Monthly events |
| ------------------ | ---------------------- | ----------- | -------------- | -------------- |
| Yaap — 100k events | hosted_100k_monthly_v1 | $9          | 900            | 100,000        |
| Yaap — 500k events | hosted_500k_monthly_v1 | $19         | 1900           | 500,000        |
| Yaap — 1M events   | hosted_1m_monthly_v1   | $29         | 2900           | 1,000,000      |
| Yaap — 2M events   | hosted_2m_monthly_v1   | $49         | 4900           | 2,000,000      |
| Yaap — 5M events   | hosted_5m_monthly_v1   | $99         | 9900           | 5,000,000      |
| Yaap — 10M events  | hosted_10m_monthly_v1  | $149        | 14900          | 10,000,000     |

### Provisioned sandbox mapping

Provisioned and verified on 2026-09-12 in Polar organization `Mucho ehf (Sandbox)` (`cc4c2bcd-8682-4524-a00a-7ca1aaf0e138`). These IDs are sandbox-only and must never be used in production configuration.

| Internal plan key      | Polar sandbox product ID             |
| ---------------------- | ------------------------------------ |
| hosted_100k_monthly_v1 | e53927f1-5d55-4b16-9afa-47ee98683f3e |
| hosted_500k_monthly_v1 | 88c90668-4d8c-4cb4-b552-9c2a4dc3279d |
| hosted_1m_monthly_v1   | 6737ed88-e1d9-4cbb-8bc2-34e7461742db |
| hosted_2m_monthly_v1   | 3b8051d3-9614-4ee1-ae8f-fb2191e178e8 |
| hosted_5m_monthly_v1   | 18f97528-e54b-4e59-a2ea-27c71f5792c7 |
| hosted_10m_monthly_v1  | 08eaacf2-ec13-4e20-82fb-3fbdd1faf3b2 |

All six list back as private, monthly recurring fixed-price USD products with tax-exclusive pricing, no Polar trial and no attached benefits. Their metadata records `yaap_plan_key`, `yaap_catalog_version=1`, `event_allowance` and `admission_ceiling`. The app's server-side sandbox allowlist remains authoritative.

### Provisioned production mapping

Provisioned and verified on 2026-09-13 in Polar organization `Mucho ehf` (`0ceee3dc-4cda-4ee5-8607-876531edb2c9`). These IDs are production-only and must never be used in sandbox configuration.

| Internal plan key      | Polar production product ID          |
| ---------------------- | ------------------------------------ |
| hosted_100k_monthly_v1 | c93b6b10-460f-402c-b444-bca177b69c52 |
| hosted_500k_monthly_v1 | 4fedda15-07be-4ee5-a66c-07f0c077b006 |
| hosted_1m_monthly_v1   | 89a2fd87-2257-420f-a8dd-8d6c25ee6dc2 |
| hosted_2m_monthly_v1   | 377deaa2-6841-4dbc-b8f1-142f87a9eb38 |
| hosted_5m_monthly_v1   | b847eff0-df95-4cbf-b4f2-1a5cd45dc107 |
| hosted_10m_monthly_v1  | 3abc5bcc-a64a-4467-8086-7da82d46af21 |

All six production products list back as private, active, monthly recurring fixed-price USD products with tax-exclusive pricing, no Polar trial and no attached benefits. Their metadata records `app=yaap`, the internal plan key, catalog version, allowance and admission ceiling. No production checkout, customer, subscription or webhook was created during product provisioning.

The production Worker was configured with `POLAR_ENVIRONMENT=production` and the following non-secret allowlist on 2026-09-13. Its production access token and webhook signing secret are encrypted Worker secrets, not source-controlled variables:

```env
POLAR_PRODUCT_IDS={"hosted_100k_monthly_v1":"c93b6b10-460f-402c-b444-bca177b69c52","hosted_500k_monthly_v1":"4fedda15-07be-4ee5-a66c-07f0c077b006","hosted_1m_monthly_v1":"89a2fd87-2257-420f-a8dd-8d6c25ee6dc2","hosted_2m_monthly_v1":"377deaa2-6841-4dbc-b8f1-142f87a9eb38","hosted_5m_monthly_v1":"b847eff0-df95-4cbf-b4f2-1a5cd45dc107","hosted_10m_monthly_v1":"3abc5bcc-a64a-4467-8086-7da82d46af21"}
```

Above 10M: contact us, with a separately agreed allowance and price. Do not create an unlimited-volume product. Keep any volume unavailable for purchase until its ingestion, reports and maintenance have passed appropriate capacity checks. The catalog does not establish those capacities.

Use monthly recurring, fixed-price products in USD, quantity one. Explicitly configure tax behavior and show matching checkout/pricing-page totals; the proposal's prices are before applicable tax. Do not attach usage-priced components, seat prices or a percentage-of-customer-revenue charge. Polar's product model fixes the recurring interval when the product is created; future annual billing therefore uses separate annual products. [Products](https://polar.sh/docs/features/products).

Start monthly-only. The earlier ten-month annual-price suggestion is deferred until measured margins and annual lifecycle support justify it. A future annual subscription still receives a monthly allowance, not one annual pool.

## Included in every paid volume

- Unlimited websites with a pooled allowance.
- Traffic reports and real-time analytics.
- Custom events and validated event properties.
- Goals, funnels, visitor analysis and journeys.
- Revenue attribution using shipped payment integrations and the payment API.
- Public API and MCP access, under documented rate and query limits.
- Two years of analytics history as the proposed hosted retention contract.
- Standard email support; no SLA or dedicated support promise.

One owner per workspace, with site-specific read-only viewers included without seat charges once the [website sharing feature](WEBSITE_SHARING_FEATURE.md) ships. Invitations and Viewer permissions are scoped for implementation, not available yet; editor/admin roles and account-wide team membership remain deferred. Do not advertise unshipped invitations, session replay, integrations or completed export functionality. An export path remains a hosted-launch dependency in the billing scope.

Two years is the customer-facing history target, not approval to silently limit journeys or funnels to 90 days. Initially retain the information needed to honor the stated historical features. Shorter hot storage, durable rollups and R2 archives are implementation candidates; they must preserve the contract or have their narrower historical access and latency disclosed before sale. Existing rollups cannot survive normal raw-event deletion as a historical archive.

Example checkout description, substitute allowance:

> Hosted Yaap with 1,000,000 tracked events per month, shared across unlimited websites. Includes traffic analytics, custom events, goals, funnels, visitor journeys, revenue attribution, API and MCP access, and two years of analytics history. $29/month plus applicable tax. Cancel anytime; access continues through the paid period. Usage limits and grace policy apply.

This copy becomes publishable only after the corresponding hosted features and retention behavior are verified.

## Event and trial contract

One persisted pageview or custom event counts once, including its validated properties. Heartbeats, duplicate deliveries, rejected/excluded requests and payment records do not consume the allowance. Dashboard/API reads are not billable events but remain subject to resource limits. Deleting sites or old events does not reduce recorded period usage. Each monthly period follows the subscription's confirmed billing boundaries; unused allowance does not roll over.

Trial proposal: 14 days, no card, all core features, unlimited sites, 100k events total. Manage the trial in Yaap. Do not create a free Polar product or enable an additional trial on the paid products: Polar's subscription trials collect payment details and charge automatically afterward. Users enter paid checkout when ready, starting a paid period with a separate allowance; early conversion ends their trial. [Polar trials](https://polar.sh/docs/features/subscriptions/trials).

Concrete over-limit proposal for review: warn at 80% and 100%; include a 10% grace buffer without automatic charges; pause new event collection at 110% until upgrade or period reset. Existing reports and billing remain accessible. Display the grace boundary in Billing and explain that events sent while collection is paused cannot be recovered. Account for queued traffic when enforcing the ceiling. This replaces the earlier undefined occasional-overage policy only if adopted; it is not an implemented limit. Payment ingestion retains separate limits and lifecycle controls.

## Polar and Yaap responsibilities

Polar owns purchases, subscription billing, payment status, receipts/invoices, payment-method management and billing-portal cancellation. Yaap owns tenant authorization, feature access, retention, the durable event ledger, rate limits and allowance enforcement. A fixed-price subscription does not require exporting every tracking event to a Polar billing meter.

Create one Polar customer per workspace, using its immutable workspace ID as the external ID, and enforce one active hosted subscription. Initial purchase creates a subscription; volume changes update that subscription rather than buying a second one. Store environment-specific Polar product IDs in a server-side allowlist mapping to the plan keys and versioned entitlements above.

Optional product metadata: `app=yaap`, `plan_key=hosted_1m_monthly_v1`, `catalog_version=1`, `monthly_events=1000000`. These values help operations; server-side mappings determine access. Never infer entitlements from a product name or price amount. Existing subscribers retain their versioned entitlement contract when a later catalog changes. Polar also grandfathers existing subscribers when a fixed product's price changes. [Product pricing and metadata](https://polar.sh/docs/features/products).

No Polar automated benefits are necessary for the first release. If benefits are later used, a shared custom hosted-access benefit can complement subscription state; feature-by-feature benefits do not replace Yaap's quota logic. Reconcile server-side subscription/customer state from verified webhooks; checkout redirects alone cannot activate access. [Customer State](https://polar.sh/docs/integrate/customer-state).

## Plan changes and portal

- Upgrade: show the additional charge and effective allowance; use `proration_behavior=invoice` to collect the prorated difference immediately. Activate after the authoritative update succeeds. Preserve usage already counted and use the confirmed period boundaries. Proposed commercial behavior grants the new full period ceiling, not an additional new allowance on top; account for discounted late-period upgrades in margin monitoring.
- Downgrade: use `proration_behavior=next_period`; keep the current allowance and price until renewal. Display pending changes and reconcile replacements or cancellation of those changes.
- Cancellation: end at the paid period boundary. Billing stays accessible. Data expiry and post-cancellation export/recovery follow a separately disclosed lifecycle policy, not indefinite free hosting.
- Portal: allow invoices, payment details and cancellation. Disable portal plan changes initially because upgrades and downgrades need different timing and a Yaap allowance preview. Disable self-service pause until its collection and retention semantics are implemented.

Polar supports immediate prorated charges and next-period scheduled changes; an immediate-payment failure leaves the subscription unchanged. [Proration](https://polar.sh/docs/features/subscriptions/proration), [portal settings](https://polar.sh/docs/features/customer-portal/settings).

## Implementation order

1. Establish workspace ownership, hosted signup and durable plan/usage records as described in the billing scope.
2. Configure the six products in the sandbox, persist the returned IDs in the sandbox mapping and implement checkout, webhook reconciliation and portal sessions.
3. Verify successful/failed payments, duplicate webhooks, upgrades, scheduled downgrades, cancellation, trial conversion and usage boundaries. Exercise supported volumes before making them purchasable.
4. Create matching production products after the commercial terms and hosted behavior are ready. Keep production IDs separate; do not copy sandbox IDs.

Only the twelve products recorded above—six isolated sandbox products and six isolated production products—were created. A signed production webhook targets `https://yaap.sh/api/billing/webhooks/polar` using API version `2026-04`. No production checkout links, customer accounts, subscriptions or organization billing settings were created or changed during provisioning.
