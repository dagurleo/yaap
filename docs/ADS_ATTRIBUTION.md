# Ad campaign attribution

The first ads slice connects explicit Google/Meta campaign and ad IDs to events and payment attribution without an advertising-account connection. Revenue shows the top 50 recorded ad campaigns by net revenue and campaign/ad IDs on individual payments.

Account connections, spend imports, raw click identifiers (`gclid`, `gbraid`, `wbraid`, `fbclid`, `_fbc`, `_fbp`), conversion forwarding and customer matching remain pending. This feature sends nothing to Google or Meta. See the [implementation plan](ADS_IMPLEMENTATION_PLAN.md).

## Upgrade

Apply D1 migration `0028_ad_attribution_dimensions.sql` or PostgreSQL migration `0016_ad_attribution_dimensions.sql` before running this version. The normal build generates `/script.js` from `packages/client`. Existing tracker calls and version-1/version-2 events remain valid.

## Tag ad links

| Query parameter | Value |
| --- | --- |
| `yaap_ad_provider` | `google` or `meta` |
| `yaap_ad_campaign` | Required campaign ID |
| `yaap_ad_account` | Optional account ID |
| `yaap_ad_group` | Optional Google ad-group / Meta ad-set ID |
| `yaap_ad_id` | Optional ad ID |

IDs are strings of 1–32 decimal digits, preserving leading zeros and large values. Do not put names, emails or customer identifiers here. The tracker omits invalid optional IDs; an invalid provider or campaign prevents ad-context capture. The server strictly validates the complete envelope.

Keep `utm_source`, `utm_medium`, and `utm_campaign` for ordinary source/campaign reports. Ad IDs are separate dimensions and do not change those report definitions. Example Google Ads **final URL suffix**:

```text
utm_source=google&utm_medium=cpc&utm_campaign=spring&yaap_ad_provider=google&yaap_ad_account=1234567890&yaap_ad_campaign={campaignid}&yaap_ad_group={adgroupid}&yaap_ad_id={creative}
```

Replace the example account and label. Google substitutes its supported ValueTrack IDs; coverage depends on the ad format. [Google ValueTrack documentation](https://support.google.com/google-ads/answer/6305348?hl=en).

Meta links accept the same Yaap fields with actual numeric campaign, ad-set and ad IDs. Automated Meta URL-macro setup remains part of connector verification. This release neither configures ads nor infers paid traffic from a Facebook referrer or `fbclid`.

## Consent-manager setup

Advertising dimensions default off, even with analytics identifiers enabled. `setConsent(true)` remains only the legacy identifier toggle. For a script installation, start with `data-tracking="paused"` and `data-identifiers="false"`, then apply the choices supplied by your consent manager:

```ts
const analytics = window.osAnalytics;
analytics?.setIdentifiers(true); // Only when your analytics policy permits this.
analytics?.setAdvertisingConsent({
  storage: "granted",
  userData: "denied",
  personalization: "denied",
  policyVersion: "2026-09",
});
analytics?.resume(); // The first permitted pageview captures eligible ad context.
```

The npm client also accepts `advertisingConsent` in `init(...)`. Statuses are `granted`, `denied` or `unknown`; the policy version is 1–64 letters, digits, underscores, periods or hyphens. Invalid input throws `TypeError` without changing state. The setter does not emit another pageview or retroactively amend earlier events; apply choices before the landing pageview.

Only `storage: "granted"`, together with enabled identifiers and collection, enables this reporting slice. `userData` and `personalization` are reserved runtime choices; there is no exporter yet. Stored `ad_consent_policy` is the site's reported capture policy, **not a verified consent receipt or permission for future exports**. A durable consent/withdrawal ledger is still required before forwarding.

On withdrawal, call `setAdvertisingConsent` with denied statuses. It clears the tab's ad context and strips it from pending retries; analytics may continue under its separate controls. Already received events cannot be recalled through the SDK. Restore choices on each page load and propagate changes to every active tab through your consent manager.

## Context and payment behavior

- Site-specific `sessionStorage` holds only reporting dimensions, a random context ID, original capture timestamp, policy version and visitor linkage. Raw click identifiers and ad cookies are not read or stored.
- Context carries through same-tab navigation/reloads for up to 30 minutes from capture, with a 30-minute inactivity bound. A different explicit set of ad dimensions replaces it. A new UTM campaign or initial external referral without ad dimensions clears it. This is reporting context, not a count of unique ad clicks: identical-dimension clicks can share context.
- The stored analytics visitor must match. Blocked storage or disabled identifiers leaves ad context absent while aggregate analytics remains available. Paused/prerendered pages do not capture it. A policy change clears old context; granting again in the same document does not resurrect the withdrawn landing.
- The 4,096-byte request limit remains. Optional ad metadata is omitted if it would exceed that limit. Ingestion allows five minutes of clock/transit tolerance; queued payloads validate against their original ingestion timestamp.
- Checkout uses the existing [visitor handoff](PAYMENTS.md#consent-and-checkout). Payment attribution selects identified pageviews under the captured first-touch/last-non-direct policy. Explicit ad context qualifies as non-direct even without source labels. Custom events alone do not create an attribution landing page.
- New payment snapshots preserve medium and ad dimensions. Finalized snapshots are never reopened; historical unrecorded fields stay null. Missing identity stays unattributed. Refunds retain attribution while updating net revenue.
- Ad event fields expire with raw events; saved reporting dimensions expire with payments. The browser's 30-minute context lifetime does not prevent later payment linkage to retained history inside the payment's lookback.

Campaign totals group by platform, account, campaign ID and currency. Missing account IDs display **Account not recorded**. Supply account IDs when tracking multiple accounts to avoid combining identical campaign identifiers. Submitted IDs are not independently verified with Google/Meta. No campaign-name import, spend, ROAS or platform-claimed conversion count is provided yet.

Existing payment report/API/MCP reads include `medium`, `adProvider`, `adAccountId`, `adCampaignId`, `adGroupId`, `adId`, `adTouchId` and `adTouchedAt`, with null for unrecorded values. General ad-dimension filters and spend reports are follow-up work.
