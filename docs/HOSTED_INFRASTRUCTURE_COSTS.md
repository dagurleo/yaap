# Hosted infrastructure cost model

Checked 2026-09-12. USD/month, before tax. Estimates for a shared Cloudflare Workers + Queues + Hyperdrive deployment with PlanetScale Postgres in AWS Northern Virginia. This revises the market-only [pricing recommendation](HOSTED_PRICING_RESEARCH.md); it is not a production capacity benchmark or approved pricing.

## Conclusion

Cloudflare is inexpensive relative to retaining indexed analytics in replicated Postgres. Do not launch the original $29/1M, $99/5M and $149/10M allowances with 24 months of raw retention on the assumption that storage is negligible. At full sustained usage, even before database compute, the original high-volume tiers lose money in the central HA storage model.

The earlier response to this stress case proposed shorter retention and smaller allowances. Subsequent discussion favors retaining the original monthly ladder and a two-year history target while benchmarking single-node ARM and actual allowance utilization. See the [latest Polar catalog proposal](HOSTED_POLAR_CATALOG.md). Neither low utilization nor compute capacity has been established by production data; the HA calculations below remain useful stress scenarios, not the main forecast.

## Single-node ARM and utilization follow-up

The user's PlanetScale configuration and the live catalog confirm single-node PS-10-ARM at $10, PS-20-ARM at $17, PS-40-ARM at $28 and PS-80-ARM at $50/month in the modeled region. The similarly named PS-10/20/40 rows below are different architecture SKUs. Single-node volume costs are one third of HA for the same configured disk. PlanetScale supports single-node production workloads that do not require HA, with a later upgrade path. [Single node](https://planetscale.com/docs/postgres/cluster-configuration/single-node).

For ten $29/1M subscriptions, central 2 KiB footprint, 25% disk headroom, two-year accumulated history, the existing Cloudflare formula and an illustrative $28 PS-40-ARM compute budget:

| Average allowance used | Total monthly events | Monthly infrastructure, rounded |
| --- | --- | --- |
| 10% | 1M | $40 |
| 25% | 2.5M | $52 |
| 50% | 5M | $77 |
| 100% | 10M | $127 |

Revenue is $290 and base Polar fees are $19.50 across these scenarios. Full utilization produces $70.28 storage + $29.12 Cloudflare + $28 compute = $127.40 infrastructure. At 25%, about $219 remains after infrastructure and base Polar fees, before excluded costs. These are utilization scenarios, not a forecast or a PS-40 throughput claim. Earlier months have less accumulated history; later resizing or adoption of HA changes costs.

## Verified provider prices

Cloudflare Workers Paid starts at $5/account/month, including 10M requests and 30M CPU milliseconds. Excess costs $0.30/M requests and $0.02/M CPU milliseconds. Static assets are free under ordinary asset routing; Hyperdrive is included with unlimited queries. These allowances are shared across the account, not renewed for every Yaap customer. [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/).

Queues includes 1M operations/month, then $0.40/M operations. A successful message under 64 KB generally costs three operations: write, read and delete. Consumer batching does not eliminate per-message operations; retries cost extra. Consumer invocations also incur Worker request and CPU charges. [Queues pricing](https://developers.cloudflare.com/queues/platform/pricing/), [consumer billing](https://developers.cloudflare.com/queues/configuration/consumer-concurrency/).

The following PlanetScale prices were read directly from the public, read-only `public.planetscale_prices` SQL catalog advertised in the [official pricing documentation](https://planetscale.com/docs/postgres/pricing). Filters: Postgres, AWS, us-east-1, empty disk_sku; replication_factor 1 or 3. HA prices already cover all three instances; do not multiply compute by three again.

| SKU | vCPU / RAM per instance | Single node | HA cluster |
| --- | --- | --- | --- |
| PS-5 | 1/16 / 512 MiB | $5 | $15 |
| PS-10 | 1/8 / 1 GiB | $13 | $39 |
| PS-20 | 1/4 / 2 GiB | $20 | $59 |
| PS-40 | 1/2 / 4 GiB | $33 | $99 |
| PS-80-ARM | 1 / 8 GiB | $50 | $148 |

Network storage costs $0.125/GiB/month **per instance** in Northern Virginia, with 10 GiB included per included instance. HA consequently costs $0.375 per additional GiB of logical configured volume across its primary and two replicas. Billing follows configured disk, not only live rows. [Live storage rate](https://api.planetscale.com/www/storage-rates?region=us-east), [billing formula](https://planetscale.com/docs/postgres/pricing#storage-pricing). Tokyo's corresponding rate is $0.15/instance, or $0.45 for HA. [Tokyo rate](https://api.planetscale.com/www/storage-rates?region=ap-northeast). Use PlanetScale region identifiers for this endpoint; AWS identifiers can return a fallback rate.

Metal bundles local NVMe in its price and must be modeled separately. The same live catalog returned HA M-10-ARM at $50/10 GB, $80/50 GB and $110/100 GB, with 1/8 vCPU and 1 GiB per instance. These are alternative disk configurations, not inferred throughput capacities. Metal does not make arbitrary long-term retention free.

Local PgBouncer is included. Extra branches, dedicated PgBouncer, increased IOPS, excess compressed backups/WAL and database egress can add charges. Standard production egress includes 100 GB/month; PS-5 single-node includes 10 GB. The tables below exclude these overages, logs, email, domains, support and taxes. Cloudflare logs should be sampled and budgeted separately; current configuration enables observability without explicit sampling.

## What Yaap currently does

- [Ingestion](../apps/web/src/ingest.ts) performs approximately six store operations per ordinary visible, identified event: two site lookups, a presence update, the insert and two operational counter updates. Anonymous/non-presence paths differ. Maintenance triggers do additional work.
- [Client presence](../packages/client/src/index.ts) sends a heartbeat every 20 seconds while visible. These are not customer-billable events but still consume requests and database work. Cross-origin JSON requests can add preflights.
- The [Postgres executor](../apps/web/src/db/executor.ts) wraps calls in transactions with session-local settings. Database network waits differ from Worker CPU time. Hyperdrive pooling does not remove database work.
- [Maintenance triggers](../apps/web/migrations/postgres/0001_event_maintenance.sql) lock the site row, invalidate summaries and update visitor-first-seen records. Events for the same site encounter serialization.
- [Rollups](../apps/web/src/server/rollups.ts) add indexed visitor/session/activity records while retaining raw events. They are not a durable archive: deleting raw data invalidates its summaries. Advertising two years of reports with six months of raw retention requires implementation changes.
- The [consumer](../apps/web/wrangler.jsonc) currently has concurrency 1 and batches up to 25, processed sequentially. The hourly maintenance path rebuilds up to 14 completed site-days per invocation (336/day); unlimited active sites require more scalable scheduling. Retention deletes up to 5,000 events/site/hour, approximately 3.6M/month on a 30-day schedule, so a sustained 5M+ single-site workload eventually outpaces cleanup at mature retention.

These are capacity constraints, not per-query PlanetScale fees. A SKU price cannot establish how many customers it serves.

## Local storage measurement

Two isolated local Postgres databases were created through the existing `postgresFixture()` helper, all current migrations applied, and each populated with 20,000 synthetic pageviews on one completed UTC day. Each fixture used a 36-character site ID, UUID event IDs, 64-character visitor/session IDs, three short paths, populated device/location/referrer dimensions and an approximately 90-byte properties object. One used 4,000 visitors with five events each; the other 20,000 visitors with one event each. Production `rebuildDay()` generated the summaries. Both temporary databases and the temporary runtime bundle were removed afterward.

Measured the sum of `pg_total_relation_size(relid)` from `pg_statio_user_tables`, subtracting the empty migrated database's table footprint of 778,240 bytes. This includes table/index/TOAST storage, but not WAL, backups, operating-system files, full ingest counters/presence churn or mature retention churn.

| Fixture | Incremental table/index bytes | Bytes/event |
| --- | --- | --- |
| Five events/visitor | 33,587,200 | 1,679.36 |
| One event/visitor | 60,825,600 | 3,041.28 |

This is a small synthetic footprint measurement, not a production average or a throughput test. IDs, property size, unique paths, session density, vacuum behavior and index growth change results. Use **2 KiB/event centrally and 4 KiB/event as a stress case**, then provision 25% additional disk headroom. The central value is below the one-event-per-visitor fixture; validate the actual customer mix before relying on it.

## Reproducible formulas

Let E be total monthly tracked events across the deployment, R retained months, B bytes/event including tables and indexes, H=1.25 disk headroom, and N=1 for single-node or N=3 for HA.

```text
configured_GiB = E × R × B × H / 1,073,741,824
storage_bill = max(configured_GiB - 10, 0) × 0.125 × N

# Planning assumptions, not measured Worker usage:
# 4 HTTP requests per tracked event including heartbeat/preflight traffic;
# full 25-message consumer batches; 20 CPU ms total per tracked event.
worker_requests = 4 × E + E / 25
worker_CPU_ms = 20 × E
cloudflare_bill = 5
  + max(worker_requests - 10,000,000, 0) / 1,000,000 × 0.30
  + max(worker_CPU_ms - 30,000,000, 0) / 1,000,000 × 0.02
  + max(3 × E - 1,000,000, 0) / 1,000,000 × 0.40

total_infrastructure = database_SKU + storage_bill + cloudflare_bill + excluded_extras
base_Polar_fees = 0.05 × monthly_revenue + 0.50 × monthly_transactions
```

The event request multiplier is an assumption; lengthy foreground sessions can produce many more heartbeats. Partial batches, retries, bots, dashboard/API traffic, payment ingestion and maintenance add costs. Monitor those independently. At scale, these assumptions yield Cloudflare marginal cost of $2.812/M tracked events. No shared allowance is counted again in the marginal tables.

## Original tiers versus steady-state marginal cost

Central 2 KiB footprint, 25% disk headroom, HA storage, sustained full allowance, one monthly US-card payment. Includes modeled Cloudflare marginal usage, storage and Polar's base 5% + $0.50 fee. **Excludes shared database compute and all other operating costs.** [Polar fees](https://polar.sh/docs/merchant-of-record/fees).

| Original allowance | Price | Cost with six months retained | Cost with 24 months retained | 24-month cost at 4 KiB/event |
| --- | --- | --- | --- | --- |
| 100k | $9 | $1.77 | $3.38 | $5.52 |
| 500k | $19 | $5.54 | $13.58 | $24.31 |
| 1M | $29 | $10.13 | $26.22 | $47.68 |
| 2M | $49 | $19.30 | $51.49 | $94.40 |
| 5M | $99 | $46.33 | $126.80 | $234.09 |
| 10M | $149 | $89.71 | $250.65 | $465.22 |

At 24-month retention, each additional 1M/month of sustained usage contributes about 57.22 GiB of configured volume: $21.46/month HA storage or $7.15/month single-node. At six months, HA storage is $5.36. Doubling the footprint doubles this storage component. A newly launched service has less accumulated history; do not project its early margin indefinitely.

## Shared-platform example

For **ten customers each sending 1M/month**, central footprint, and an illustrative PS-20 HA compute budget of $59/month:

| Monthly item | Six months retained | 24 months retained |
| --- | --- | --- |
| Cloudflare Workers + Queues | $29.12 | $29.12 |
| PlanetScale compute | $59.00 | $59.00 |
| PlanetScale storage, shared allowance applied once | $49.89 | $210.83 |
| Infrastructure subtotal | $138.01 | $298.95 |
| Original subscription revenue, 10 × $29 | $290.00 | $290.00 |
| Base Polar fees | $19.50 | $19.50 |
| Remaining before excluded costs | $132.49 | -$28.45 |

This shows cost arithmetic, **not proof PS-20 serves that workload**. PS-40 HA adds $40/month; PS-80-ARM HA adds $89/month relative to PS-20. Bursts, concurrent reports and queue drain rate determine the required compute. A mixed customer base with smaller allowances earns different revenue for the same total event volume.

The catalog floor is $10/month for Workers plus PS-5 single-node, or $20 with PS-5 HA, before usage. Those database sizes have just 1/16 vCPU and 512 MiB; use them as minimum invoice figures, not hosted capacity claims. A $59–$99 HA compute planning budget plus Cloudflare/storage is a more useful starting scenario to load-test, still subject to measurement.

## Before fixing public prices

Measure production-shaped ingress and consumer CPU, requests per billable event, table/index growth after vacuum and rollups, database queue drain rates under bursts, concurrent report latency, WAL/egress and maintenance backlog. Address per-site serialization, transaction overhead and cleanup/rollup scheduling. Preserve unlimited sites commercially while bounding abusive creation and avoiding work on idle sites.

For two-year history at low prices, evaluate compact durable historical summaries and/or a separate analytics storage system. Changing retention alone cannot preserve the current raw-event reports. Compare PlanetScale Metal and single-node economics separately if their capacity and availability tradeoffs suit the hosted service.
