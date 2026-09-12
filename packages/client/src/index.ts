import type { Analytics, AnalyticsOptions, EventProperties } from "./types.js";

// Keep this endpoint reachable for clients installed from older package versions.
export const DEFAULT_HOST = "https://yaap.sh";

/** Start one tracker per page. Importing this module does not access browser globals. */
export function init(options: AnalyticsOptions): Analytics | undefined {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  const page = document as Document & { prerendering?: boolean };
  if (navigator.webdriver) return;
  const { siteId } = options;
  if (typeof siteId !== "string" || !siteId.trim())
    throw new TypeError("A non-empty siteId is required");
  const host = new URL(
    options.host === undefined ? DEFAULT_HOST : options.host,
  );
  if (
    !["https:", "http:"].includes(host.protocol) ||
    host.username ||
    host.password
  )
    throw new TypeError("host must be an HTTP(S) URL without credentials");
  const endpoint = new URL("/ingest", host).href;
  const browser = window as Window & {
    osAnalytics?: Analytics;
    analytics?: unknown;
  };
  if (browser.osAnalytics) return browser.osAnalytics;
  const namePattern = /^[a-zA-Z0-9_.-]{1,64}$/;
  let lastPath: string | undefined;
  let destroyed = false;
  let scheduled = false;
  let pending = 0;

  function campaign(value: unknown) {
    return typeof value === "string" &&
      value.length <= 120 &&
      /^[a-zA-Z0-9 _~.\-]+$/.test(value)
      ? value.trim() || null
      : null;
  }
  function currentCampaign() {
    const query = new URL(location.href).searchParams;
    return {
      utmSource: campaign(query.get("utm_source")),
      utmMedium: campaign(query.get("utm_medium")),
      utmCampaign: campaign(query.get("utm_campaign")),
    };
  }
  function externalReferrer(value: unknown) {
    if (typeof value !== "string") return null;
    try {
      const url = new URL(value);
      if (
        ["http:", "https:"].includes(url.protocol) &&
        url.origin !== location.origin &&
        !url.username &&
        !url.password
      )
        return url.origin;
    } catch {}
    return null;
  }
  const referrer = externalReferrer(document.referrer);
  let attribution = { referrer, ...currentCampaign() };
  function updateAttribution() {
    const next = currentCampaign();
    if (next.utmSource || next.utmMedium || next.utmCampaign)
      attribution = { ...attribution, ...next };
  }

  const visitorKey = `os-analytics:${siteId}:visitor`;
  const sessionKey = `os-analytics:${siteId}:session`;
  const SESSION_GAP = 30 * 60 * 1000;
  const VISITOR_TTL = 180 * 24 * 60 * 60 * 1000;
  const uuidPattern =
    /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
  // Identifier settings do not assert visitor consent.
  let identifiers = options.identifiers !== false;
  let collecting = options.tracking !== "paused";
  let identityGeneration = 0;
  let collectionGeneration = 0;
  const requests = new Set<AbortController>();
  function read(storage: Storage, key: string): Record<string, unknown> | null {
    try {
      const raw: unknown = JSON.parse(storage.getItem(key) ?? "null");
      return raw && typeof raw === "object" && !Array.isArray(raw)
        ? (raw as Record<string, unknown>)
        : null;
    } catch {
      return null;
    }
  }
  function identity(): {
    identityEnabled?: true;
    visitorId?: string;
    sessionId?: string;
  } {
    if (!collecting || !identifiers) return {};
    try {
      const now = Date.now();
      let visitor = read(localStorage, visitorKey);
      if (
        !visitor ||
        typeof visitor.id !== "string" ||
        !uuidPattern.test(visitor.id) ||
        typeof visitor.expiresAt !== "number" ||
        !Number.isFinite(visitor.expiresAt) ||
        visitor.expiresAt <= now ||
        visitor.expiresAt > now + VISITOR_TTL
      ) {
        visitor = { id: crypto.randomUUID(), expiresAt: now + VISITOR_TTL };
      }
      localStorage.setItem(visitorKey, JSON.stringify(visitor));
      let session = read(sessionStorage, sessionKey);
      if (
        !session ||
        typeof session.id !== "string" ||
        !uuidPattern.test(session.id) ||
        session.visitorId !== visitor.id ||
        typeof session.lastAt !== "number" ||
        !Number.isFinite(session.lastAt) ||
        now - session.lastAt >= SESSION_GAP ||
        session.lastAt > now
      ) {
        session = {
          id: crypto.randomUUID(),
          visitorId: visitor.id,
          lastAt: now,
          attribution,
        };
      }
      // Persist the landing source for full page loads within an identified tab session.
      // A fresh explicit campaign replaces it; direct/internal navigation retains it.
      const explicit = currentCampaign();
      if (
        explicit.utmSource ||
        explicit.utmMedium ||
        explicit.utmCampaign ||
        referrer
      )
        session.attribution = attribution;
      else if (session.attribution && typeof session.attribution === "object") {
        const stored = session.attribution as Record<string, unknown>;
        attribution = {
          referrer: externalReferrer(stored.referrer),
          utmSource: campaign(stored.utmSource),
          utmMedium: campaign(stored.utmMedium),
          utmCampaign: campaign(stored.utmCampaign),
        };
      }
      session.lastAt = now;
      sessionStorage.setItem(sessionKey, JSON.stringify(session));
      return {
        identityEnabled: true,
        visitorId: visitor.id as string,
        sessionId: session.id as string,
      };
    } catch {
      return {};
    } // Storage disabled: keep aggregate tracking functional.
  }
  function setIdentifiers(enabled: boolean) {
    if (destroyed) return;
    identifiers = enabled === true;
    identityGeneration++;
    if (!identifiers) {
      try {
        localStorage.removeItem(visitorKey);
      } catch {}
      try {
        sessionStorage.removeItem(sessionKey);
      } catch {}
      attribution = { referrer, ...currentCampaign() };
    }
  }
  function pause() {
    if (!collecting) return;
    collecting = false;
    collectionGeneration++;
    lastPath = undefined;
    for (const controller of requests) controller.abort();
  }
  function resume() {
    if (destroyed || collecting) return;
    collecting = true;
    // Start with the current page; never replay activity from the paused period.
    attribution = { referrer, ...currentCampaign() };
    schedulePageview();
  }

  async function send(
    name: string,
    presence = false,
    properties?: EventProperties,
  ) {
    if (presence && (!identifiers || document.visibilityState !== "visible"))
      return false;
    if (!collecting || page.prerendering || pending >= 20) return false;
    const path = location.pathname;
    if (!path.startsWith("/") || path.startsWith("//") || path.length > 1024)
      return false;
    let event;
    try {
      const ids = identity();
      if (presence && !ids.visitorId) return false;
      event = {
        version: 2,
        id: crypto.randomUUID(),
        siteId,
        name,
        ...(properties ? { properties } : {}),
        path,
        visible: document.visibilityState === "visible",
        ...(presence ? { presence: true } : {}),
        ...attribution,
        ...ids,
      };
    } catch {
      return false;
    }
    const generation = identityGeneration;
    const collection = collectionGeneration;
    const controller = new AbortController();
    requests.add(controller);
    pending++;
    try {
      for (let attempt = 0; attempt < (presence ? 1 : 3); attempt++) {
        if (!collecting || collection !== collectionGeneration) return false;
        try {
          if (
            presence &&
            (!identifiers ||
              generation !== identityGeneration ||
              document.visibilityState !== "visible")
          )
            return false;
          if (!identifiers || generation !== identityGeneration) {
            delete event.visitorId;
            delete event.sessionId;
            delete event.identityEnabled;
          }
          const response = await fetch(endpoint, {
            signal: controller.signal,
            method: "POST",
            credentials: "omit",
            keepalive: true,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(event),
          });
          if (response.ok) return true;
          if (response.status !== 429 && response.status < 500) return false;
        } catch {}
        if (!presence && attempt < 2)
          await new Promise((resolve) =>
            setTimeout(resolve, [250, 1000][attempt]),
          );
      }
      return false;
    } finally {
      requests.delete(controller);
      pending--;
    }
  }

  function pageview() {
    if (!collecting || page.prerendering) return;
    updateAttribution();
    if (lastPath === location.pathname) return;
    lastPath = location.pathname;
    void send("pageview");
  }
  function schedulePageview() {
    if (scheduled) return;
    scheduled = true;
    // Coalesce same-turn redirects and framework history updates to the final path.
    queueMicrotask(() => {
      scheduled = false;
      pageview();
    });
  }
  // Poll only visible, identified pages; background tabs naturally expire.
  let lastHeartbeat = 0;
  function heartbeat() {
    if (
      Date.now() - lastHeartbeat < 15_000 ||
      !collecting ||
      !identifiers ||
      document.visibilityState !== "visible" ||
      page.prerendering
    )
      return;
    lastHeartbeat = Date.now();
    void send("presence", true);
  }
  const interval = setInterval(heartbeat, 20_000);
  document.addEventListener("visibilitychange", heartbeat);
  const api: Analytics = {
    destroy,
    pause,
    resume,
    setIdentifiers,
    // Backwards-compatible alias: only controls identifiers, not collection.
    setConsent: setIdentifiers,
    getVisitorId() {
      if (page.prerendering) return null;
      return identity().visitorId ?? null;
    },
    track(name, properties) {
      if (
        typeof name !== "string" ||
        !namePattern.test(name) ||
        name === "pageview"
      )
        return Promise.resolve(false);
      let captured;
      try {
        if (properties !== undefined) {
          if (
            !properties ||
            typeof properties !== "object" ||
            Array.isArray(properties)
          )
            return Promise.resolve(false);
          const entries = Object.entries(properties);
          if (
            entries.length > 20 ||
            entries.some(
              ([key, value]) =>
                !/^[a-zA-Z][a-zA-Z0-9_]{0,63}$/.test(key) ||
                ["constructor", "prototype", "__proto__"].includes(key) ||
                !(
                  (typeof value === "string" &&
                    value.length <= 256 &&
                    !/[\x00-\x1f\x7f]/.test(value) &&
                    !/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(
                      value,
                    )) ||
                  (typeof value === "number" && Number.isFinite(value)) ||
                  typeof value === "boolean"
                ),
            )
          )
            return Promise.resolve(false);
          captured = Object.fromEntries(entries);
          if (new TextEncoder().encode(JSON.stringify(captured)).length > 2048)
            return Promise.resolve(false);
        }
      } catch {
        return Promise.resolve(false);
      }
      // Capture a pending route pageview first, so the custom event follows it.
      pageview();
      return send(name, false, captured);
    },
  };
  browser.osAnalytics = api;
  // Keep an existing third-party analytics SDK intact.
  if (!browser.analytics) browser.analytics = api;

  const restoreHistory: (() => void)[] = [];
  for (const method of ["pushState", "replaceState"] as const) {
    const original = history[method];
    const wrapped: History[typeof method] = function (this: History, ...args) {
      const result = original.apply(this, args);
      schedulePageview();
      return result;
    };
    history[method] = wrapped;
    restoreHistory.push(() => {
      if (history[method] === wrapped) history[method] = original;
    });
  }
  function pageshow(event: PageTransitionEvent) {
    if (event.persisted) {
      lastPath = undefined;
      schedulePageview();
    }
  }
  addEventListener("popstate", schedulePageview);
  addEventListener("pageshow", pageshow);
  if (page.prerendering)
    document.addEventListener("prerenderingchange", schedulePageview, {
      once: true,
    });
  else pageview();

  function destroy() {
    if (destroyed) return;
    pause();
    destroyed = true;
    clearInterval(interval);
    document.removeEventListener("visibilitychange", heartbeat);
    document.removeEventListener("prerenderingchange", schedulePageview);
    removeEventListener("popstate", schedulePageview);
    removeEventListener("pageshow", pageshow);
    for (const restore of restoreHistory) restore();
    if (browser.osAnalytics === api) delete browser.osAnalytics;
    if (browser.analytics === api) delete browser.analytics;
  }
  return api;
}

export type { Analytics, AnalyticsOptions, EventProperties } from "./types.js";
