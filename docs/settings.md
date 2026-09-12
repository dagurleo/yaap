# Website settings

Settings now has linkable sections at `/app/:siteId/settings?section=general`:

- **General**: edit website name and origin; copy the public site ID; choose the reporting timezone.
- **Installation**: copy the tracking script; Script, WordPress and Shopify instructions; consent and custom-event examples.
- **Revenue**: inspect Stripe/API connection status and open payment configuration.
- **Domains & exclusions**: additional origins, allow-all domains, exact hostname exclusions, wildcard path exclusions, and bot filtering.
- **Data retention**: separate event and payment history policies.
- **Ingestion**: the existing counters, hourly activity, and retention-run status.

## Collection rules

Main and additional origins are exact origin matches (scheme, hostname, and port). Subdomains must be explicitly listed. Origins use HTTPS except local development addresses, which can use HTTP. Allow-all accepts valid HTTP(S) origins, never missing or opaque `null` origins. Browser origins are not authentication: the public website ID is not a secret.

Hostname exclusions are exact, case-insensitive hostname matches. Path exclusions match the complete path; `*` is the only wildcard. `/admin/*` matches `/admin/users`, but not `/admin`. Query strings and fragments are removed before matching. Exclusions override allowed origins and apply before events or live presence are stored. Previously collected history is unchanged.

Tracking rules and the bot toggle save atomically. Website identity and tracking mutations require an authenticated owner and scope database writes to that owner’s site. Changes to the main origin retain the website ID and existing history.

## Migration and release

`0014_website_settings.sql` adds a JSON settings column with conservative defaults: no extra origins, no wildcard allowance, and no exclusions. Apply it before deploying the code. Apply all migrations for your selected backend, not just this historical migration. See [database setup](DATABASES.md); PostgreSQL maintains a separate migration history.

Team membership, scheduled reports, alerts, managed proxies, and public dashboards are not implemented by this change.

## Tracking defaults and consent integration

Full analytics is now the default. Installation offers Full analytics, Anonymous analytics, and Wait for consent snippets. This selector edits the snippet only; the implementer must install it on their website. Anonymous adds `data-identifiers="false"`; Wait for consent also adds `data-tracking="paused"` so neither events nor identifier storage are accessed before initialization is resumed.

Use `pause()` / `resume()` to control collection and `setIdentifiers(boolean)` to independently control stored visitor/session IDs. For consent withdrawal, pause first, then disable identifiers. Restore the selected behavior on every page load. The SDK does not assert or record consent simply because tracking is enabled. Existing snippets without an explicit mode now use full tracking; add an explicit anonymous or paused configuration where required before rolling out this change.

## Reporting timezone

General settings accepts IANA timezone names (for example `Asia/Tokyo`). New websites suggest the browser timezone; existing websites remain UTC until changed. The setting applies to all reports, comparisons, displayed timestamps, exports and API date ranges. Stored timestamps remain UTC. Apply D1 migration `0020_reporting_timezone.sql` or PostgreSQL migration `0008_reporting_timezone.sql` before running this version.
