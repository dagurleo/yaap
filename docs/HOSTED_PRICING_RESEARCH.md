# Hosted pricing research and recommendation

Researched 2026-09-11. Commercial recommendation, not approved or implemented pricing. See [billing scope](HOSTED_BILLING_SCOPE.md).

**Latest 2026-09-12 proposal:** Keep the original monthly ladder below as a launch candidate, with unlimited sites, shared core features and a two-year analytics-history target. The initial HA/full-allowance cost scenario is a stress test, not the expected single-node ARM bill or evidence of average customer utilization. Six-month history was rejected as the default recommendation after the competitor-retention discussion. See the [current Polar catalog](HOSTED_POLAR_CATALOG.md) for product configuration and proposed terms. Annual discounts remain deferred; no pricing or retention configuration has changed.

## Recommendation

Launch one paid feature set with unlimited websites and an account-wide monthly event allowance. Use a volume selector instead of separate feature packages. Include existing traffic reports, events, funnels, visitor journeys, revenue attribution, API and MCP in every paid tier. Do not advertise integrations or features that have not shipped.

| Monthly events, pooled across all sites | Monthly price | Annual price, when available | Effective monthly on annual |
| --- | --- | --- | --- |
| 100,000 | $9 | $90 | $7.50 |
| 500,000 | $19 | $190 | $15.83 |
| 1,000,000 | $29 | $290 | $24.17 |
| 2,000,000 | $49 | $490 | $40.83 |
| 5,000,000 | $99 | $990 | $82.50 |
| 10,000,000 | $149 | $1,490 | $124.17 |
| Above 10,000,000 | Custom | Custom | — |

Headline: **Unlimited websites. Traffic, funnels and revenue attribution from $9/month.** Supporting explanation: **One shared event allowance across all your websites. Every paid plan includes all core features.**

Recommend a 14-day trial with no card, capped at 100k events across unlimited sites. Keep the free self-hosted option; defer a permanent free cloud tier until activation, support load and abuse costs are understood. Offer annual billing at ten monthly payments once annual lifecycle handling is verified; monthly billing remains the smaller first implementation.

An event is one persisted pageview or custom event, including its validated properties. Do not charge per property, presence heartbeat, goal calculation, funnel step or dashboard/API read. Requests and queries still have published rate/resource limits. Rejected traffic and duplicate deliveries do not count. Payment ingestion has separate abuse controls and does not consume the traffic allowance.

Target 24 months of hosted analytics retention across paid tiers, subject to capacity/cost verification before promising it. Annual payment does not pool a year's event allowance: the allowance still resets monthly. Keep higher volume tiers unavailable until their ingestion and report performance have passed realistic capacity checks.

Warn at 80% and 100%. Recommend tolerating an occasional over-limit month, requesting an explicit upgrade for sustained excess, and defining a bounded grace/maximum excess policy before launch. No automatic overage invoices or silent plan changes. Pricing depends on those bounds; indefinite over-limit collection is not included in this proposal.

## Why these prices

At 100k units, Yaap would be $9 against DataFast Starter's $19, Rybbit Standard's $19 and Swetrix Standard's $19, while including unlimited sites. These products have different capabilities and meters, so this is a positioning comparison, not feature equivalence. At 1M, $29 remains substantially below DataFast Starter and Rybbit Standard ($69), and Swetrix Standard ($79). Sources and exact ladders appear below.

Umami Pro is a serious price competitor at $20 for 1M units and 20 sites; Cabin Scale offers 5M pageviews and unlimited sites for $45. Yaap would not be the cheapest product at every volume. Its proposed case is clear event accounting, unlimited sites from the entry tier, and accessible conversion/revenue analysis. Validate that customers value that combination before relying on it to support a premium over the cheapest alternatives.

Do not start at $5: Yaap still needs onboarding, support and billing operations even for small accounts. Do not put revenue attribution behind a higher feature package: it is a central reason to choose Yaap. Do not offer lifetime hosted usage, which creates ongoing storage and processing obligations without recurring revenue.

These are market-informed test prices. No production cost model or willingness-to-pay study has been completed. Before general availability, measure signup-to-first-event activation, trial-to-paid conversion, plan distribution, gross margin at full allowance and steady-state retention, and support load. Review after the first 20–30 paying accounts, with advance communication and an explicit existing-customer policy for future price changes.

## Comparison method

Eight smaller providers were checked: DataFast, Rybbit, Swetrix, Databuddy, Umami, Pirsch, Cabin and Tinylytics. Monthly USD list prices are used; annual discounts, promotions, tax and add-ons are separate. Pageviews, events, properties and hits are not interchangeable units. The tables preserve each provider's stated meter.

Live monthly selectors were read for Rybbit, Swetrix and Pirsch. Umami's hydrated pricing page and usage FAQ were read in the browser. DataFast's public pricing page and its publicly served pricing configuration supplied both plan families; the Starter ladder also matched the account's displayed plan chooser, with no subscription change. Databuddy's public pricing API supplied exact overage rates; its page rounds some rates. Cabin and Tinylytics publish fixed plans directly.

## DataFast

Revenue-oriented analytics. Starter allows 1 site/1 member; Growth allows 30 sites/30 members. Published retention is 3 years versus 5+ years. Fourteen-day card-free trial; above-limit collection continues, while dashboard access requires an upgrade. Annual prices are ten times monthly prices. [Official pricing](https://datafa.st/#pricing).

| Monthly events | Starter/month | Growth/month |
| --- | --- | --- |
| 10k | $9 | $19 |
| 100k | $19 | $39 |
| 200k | $29 | $59 |
| 500k | $49 | $99 |
| 1M | $69 | $139 |
| 2M | $89 | $179 |
| 5M | $129 | $259 |
| 10M | $169 | $339 |
| 10M+ (provider's label) | $199 | $399 |

The “10M+” label is not an unlimited-use promise. Source for all prices: the public pricing configuration loaded by the landing page, [snapshot bundle](https://datafa.st/_next/static/chunks/7011-aff9b1003fb267a9.js). Bundle URLs are versioned and may expire; checked date applies to the table.

## Rybbit

Standard includes 5 websites, 3 members and 3-year retention. Pro includes unlimited websites/members, replay and 5-year retention. Seven-day trial; the site advertises four months free annually and initially displays annual-equivalent prices ($13/$26 at 100k). The table below uses the explicitly selected monthly option. Enterprise is custom. [Official pricing](https://rybbit.com/pricing).

| Monthly pageviews, as labeled | Standard/month | Pro/month |
| --- | --- | --- |
| 100k | $19 | $39 |
| 250k | $29 | $59 |
| 500k | $49 | $99 |
| 1M | $69 | $139 |
| 2M | $99 | $199 |
| 5M | $149 | $299 |
| 10M | $249 | $499 |
| 20M | $399 | $799 |
| 30M | $549 | $1,099 |
| 40M | $699 | $1,399 |
| 50M | $849 | $1,699 |
| Above 50M | Custom | Custom |

Do not assume that a quoted pageview volume corresponds to the same workload as Yaap's combined pageview/custom-event allowance.

## Swetrix

Standard includes 10 websites; Plus includes 100 and adds replay, flags and experiments. Fourteen-day trial requires a payment method. Annual toggle advertises 17% off; table is monthly USD. Enterprise is custom. [Official pricing](https://swetrix.com/#pricing).

| Monthly events | Standard/month | Plus/month |
| --- | --- | --- |
| 100k | $19 | $39 |
| 200k | $29 | $59 |
| 500k | $49 | $109 |
| 1M | $79 | $179 |
| 2M | $119 | $279 |
| 5M | $179 | $439 |
| 10M | $249 | $629 |
| 15M | $349 | $919 |
| 20M | $419 | $1,139 |
| 30M | $519 | $1,459 |
| 40M | $619 | $1,799 |
| 50M | $719 | $2,159 |
| Above 50M | Custom | Custom |

The billing FAQ confirms annual billing costs ten monthly payments. It includes pageviews, custom events, CAPTCHA events and error events in usage. Extra websites are available in recurring packs of 50; pack prices were not publicly verified. The homepage says slight/occasional overages are tolerated; unresolved excess requires upgrading to retain dashboard access while collection continues. [Billing FAQ](https://swetrix.com/docs/billing-faq).

## Databuddy

Unlimited sites and seats across plans. Counts pageviews, custom events, errors and Web Vitals; flags and uptime checks do not consume the event quota. Despite broad feature-inclusive messaging, funnel/goal/flag quantities vary. Business and Scale emphasize investigation capacity and are invite-only. Ignore the introductory first-month promotion when comparing recurring cost. [Official pricing](https://www.databuddy.cc/pricing).

| Plan | Monthly base | Included events/month | Included investigation credits/month |
| --- | --- | --- | --- |
| Free | $0 | 10k | 10 |
| Hobby | $9.99 | 30k | 20 |
| Pro | $49.99 | 1M | 350 |
| Business | $299 | 2M | 1,500 |
| Scale | $799 | 10M | 5,000 |
| Enterprise | Custom | Custom | Custom |

The public API gives paid overage brackets of $0.035/1k through 2M, $0.030/1k through 10M, $0.020/1k through 50M, $0.015/1k through 250M and $0.010/1k thereafter. These are marginal bands, not a single rate applied to all usage. At 100k, Hobby is approximately $12.44; at 1M, approximately $43.94, assuming all excess after the included 30k is in the first band. Pro's higher base also buys more feature/investigation capacity. [Exact public pricing API](https://www.databuddy.cc/api/pricing).

## Umami

| Plan | Monthly base | Included events/month | Websites | Overage |
| --- | --- | --- | --- | --- |
| Hobby | $0 | 100k | 1 | No paid overage shown |
| Pro | $20 | 1M | 20 | $30 per additional 1M events |
| Business | $200 | 10M | Unlimited | $20 per additional 1M events |
| Enterprise | Custom | Custom | Custom | Custom |

Retention is 6 months / 2 years / 5 years on Hobby / Pro / Business. Business also includes 5,000 replays, then $0.005 per extra replay. The usage FAQ says pageviews, custom events and each stored custom property count. Thus “1M events” is not equivalent to 1M Yaap events carrying arbitrary validated properties. Pro would cost $50 at 2M and $140 at 5M on its published meter. [Official pricing and usage FAQ](https://umami.is/pricing).

## Pirsch

Standard includes 50 websites; Plus includes unlimited websites and adds funnels, teams and other features. Both advertise unlimited retention. Thirty-day card-free trial. Usage includes pageviews, custom events and 10% of session extensions. [Official pricing](https://pirsch.io/pricing).

| Monthly usage | Standard/month | Plus/month |
| --- | --- | --- |
| 10k | $6 | $12 |
| 100k | $12 | $27 |
| 200k | $18 | $45 |
| 500k | $36 | $99 |
| 1M | $54 | $159 |
| 5M | $99 | $299 |
| 10M | $159 | $479 |
| 20M | $249 | $749 |
| 50M | $499 | $1,499 |
| 100M | $799 | $2,399 |
| Above 100M | Custom | Custom |

These are the live monthly selector values, not prices from third-party comparisons. At the usage limit, dashboard access is limited and collection continues for five days to allow upgrading or period reset.

## Cabin

| Plan | Monthly | Annual | Monthly pageviews | Websites |
| --- | --- | --- | --- | --- |
| Free | $0 | $0 | 10k | 1 |
| Plus | $14 | $140 | 100k | 10 |
| Scale | $45 | $450 | 5M | Unlimited |
| Above 5M | Custom | Custom | Custom | Custom |

Plus adds events/API/custom domains; Scale adds Search Console, branding and other client-facing tools. Retention/access windows are 30 days, 12 months and unlimited. Cabin says over-limit data continues to be recorded. [Pricing](https://withcabin.com/pricing), [plan limits](https://docs.withcabin.com/plans), [annual prices](https://prod.withcabin.com/blog/a-fresh-new-cabin).

## Tinylytics

| Plan | Monthly | Annual | Websites | Traffic |
| --- | --- | --- | --- | --- |
| Zen | $7 | $70 | 2 | Advertised unlimited hits |
| Pro | $14 | $140 | 20 | Advertised unlimited hits |
| Ultra | $29 | $290 | 50 | Advertised unlimited hits |

All paid plans include retention, API, webhooks and monitoring. Ultra adds team/alerting/content extras. Fourteen-day card-free trial. The important qualification is fair use: sustained traffic above roughly 1M hits/month may require a custom arrangement. This prices site count and service fit, unlike Yaap's proposed event allowance. [Official plans and fair-use explanation](https://tinylytics.app/).

## Cost check before publishing

Polar Starter currently charges 5% + $0.50, plus 1.5% for non-US cards and separate payout fees. The following is a simplified no-tax, US-card monthly illustration. It is not a measured hosting cost or forecast. [Polar fees](https://polar.sh/docs/merchant-of-record/fees).

| Yaap monthly price | Base Polar fee | Remaining after base fee | Hosting/operations budget at an illustrative 80% gross-margin target |
| --- | --- | --- | --- |
| $9 | $0.95 | $8.05 | $0.85 |
| $19 | $1.45 | $17.55 | $2.35 |
| $29 | $1.95 | $27.05 | $3.85 |
| $49 | $2.95 | $46.05 | $6.85 |
| $99 | $5.45 | $93.55 | $14.35 |
| $149 | $7.95 | $141.05 | $21.85 |

Budget = 20% of subscription revenue minus base Polar fee. Taxes in the fee base, international cards, payout charges, refunds and any directly attributable support costs reduce the available budget. Shared infrastructure must be allocated across paying accounts. Test costs at the full allowance, agreed overage grace and mature retention, not just the first month of mostly empty accounts.

The current [performance measurements](PERFORMANCE.md) are local fixtures, not production cost or multi-tenant capacity evidence. If 1M events/month with the intended retention/query workload cannot fit the $29 economics, optimize the storage/query design or raise that tier before launch. Do not assume competitors' infrastructure costs apply to Yaap's D1/PostgreSQL implementation.
