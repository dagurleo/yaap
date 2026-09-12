import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { createContext, runInContext } from "node:vm";

import { build } from "esbuild";

const moduleEntry = process.env.YAAP_CLIENT_ENTRY === "module";
const source = moduleEntry
  ? (
      await build({
        entryPoints: ["dist/index.js"],
        bundle: true,
        format: "iife",
        globalName: "YaapClient",
        write: false,
      })
    ).outputFiles[0].text
  : await readFile("dist/script.js", "utf8");
const flush = async () => {
  for (let i = 0; i < 8; i++)
    await new Promise((resolve) => setTimeout(resolve, 1));
};

test("custom properties preserve types and are captured once across retries", async () => {
  const b = browser({
    identifiers: false,
    fetcher: (n) => ({ ok: n !== 2, status: n === 2 ? 503 : 202 }),
  });
  await flush();
  const properties = {
    plan: "pro",
    seats: 3,
    trial: false,
    empty: "",
    unicode: "日本語",
  };
  const pending = b.ctx.osAnalytics.track("signup", properties);
  properties.plan = "changed";
  assert.equal(await pending, true);
  const events = b.sent.filter((row) => row.body.name === "signup");
  assert.equal(events.length, 2);
  assert.deepEqual(events[0].body, events[1].body);
  assert.deepEqual(events[0].body.properties, {
    plan: "pro",
    seats: 3,
    trial: false,
    empty: "",
    unicode: "日本語",
  });
  assert.equal(events[0].body.visitorId, undefined);
  assert.equal(b.sent[0].body.properties, undefined);
  assert.equal(await b.ctx.osAnalytics.track("legacy"), true);
  assert.equal(b.sent.at(-1).body.properties, undefined);
  b.ctx.osAnalytics.pause();
  const before = b.sent.length;
  assert.equal(await b.ctx.osAnalytics.track("paused", { plan: "pro" }), false);
  assert.equal(b.sent.length, before);
});

test("tracker rejects invalid properties before issuing requests", async () => {
  const b = browser();
  await flush();
  const before = b.sent.length;
  for (const properties of [
    null,
    [],
    "text",
    { nested: {} },
    { list: [] },
    { absent: null },
    { value: undefined },
    { value: "\ud800" },
    { value: "\udfff" },
    { value: Infinity },
    { value: NaN },
    { "bad.key": "x" },
    JSON.parse('{"__proto__":"x"}'),
    { constructor: "x" },
    { prototype: "x" },
    { value: "x".repeat(257) },
    { value: "line\nbreak" },
    Object.fromEntries(Array.from({ length: 21 }, (_, i) => [`key${i}`, true])),
    Object.fromEntries(
      Array.from({ length: 4 }, (_, i) => [`key${i}`, "語".repeat(256)]),
    ),
  ]) {
    assert.equal(await b.ctx.osAnalytics.track("signup", properties), false);
  }
  assert.equal(b.sent.length, before);
});
function storage() {
  const values = new Map();
  return {
    reads: 0,
    writes: 0,
    getItem(key) {
      this.reads++;
      return values.get(key) ?? null;
    },
    setItem(key, value) {
      this.writes++;
      values.set(key, value);
    },
    removeItem(key) {
      values.delete(key);
    },
    values,
  };
}
function browser({
  url = "https://site.example/",
  referrer = "",
  consent,
  identifiers,
  tracking,
  local = storage(),
  session = storage(),
  fetcher,
  prerendering = false,
  analytics,
  scriptUrl = "https://analytics.example/script.js",
  clientOptions = {},
} = {}) {
  let now = 1800000000000;
  const listeners = new Map();
  const sent = [];
  const intervals = [];
  const add = (name, fn) =>
    listeners.set(name, [...(listeners.get(name) ?? []), fn]);
  const remove = (name, fn) =>
    listeners.set(
      name,
      (listeners.get(name) ?? []).filter((item) => item !== fn),
    );
  const ctx = createContext({
    URL,
    AbortController,
    TextEncoder,
    Promise,
    Number,
    JSON,
    crypto: { randomUUID },
    navigator: { webdriver: false },
    location: new URL(url),
    localStorage: local,
    sessionStorage: session,
    Date: class extends Date {
      static now() {
        return now;
      }
    },
    document: {
      currentScript: {
        src: scriptUrl,
        dataset: {
          siteId: "site-one",
          ...(consent !== undefined
            ? { consent: consent ? "granted" : "denied" }
            : {}),
          ...(identifiers !== undefined
            ? { identifiers: String(identifiers) }
            : {}),
          ...(tracking ? { tracking } : {}),
        },
      },
      referrer,
      prerendering,
      visibilityState: "visible",
      addEventListener: add,
      removeEventListener: remove,
    },
    addEventListener: add,
    removeEventListener: remove,
    clearInterval: (id) => {
      intervals[id - 1].fn = () => {};
    },
    queueMicrotask,
    setInterval: (fn, ms) => {
      intervals.push({ fn, ms });
      return intervals.length;
    },
    setTimeout: (fn) => setTimeout(fn, 0),
    fetch: async (endpoint, options) => {
      sent.push({ endpoint, options, body: JSON.parse(options.body) });
      return fetcher ? fetcher(sent.length) : { ok: true, status: 202 };
    },
    ...(analytics ? { analytics } : {}),
  });
  ctx.window = ctx;
  ctx.history = {};
  for (const method of ["pushState", "replaceState"])
    ctx.history[method] = function (_state, _title, next) {
      if (next !== undefined) {
        const target = new URL(next, ctx.location.href);
        if (target.origin !== ctx.location.origin)
          throw new Error("Cross-origin history");
        ctx.location = target;
      }
      return "native-result";
    };
  const originalHistory = { ...ctx.history };
  const run = () => {
    runInContext(source, ctx);
    if (moduleEntry) {
      // npm initialization must work without an executing script element.
      ctx.document.currentScript = null;
      ctx.YaapClient.init({
        siteId: "site-one",
        host: "https://analytics.example",
        identifiers: identifiers !== false && consent !== false,
        tracking,
        ...clientOptions,
      });
    }
  };
  run();
  return {
    originalHistory,
    ctx,
    tick: () => intervals.forEach(({ fn }) => fn()),
    sent,
    local,
    session,
    run,
    advance: (ms) => {
      now += ms;
    },
    event: (name, props = {}) => {
      for (const fn of listeners.get(name) ?? []) fn(props);
    },
  };
}

test("SPA tracker counts path transitions once, including back/forward and bfcache", async () => {
  const b = browser();
  await flush();
  assert.deepEqual(
    b.sent.map((row) => row.body.path),
    ["/"],
  );
  assert.equal(b.ctx.history.pushState({}, "", "/pricing"), "native-result");
  b.ctx.history.replaceState({}, "", "/pricing?private=secret#anchor");
  await flush();
  assert.deepEqual(
    b.sent.map((row) => row.body.path),
    ["/", "/pricing"],
  );
  b.ctx.history.pushState({}, "", "/redirect");
  b.ctx.history.replaceState({}, "", "/done");
  await flush();
  assert.equal(b.sent.at(-1).body.path, "/done");
  assert.equal(b.sent.length, 3);
  b.ctx.location = new URL("https://site.example/pricing");
  b.event("popstate");
  await flush();
  b.ctx.location = new URL("https://site.example/done");
  b.event("popstate");
  await flush();
  assert.equal(b.sent.length, 5);
  b.event("pageshow", { persisted: false });
  await flush();
  assert.equal(b.sent.length, 5);
  b.event("pageshow", { persisted: true });
  b.event("popstate");
  await flush();
  assert.equal(b.sent.length, 6);
  b.run();
  await flush();
  assert.equal(b.sent.length, 6);
  assert.throws(() =>
    b.ctx.history.pushState({}, "", "https://elsewhere.example/"),
  );
  assert.equal(b.sent.length, 6);
});

test("custom events preserve names and sources, without query strings or arbitrary properties", async () => {
  const sdk = { other: true };
  const b = browser({
    url: "https://site.example/?utm_source=newsletter&utm_medium=email&utm_campaign=launch&token=secret",
    referrer: "https://search.example/private?email=person@example.com",
    analytics: sdk,
    identifiers: false,
  });
  await flush();
  assert.equal(b.ctx.analytics, sdk);
  assert.equal(b.sent[0].body.referrer, "https://search.example");
  b.ctx.history.pushState({}, "", "/signup");
  assert.equal(await b.ctx.osAnalytics.track("signup"), true);
  await flush();
  assert.deepEqual(
    b.sent.map((row) => row.body.name),
    ["pageview", "pageview", "signup"],
  );
  assert.equal(b.sent.at(-1).body.utmCampaign, "launch");
  assert.equal(await b.ctx.osAnalytics.track("pageview"), false);
  assert.equal(await b.ctx.osAnalytics.track("bad event"), false);
  assert.equal(await b.ctx.osAnalytics.track("email@example.com"), false);
  assert.equal(b.sent.length, 3);
  assert.ok(b.sent.every((row) => row.options.credentials === "omit"));
  assert.doesNotMatch(
    JSON.stringify(b.sent.map((row) => row.body)),
    /secret|person@|token|private/,
  );
  assert.equal(
    b.local.reads + b.local.writes + b.session.reads + b.session.writes,
    0,
  );
});

test("optional identifiers survive reload, rotate sessions, and clear when disabled", async () => {
  const b = browser({ identifiers: false });
  await flush();
  assert.equal(b.sent[0].body.visitorId, undefined);
  b.ctx.osAnalytics.setConsent(true);
  await b.ctx.osAnalytics.track("signup");
  const first = b.sent.at(-1).body;
  assert.equal(first.identityEnabled, true);
  assert.equal(first.consent, undefined);
  assert.ok(first.visitorId && first.sessionId);
  b.advance(29 * 60 * 1000);
  await b.ctx.osAnalytics.track("click");
  assert.equal(b.sent.at(-1).body.sessionId, first.sessionId);
  b.advance(30 * 60 * 1000);
  await b.ctx.osAnalytics.track("click");
  assert.notEqual(b.sent.at(-1).body.sessionId, first.sessionId);
  assert.equal(b.sent.at(-1).body.visitorId, first.visitorId);
  const reload = browser({ consent: true, local: b.local, session: storage() });
  await flush();
  assert.equal(reload.sent[0].body.visitorId, first.visitorId);
  assert.notEqual(reload.sent[0].body.sessionId, first.sessionId);
  b.ctx.osAnalytics.setConsent(false);
  await b.ctx.osAnalytics.track("click");
  assert.equal(b.local.values.size, 0);
  assert.equal(b.session.values.size, 0);
  assert.equal(b.sent.at(-1).body.visitorId, undefined);
  b.ctx.osAnalytics.setConsent(true);
  await b.ctx.osAnalytics.track("click");
  const fresh = b.sent.at(-1).body.visitorId;
  assert.notEqual(fresh, first.visitorId);
  b.advance(180 * 24 * 60 * 60 * 1000);
  await b.ctx.osAnalytics.track("click");
  assert.notEqual(b.sent.at(-1).body.visitorId, fresh);
});

test("consent storage and campaign state survive full page navigation; blocked storage falls back", async () => {
  const first = browser({
    consent: true,
    url: "https://site.example/?utm_source=mail&utm_campaign=spring",
  });
  await flush();
  const second = browser({
    consent: true,
    url: "https://site.example/pricing",
    referrer: "https://site.example/",
    local: first.local,
    session: first.session,
  });
  await flush();
  assert.equal(second.sent[0].body.sessionId, first.sent[0].body.sessionId);
  assert.equal(second.sent[0].body.utmSource, "mail");
  assert.equal(second.sent[0].body.utmCampaign, "spring");
  const badStorage = {
    getItem() {
      throw new Error("Blocked");
    },
    setItem() {
      throw new Error("Blocked");
    },
    removeItem() {
      throw new Error("Blocked");
    },
  };
  const blocked = browser({ consent: true, local: badStorage });
  await flush();
  assert.equal(blocked.sent[0].body.visitorId, undefined);
  assert.equal(blocked.sent.length, 1);
  assert.doesNotThrow(() => blocked.ctx.osAnalytics.setConsent(false));
});

test("retries keep the same event ID, stop after three attempts, and strip withdrawn identity", async () => {
  const b = browser({
    consent: true,
    fetcher: (attempt) =>
      attempt === 1 ? { ok: false, status: 503 } : { ok: true, status: 202 },
  });
  b.ctx.osAnalytics.setConsent(false);
  await flush();
  assert.equal(b.sent.length, 2);
  assert.equal(b.sent[0].body.id, b.sent[1].body.id);
  assert.ok(b.sent[0].body.visitorId);
  assert.equal(b.sent[1].body.visitorId, undefined);
  const failed = browser({
    fetcher: () => {
      throw new Error("Offline");
    },
  });
  await flush();
  assert.equal(failed.sent.length, 3);
  const rejected = browser({ fetcher: () => ({ ok: false, status: 400 }) });
  await flush();
  assert.equal(rejected.sent.length, 1);
  const billingPaused = browser({
    fetcher: () => ({ ok: false, status: 409 }),
  });
  await flush();
  assert.equal(billingPaused.sent.length, 1);
});

test("prerendered pages wait for activation and duplicate initialization stays inert", async () => {
  const b = browser({ prerendering: true });
  assert.equal(await b.ctx.osAnalytics.track("signup"), false);
  await flush();
  assert.equal(b.sent.length, 0);
  b.ctx.history.pushState({}, "", "/ready");
  await flush();
  assert.equal(b.sent.length, 0);
  b.ctx.document.prerendering = false;
  b.event("prerenderingchange");
  await flush();
  assert.equal(b.sent.length, 1);
  assert.equal(b.sent[0].body.path, "/ready");
  b.run();
  await flush();
  assert.equal(b.sent.length, 1);
});

test("checkout identity stays unavailable while identifiers are disabled", async () => {
  const b = browser({ identifiers: false });
  await flush();
  assert.equal(b.ctx.osAnalytics.getVisitorId(), null);
  assert.equal(b.local.reads, 0);
  assert.equal(b.local.writes, 0);
  b.ctx.osAnalytics.setConsent(true);
  const id = b.ctx.osAnalytics.getVisitorId();
  assert.match(id, /^[a-f0-9-]{36}$/);
  await b.ctx.osAnalytics.track("checkout");
  assert.equal(b.sent.at(-1).body.visitorId, id);
  b.ctx.osAnalytics.setConsent(false);
  assert.equal(b.ctx.osAnalytics.getVisitorId(), null);
});

test("presence keeps visible readers online without extra events; stops when hidden or consent is withdrawn", async () => {
  const b = browser({ consent: true });
  await flush();
  const first = b.sent[0].body;
  assert.equal(first.visible, true);
  b.advance(20_000);
  b.tick();
  await flush();
  assert.equal(b.sent.length, 2);
  assert.equal(b.sent[1].body.presence, true);
  assert.equal(b.sent[1].body.visitorId, first.visitorId);
  assert.equal(b.sent[1].body.sessionId, first.sessionId);
  b.ctx.document.visibilityState = "hidden";
  b.advance(20_000);
  b.tick();
  await flush();
  assert.equal(b.sent.length, 2);
  b.ctx.document.visibilityState = "visible";
  b.event("visibilitychange");
  await flush();
  assert.equal(b.sent.length, 3);
  b.ctx.osAnalytics.setConsent(false);
  b.advance(20_000);
  b.tick();
  await flush();
  assert.equal(b.sent.length, 3);
  const anonymous = browser({ identifiers: false });
  anonymous.advance(20_000);
  anonymous.tick();
  await flush();
  assert.equal(anonymous.sent.length, 1);
  assert.equal(anonymous.local.reads, 0);
  const prerendered = browser({ consent: true, prerendering: true });
  prerendered.advance(20_000);
  prerendered.tick();
  await flush();
  assert.equal(prerendered.sent.length, 0);
});

test("default snippet includes identifiers without asserting consent", async () => {
  const b = browser();
  await flush();
  assert.ok(b.sent[0].body.visitorId && b.sent[0].body.sessionId);
  assert.equal(b.sent[0].body.identityEnabled, true);
  assert.equal(b.sent[0].body.consent, undefined);
  assert.equal(b.ctx.osAnalytics.getVisitorId(), b.sent[0].body.visitorId);
  const reload = browser({ local: b.local, session: b.session });
  await flush();
  assert.equal(reload.sent[0].body.visitorId, b.sent[0].body.visitorId);
  assert.equal(reload.sent[0].body.sessionId, b.sent[0].body.sessionId);
});

test("paused initialization blocks all collection and storage until resumed", async () => {
  const b = browser({ tracking: "paused" });
  assert.equal(b.ctx.osAnalytics.getVisitorId(), null);
  assert.equal(await b.ctx.osAnalytics.track("signup"), false);
  b.ctx.history.pushState({}, "", "/while-paused");
  b.event("pageshow", { persisted: true });
  b.advance(20_000);
  b.tick();
  b.event("visibilitychange");
  await flush();
  assert.equal(b.sent.length, 0);
  assert.equal(
    b.local.reads + b.local.writes + b.session.reads + b.session.writes,
    0,
  );
  b.ctx.osAnalytics.resume();
  b.ctx.osAnalytics.resume();
  await flush();
  assert.equal(b.sent.length, 1);
  assert.equal(b.sent[0].body.path, "/while-paused");
  assert.ok(b.sent[0].body.visitorId);
  b.ctx.osAnalytics.pause();
  assert.equal(await b.ctx.osAnalytics.track("paused-event"), false);
  assert.equal(b.ctx.osAnalytics.getVisitorId(), null);
  b.ctx.history.pushState({}, "", "/next");
  await flush();
  b.ctx.osAnalytics.setIdentifiers(false);
  b.ctx.osAnalytics.resume();
  await flush();
  assert.equal(b.sent.length, 2);
  assert.equal(b.sent[1].body.path, "/next");
  assert.equal(b.sent[1].body.visitorId, undefined);
});

test("pause aborts pending requests and cancels old retries even after resume", async () => {
  const b = browser({ fetcher: () => ({ ok: false, status: 503 }) });
  const originalId = b.sent[0].body.id;
  b.ctx.osAnalytics.pause();
  assert.equal(b.sent[0].options.signal.aborted, true);
  b.ctx.osAnalytics.resume();
  await flush();
  assert.equal(b.sent.filter((row) => row.body.id === originalId).length, 1);
  assert.equal(b.sent.length, 4); // old attempt + three attempts for the resumed pageview
  b.ctx.osAnalytics.pause();
});

test("identifier changes strip stale retry IDs and legacy opt-outs remain respected", async () => {
  const b = browser({
    fetcher: (attempt) =>
      attempt === 1 ? { ok: false, status: 503 } : { ok: true, status: 202 },
  });
  b.ctx.osAnalytics.setIdentifiers(false);
  b.ctx.osAnalytics.setIdentifiers(true);
  await flush();
  assert.equal(b.sent.length, 2);
  assert.equal(b.sent[1].body.visitorId, undefined);
  assert.equal(b.sent[1].body.identityEnabled, undefined);
  const legacy = browser({ consent: false });
  const explicit = browser({ consent: true, identifiers: false });
  await flush();
  for (const item of [legacy, explicit]) {
    assert.equal(item.sent[0].body.visitorId, undefined);
    assert.equal(item.local.reads + item.local.writes, 0);
  }
});

test("destroy removes hooks and timers, cancels retries, and allows initialization again", async () => {
  const b = browser({ fetcher: () => ({ ok: false, status: 503 }) });
  const api = b.ctx.osAnalytics;
  b.ctx.history.pushState({}, "", "/queued");
  api.destroy();
  api.destroy();
  api.resume();
  api.setIdentifiers(false);
  assert.equal(await api.track("after_destroy"), false);
  assert.equal(api.getVisitorId(), null);
  assert.equal(b.ctx.osAnalytics, undefined);
  assert.equal(b.ctx.analytics, undefined);
  assert.equal(b.ctx.history.pushState, b.originalHistory.pushState);
  assert.equal(b.ctx.history.replaceState, b.originalHistory.replaceState);
  assert.equal(b.sent[0].options.signal.aborted, true);
  b.advance(20_000);
  b.tick();
  b.event("visibilitychange");
  b.event("pageshow", { persisted: true });
  b.event("popstate");
  await flush();
  assert.equal(b.sent.length, 1);
  b.run();
  await flush();
  assert.equal(b.sent.length, 4);
  assert.notEqual(b.ctx.osAnalytics, api);
  b.ctx.osAnalytics.destroy();
});

test("destroy preserves third-party globals and subsequently installed history wrappers", async () => {
  const sdk = { other: true };
  const b = browser({ analytics: sdk });
  const wrapper = () => {};
  b.ctx.history.pushState = wrapper;
  b.ctx.osAnalytics.destroy();
  assert.equal(b.ctx.history.pushState, wrapper);
  assert.equal(b.ctx.analytics, sdk);
});

if (moduleEntry) {
  test("npm initialization defaults to the local YAAP server when host is omitted", async () => {
    const b = browser({ clientOptions: { host: undefined } });
    await flush();
    assert.equal(b.sent.length, 1);
    assert.equal(b.sent[0].endpoint, "http://localhost:8790/ingest");
    assert.equal(b.sent[0].body.siteId, "site-one");
    assert.equal(await b.ctx.osAnalytics.track("signup"), true);
    assert.equal(b.sent.at(-1).endpoint, "http://localhost:8790/ingest");
    b.ctx.osAnalytics.destroy();
  });

  test("npm initialization validates configuration and returns the existing tracker", () => {
    const b = browser();
    const api = b.ctx.osAnalytics;
    assert.equal(
      b.ctx.YaapClient.init({
        siteId: "site-one",
        host: "https://analytics.example",
      }),
      api,
    );
    for (const options of [
      { siteId: "", host: "https://analytics.example" },
      { siteId: "site-one", host: "javascript:alert(1)" },
      { siteId: "site-one", host: "https://user:secret@analytics.example" },
      { siteId: "site-one", host: "/relative" },
    ])
      assert.throws(() => b.ctx.YaapClient.init(options));
    api.destroy();
  });
}

test("self-hosted collection uses the configured server instead of the default", async () => {
  const b = browser({
    scriptUrl: "https://self-hosted.example:8443/script.js",
    clientOptions: { host: "https://self-hosted.example:8443" },
  });
  await flush();
  assert.equal(await b.ctx.osAnalytics.track("signup"), true);
  assert.equal(b.sent.length, 2);
  assert.ok(
    b.sent.every(
      (row) => row.endpoint === "https://self-hosted.example:8443/ingest",
    ),
  );
  b.ctx.osAnalytics.destroy();
});
