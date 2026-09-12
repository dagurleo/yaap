# Google Ads and Meta integration research

Researched 2026-09-11. Proposal only; no integration has been implemented or tested against an advertiser account.

Yaap can support paid-ad attribution without requiring GA4. The useful product combines three independent capabilities: attributing outcomes inside Yaap, importing spend, and returning conversion signals to advertising platforms. The third capability is what lets advertisers use their business outcomes for campaign optimization.

## Existing foundation

Inspected `packages/client/src/index.ts`, `apps/web/src/ingest.ts`, both analytics schemas, `apps/web/src/server/payment-attribution.ts`, and the tracking/payment guides.

- The tracker and ingestion pipeline accept `utm_source`, `utm_medium`, and `utm_campaign`. Campaign context survives SPA navigation and identified tab sessions. Correctly tagged campaigns can already be connected to outcomes; no ad-account API is required for that basic report.
- Visitor IDs can be handed through checkout to Stripe or the server payment API. Payment amounts are server sourced, with deduplication, refunds, currency separation, and test/live separation.
- Revenue saves first-touch or last-non-direct attribution with configurable lookback. The saved dimensions include source and campaign, but not medium or ad IDs. Pending attribution has a minimum 72-hour reconciliation interval.
- Missing: click identifiers, campaign/ad identifiers as dedicated dimensions, spend imports, ad-platform credentials, consent records for advertising, and conversion delivery.
- `setConsent` is explicitly a legacy alias for enabling identifiers. It must not authorize advertising exports. Yaap also does not currently collect customer emails or phone numbers.

## What each part delivers

| Capability | Example question | Required work |
| --- | --- | --- |
| Internal attribution | Which campaign or ad produced this signup/payment? | Landing parameters, durable touch context, checkout linkage, reports |
| Spend reporting | We spent $100 and attributed $400 revenue: which campaign returned 4× spend? | Read Google/Meta spend, join stable IDs, handle currencies and time zones |
| Conversion forwarding | Can Google/Meta optimize toward paid customers? | Approved event mappings, platform match identifiers, consent, durable deliveries |

GA4 is not a prerequisite for the direct Google conversion ingestion route, and Meta has a server conversion API. That does not mean removing all browser tags is always the best measurement setup: browser and server signals can complement each other. [Google events overview](https://developers.google.com/data-manager/api/devguides/events), [Meta official SDK](https://github.com/facebook/facebook-python-business-sdk).

## Google

Use **Google Ads API for reporting** and **Data Manager API for new conversion ingestion**. Google's upload documentation warns that, starting June 15, 2026, `UploadClickConversion` requests fail for developer tokens that have never previously uploaded offline conversions or enhanced conversions for leads. Avoid implementing a new connector around legacy examples. [Migration warning](https://developers.google.com/google-ads/api/docs/conversions/upload-offline).

Data Manager exposes `POST /v1/events:ingest` with destination/event records, conversion timestamps and values, transaction IDs, ad identifiers, consent, and validation-only requests. Account-specific event requirements still need a proof of concept. [REST reference](https://developers.google.com/data-manager/api/reference/rest/v1/events/ingest).

Capture `gclid`, `gbraid`, and `wbraid` as opaque, separately validated identifiers when permitted; do not apply Yaap's restrictive UTM-label validator to them. Preserve original touch time. For reporting joins, also capture explicit campaign/ad IDs: click IDs are not campaign IDs. Google ValueTrack supplies `{campaignid}`, `{adgroupid}`, and `{creative}`. Preserve IDs as strings; Google notes these can be 64-bit. [Click identifiers](https://developers.google.com/google-ads/api/docs/conversions/upload-offline), [ValueTrack](https://support.google.com/google-ads/answer/6305348?hl=en).

Reporting supports campaign cost, impressions and clicks. It requires OAuth credentials and a Google Ads developer token with appropriate account access. Data Manager has a separate `datamanager` OAuth scope and supports user or service-account access. A widely distributed self-hosted product needs an explicit credential/onboarding design. [Reporting example](https://developers.google.com/google-ads/api/rest/examples), [Ads authorization](https://developers.google.com/google-ads/api/rest/auth), [Data Manager access](https://developers.google.com/data-manager/api/devguides/quickstart/set-up-access).

Documentation discrepancy: the events overview still mentions an allowlist for supplementing Google tag conversions, while release notes say that feature became generally available to Google Ads accounts on February 10, 2026. Treat release notes as the newer evidence and verify the chosen mode in a real account. Offline imports and supplementing tag conversions are different integration modes. [Release notes](https://developers.google.com/data-manager/api/reference).

## Meta

Use **Marketing API Insights for spend** and **Conversions API for conversion delivery**. Meta's official SDK exposes insights fields and server events. Its parameter-builder library supports `fbc`, `fbp`, event source URL, client IP, and normalized/hashed customer information. These are distinct from Yaap's internal HMAC visitor identifier; that identifier alone does not establish a Meta user match. [Insights model](https://github.com/facebook/facebook-python-business-sdk/blob/main/facebook_business/adobjects/adsinsights.py), [server event model](https://github.com/facebook/facebook-python-business-sdk/blob/main/facebook_business/adobjects/serverside/event.py), [parameter builder](https://github.com/facebook/capi-param-builder/blob/main/php/README.md).

Capture genuine `fbclid` landing context and applicable `_fbc`/`_fbp` values under the advertising controls. Add stable campaign/ad-set/ad dimensions separately; do not infer an ad ID from `fbclid`. Begin with `Purchase`, then explicitly mapped signup/lead events.

Use a stable event ID per logical conversion, preserved across retries. If a site also sends browser Pixel purchases, shared browser/server event identity and the current platform deduplication rules must be verified before enabling both paths. A Stripe webhook ID is not necessarily the logical order/conversion ID.

Meta's developer documentation pages returned errors during this research. Its official SDKs corroborate the data interfaces, but precise permissions, own-account versus third-party app review, token lifecycle, supported URL macros, event deadlines and Pixel/CAPI deduplication rules remain implementation-spike checks. Do not promise universal one-click connection or a particular match rate yet.

## Recommended architecture

These are design recommendations, not existing behavior:

1. **Separate advertising context from general events.** Store bounded touch records with site, visitor link, timestamp, UTMs, stable platform IDs, click identifiers and advertising consent state. Keep raw match data out of public reports and ordinary event properties. Apply explicit retention and deletion rules.
2. **Extend both database implementations and payment snapshots.** Preserve medium and ad dimensions through checkout, late attribution, and raw-event retention. Deduplicate a marketing touch carried across pageviews so it is not mistaken for repeated ad clicks.
3. **Import daily spend independently.** Key by site, platform, account, date and campaign/ad ID. Save account time zone, currency and last-sync status. Refresh recent dates to incorporate upstream revisions. Never join by mutable campaign names or sum spend across incompatible breakdowns.
4. **Materialize conversion occurrences and a delivery outbox.** Use trusted payments first. Define whether a lead/signup counts once per event, session or business entity; a mutable dashboard goal alone is not a durable conversion record. Map each occurrence to explicitly enabled destinations.
5. **Send asynchronously.** Store destination, stable conversion key, payload version, consent snapshot, delivery status and retry information. Separate API acceptance from eventual attribution/diagnostics. Existing Cloudflare queues and scheduled maintenance are a suitable foundation, with delivery failure isolated from analytics ingestion.
6. **Do not wait 72 hours for forwarding.** Current report finalization is a local attribution policy, not a platform deadline. Capture eligible context early and deliver promptly, with bounded repair for late metadata. Send each platform its eligible evidence independently of Yaap's chosen first/last-touch winner.
7. **Handle duplicate sources and refunds deliberately.** Existing GA4 imports, Google tags and Meta Pixel purchases may already send conversions. Choose one primary reporting/optimization path or verified platform deduplication. Refund adjustment support must be designed per destination; a negative purchase is not a generic reversal mechanism.

Advertising export should default off, with its own controls and consent-manager interface. Google distinguishes analytics storage, ad storage, ad user data, and ad personalization; the existing identity switch cannot represent those choices. Hashing customer details is a matching technique, not consent. [Google consent types](https://developers.google.com/tag-platform/security/concepts/consent-mode).

## Delivery order and acceptance criteria

1. **Ad attribution foundation:** dedicated dimensions and permitted click capture, consistent checkout handoff, ad/campaign revenue breakdowns. Demonstrate ad landing → later direct visit → payment under both attribution models, on D1 and PostgreSQL. Missing identity stays unattributed.
2. **Spend connectors:** verify credentials against each owner's account, import campaign-level daily spend, show cost per selected conversion and revenue/spend. Confirm time-zone and currency handling; distinguish missing spend from zero spend. Add ad-level detail once IDs and API coverage are verified.
3. **Conversion forwarding:** prove one permitted purchase per platform, including test/validation flows, retries, duplicate payment delivery, existing-tag coexistence, consent withdrawal and revoked credentials. Display failures and diagnostic status.
4. **Later:** enhanced customer matching, qualified leads, additional event mappings, and optional coordinated browser tags. Avoid remarketing audiences and ad management in the first release.

Start credential/access spikes early because they can constrain the schedule independently of coding. A production integration spans multiple iterations; it is not just adding two API calls. No delivery-time estimate is established by this research.

Yaap should show **its attributed revenue** separately from **platform-reported conversions/value**. The systems can differ in windows, counting rules, eligible signals and reporting dates. Do not sum Google and Meta's claimed conversions into a deduplicated customer total. Local browser-linked attribution cannot recover every cross-device journey or ad impression; neither an accepted API request nor a spend connection proves a conversion was matched.
