# @yaap/client

The browser tracker for [YAAP](https://github.com/dagurleo/yaap). This package and your installation's `/script.js` use the same implementation. It has no runtime dependencies.

Install from npm:

```sh
npm install @yaap/client
```

```ts
import { init } from "@yaap/client";

const analytics = init({
  siteId: "YOUR_SITE_ID",
});

await analytics?.track("signup", { plan: "pro", seats: 3, trial: false });
```

Register your website's exact origin in YAAP first and copy its site ID. With no `host`, the npm client sends events to **`https://yaap.dagurleo.workers.dev/ingest`**. Your site ID must belong to the YAAP server you send events to.

For a self-hosted YAAP server, override `host`:

```ts
const analytics = init({
  siteId: "YOUR_SITE_ID",
  host: "https://analytics.yourcompany.com",
});
```

`host` is the YAAP server URL, including `https://` (or `http://` for local development). It is separate from the website being tracked; the browser supplies that website's origin automatically. Events go to the selected server's `/ingest` endpoint. Initialization sends a pageview and observes pathname changes automatically. Query strings and fragments do not create extra pageviews.

Imports are safe during server rendering. `init` returns `undefined` without a browser or under browser automation. Call it in the browser to start tracking. One tracker is supported per page: repeated initialization returns the existing tracker, including one installed through `/script.js`. Options from the first initialization remain in effect. Use either installation method in your application.

## Collection controls

Identifiers are enabled by default. This is a tracking setting and does not record visitor consent. To collect anonymously, pass `identifiers: false`. To wait for a visitor's choice before any collection or storage access:

```ts
const analytics = init({
  siteId: "YOUR_SITE_ID",
  host: "https://analytics.example.com",
  tracking: "paused",
});

analytics?.resume();
analytics?.pause();
analytics?.setIdentifiers(false);
```

`pause()` aborts pending requests and stops collection; `resume()` records the current page without replaying paused activity. `setIdentifiers(false)` removes stored identifiers while allowing anonymous collection. `setConsent()` is a legacy alias for `setIdentifiers()`. `getVisitorId()` returns the current browser identifier, or `null` when unavailable.

`track(name, properties?)` resolves to whether the server accepted the event. Names are 1–64 letters, digits, underscores, dots or hyphens; `pageview` is reserved. Properties accept up to 20 string, finite number or boolean values, within a 2 KiB JSON payload. Keys begin with a letter and contain up to 64 letters, digits or underscores; strings are limited to 256 characters without control characters. Invalid events resolve to `false`.

## React and other component lifecycles

Initialize once in your application's top-level browser lifecycle and release the tracker on teardown:

```tsx
import { useEffect } from "react";
import { init } from "@yaap/client";

export function Analytics() {
  useEffect(() => {
    const analytics = init({ siteId: "YOUR_SITE_ID", host: "https://analytics.example.com" });
    return () => analytics?.destroy();
  }, []);
  return null;
}
```

`destroy()` cancels collection and removes timers, event listeners and owned history hooks. Stored identifiers remain for subsequent initialization. The tracker also exposes `window.osAnalytics` and, when unoccupied, the legacy `window.analytics` alias.

## Script installation

Existing snippets continue to work without npm:

```html
<script defer src="https://analytics.example.com/script.js" data-site-id="YOUR_SITE_ID"></script>
```

The standalone build is also exported as `@yaap/client/script.js`. When hosting it elsewhere, use the npm entry with an explicit `host`; the snippet derives its ingestion origin from its own script URL.

## Local development and release

From the repository root, run `npm ci`, `npm run build:client`, and `npm run check:client`. Both entry points run through the same behavior tests. A packaging test installs the tarball in a temporary project and checks server-side imports and TypeScript consumers.

When changing the hosted service origin, update `DEFAULT_HOST` in `src/index.ts`, its type documentation, the endpoint test, and this guide. Keep previous endpoints reachable for older installed versions. Script-tag installs always use the origin of their own script URL, regardless of this npm default. For local development, pass `host: "http://localhost:8790"` explicitly.

Version this package independently in `packages/client/package.json`. When changing its version, update the matching dependency in `apps/web/package.json` and run `npm install` from the root to refresh the shared lockfile. Preview the release with `npm pack --workspace @yaap/client`; publishing is a separate, deliberate step.

See the repository's [npm release guide](https://github.com/dagurleo/yaap/blob/main/docs/NPM_RELEASE.md) for the first publish and subsequent releases.

Licensed under Elastic License 2.0; see [LICENSE.md](LICENSE.md).
