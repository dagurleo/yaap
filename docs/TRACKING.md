# Tracking and identity

For npm applications, use the typed [`@yaap/client` package](../packages/client/README.md). Its `init({ siteId })` API uses the same tracker as `/script.js`, with safe server-side imports and `destroy()` for lifecycle cleanup. The npm server default is `https://yaap.sh`; self-hosted installs pass `host: "https://analytics.example.com"`, and local development uses `host: "http://localhost:8790"`. Script tags always send events to the origin they load from. Install the client with `npm install @yaap/client`; Website settings → Installation → npm provides initialization code for your site and server. Existing snippets and browser APIs below continue to work.


Existing snippets automatically serve the new tracker after a page reload. New events use version 2; the ingest endpoint and queue consumer continue accepting version 1. Apply all checked-in migrations for the selected backend before running updated code; see [database migrations](DATABASES.md).

The tracker wraps `history.pushState` and `history.replaceState`, listens for `popstate`, and handles pages restored from the back/forward cache. Same-turn history updates are coalesced to the final pathname. Repeated initialization, query-only changes, and hash-only changes do not create extra pageviews. Hash-based routers are not supported. Prerendered documents wait until activation.

Call the API in client event handlers after the script has loaded:

```ts
// After a successful signup, rather than just clicking submit:
void window.osAnalytics?.track("signup");
```

`track` returns a Promise<boolean> indicating HTTP acceptance, not confirmed database persistence. Names are 1–64 letters, numbers, underscores, periods, or hyphens. `pageview` is reserved for automatic tracking. Pass an optional property object as the second argument. See [event properties](EVENTS.md) for validation and limits. Application user IDs are not accepted. `window.analytics` is an alias only if another SDK has not already claimed it; `window.osAnalytics` is the stable namespace. Install one snippet per document.

For TypeScript sites, add an ambient declaration:

```ts
export {};
declare global {
  interface Window {
    osAnalytics?: {
      track(name: string, properties?: Record<string, string | number | boolean>): Promise<boolean>;
      pause(): void;
      resume(): void;
      setIdentifiers(enabled: boolean): void;
      getVisitorId(): string | null;
      setConsent(granted: boolean): void; // Legacy alias for setIdentifiers
    };
  }
}
```

**Full analytics is enabled by default.** The standard snippet collects pageviews with visitor/session identifiers, enabling returning visitors, journeys, live presence, and attribution. This is a tracking configuration, not a record of visitor consent. The implementer controls when the script may collect events and use identifiers.

For anonymous analytics, add `data-identifiers="false"` to the script. It sends aggregate events without accessing visitor/session storage. For a consent-gated installation, configure the script **before it runs**:

```html
<script defer src="https://YOUR_ANALYTICS_HOST/script.js"
  data-site-id="YOUR_SITE_ID"
  data-tracking="paused"
  data-identifiers="false"></script>
```

Then connect your consent manager after the script has loaded:

```ts
// Accepted: enable identifiers and start collection.
window.osAnalytics?.setIdentifiers(true);
window.osAnalytics?.resume();

// Rejected or withdrawn: stop collection and clear this site's stored IDs.
window.osAnalytics?.pause();
window.osAnalytics?.setIdentifiers(false);
```

`pause()` blocks automatic pageviews, custom events, live-presence heartbeats, and identifier lookups. It aborts outstanding fetches and cancels retries; it cannot recall data that has already reached the server. It retains stored IDs unless you also call `setIdentifiers(false)`. `resume()` records the current page once, without replaying activity from the paused period. Repeated resume calls are harmless. `track()` returns false and `getVisitorId()` returns null while paused.

`setIdentifiers(false)` clears this site's visitor/session storage, stops identified presence, and strips identity from pending event retries. Aggregate events continue if collection is enabled. `setIdentifiers(true)` enables identifiers for future events; it does not identify previously anonymous events or resume collection. Browser settings are not persisted by the SDK: restore your desired mode on every page load and notify each active tab when a choice changes.

A visitor is a random ID stored under a site-specific localStorage key for 180 days from creation. It represents a browser storage profile, not a verified person. A session is a random ID in that tab's sessionStorage, renewed after 30 minutes without a tracked event. Browser tab duplication may clone sessionStorage. Clearing storage or disabling identifiers breaks continuity. Blocked storage falls back to aggregate events. IDs are HMAC-hashed with the site ID and stable server secret before queueing; raw browser IDs are not stored in the analytics database.

The dashboard counts distinct visitor and session IDs over all events in the selected range. Anonymous events still count toward event/pageview totals but cannot contribute to visitor journeys or identity-based funnels. Identity coverage is displayed separately.

**Compatibility:** `setConsent(boolean)` remains an alias for `setIdentifiers(boolean)`; it does not stop collection. Explicit legacy `data-consent="granted"` enables identifiers, and other explicit `data-consent` values disable them. `data-identifiers="false"` takes precedence. A snippet with neither attribute now uses full analytics. Existing installations that need anonymous collection must add `data-identifiers="false"` before adopting this tracker. The new payload uses `identityEnabled: true`; legacy `consent: true` payloads remain accepted as an identity switch, never as proof of consent.

## Source and campaign definitions

The tracker accepts `utm_source`, `utm_medium`, and `utm_campaign` labels up to 120 characters (letters, numbers, spaces, `_`, `-`, `.`, `~`). It does not collect `utm_term`, `utm_content`, arbitrary query parameters. Custom properties are collected only when explicitly supplied to `track`. Referrers are reduced to external hostnames on the server; credentials, referrer paths, queries, and fragments are never persisted. Do not put personal details in event names, campaign labels, or URL paths.

Source reports prefer a supplied UTM source, then an external referrer, then **Direct / unknown**. Referrer information may be unavailable because of browser policy. Version-1 historical events are labeled **Not recorded**, not direct traffic. Referrer and campaign tables are overlapping breakdowns of pageviews, so their totals should not be added together.

Within an SPA document, landing context carries through navigation. A new explicit campaign replaces campaign context. With identifiers enabled, context also persists through full page loads in the tab session; without identifiers it is kept only in memory for the current document. This is event-context attribution, not a cross-session revenue attribution model.

Custom event counts are separate from pageviews. Their visitor/session counts include only identified events; event totals are not conversion rates. Each browser event has a stable UUID across up to three delivery attempts (network errors, 429, or 5xx), and queue replay remains idempotent. Delivery retries are in-memory only, with at most 20 pending events; closing a page, blocked requests, or network failure can still lose events.

See [website settings](settings.md) for allowed origins and exclusions, [goals and funnels](CONVERSIONS.md) for conversion definitions, and [payments](PAYMENTS.md) for checkout identity handoff.
