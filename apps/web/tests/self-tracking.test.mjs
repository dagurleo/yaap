import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createContext, runInContext } from "node:vm";
import { test } from "node:test";
import { build } from "esbuild";
import { fileURLToPath } from "node:url";

async function browser({
  path = "/",
  siteId = "self-site",
  production = true,
  choice,
  storedChoice,
  storageBlocked = false,
} = {}) {
  const { outputFiles } = await build({
    stdin: {
      contents: `
        import { createBrowserHistory } from "@tanstack/history";
        import { SelfTracking } from "./src/components/self-tracking";
        globalThis.testRouter = { history: createBrowserHistory({ window }) };
        export const mount = SelfTracking;
        export { setAnalyticsChoice as choose } from "./src/lib/analytics-consent";
      `,
      resolveDir: fileURLToPath(new URL("../", import.meta.url)),
    },
    bundle: true,
    format: "iife",
    globalName: "SelfTrackingTest",
    write: false,
    define: {
      "import.meta.env.PROD": JSON.stringify(production),
      "import.meta.env.VITE_YAAP_SITE_ID": JSON.stringify(siteId),
    },
    plugins: [
      {
        name: "react-lifecycle",
        setup(builder) {
          builder.onResolve(
            { filter: /^(react|@tanstack\/react-router)$/ },
            ({ path }) => ({ path, namespace: "lifecycle" }),
          );
          builder.onLoad(
            { filter: /.*/, namespace: "lifecycle" },
            ({ path }) => ({
              contents:
                path === "react"
                  ? "export const useEffect = (effect) => { globalThis.cleanup = effect(); };"
                  : "export const useRouter = () => globalThis.testRouter;",
            }),
          );
        },
      },
    ],
  });
  const listeners = new Map();
  const addEventListener = (name, fn) => {
    if (!listeners.has(name)) listeners.set(name, new Set());
    listeners.get(name).add(fn);
  };
  const removeEventListener = (name, fn) => listeners.get(name)?.delete(fn);
  const sent = [];
  const storageValues = new Map();
  const consentKey = "yaap:analytics-consent:v1";
  if (choice)
    storageValues.set(
      consentKey,
      JSON.stringify({ choice, expiresAt: Date.now() + 86400000 }),
    );
  if (storedChoice) storageValues.set(consentKey, storedChoice);
  const storage = {
    getItem: (key) => {
      if (storageBlocked) throw new Error("blocked");
      return storageValues.get(key) ?? null;
    },
    setItem: (key, value) => {
      if (storageBlocked) throw new Error("blocked");
      storageValues.set(key, value);
    },
    removeItem: (key) => storageValues.delete(key),
  };
  const ctx = createContext({
    URL,
    Event,
    dispatchEvent: (event) => {
      for (const listener of listeners.get(event.type) ?? []) listener(event);
      return true;
    },
    AbortController,
    TextEncoder,
    queueMicrotask,
    setTimeout,
    crypto: { randomUUID },
    navigator: { webdriver: false },
    location: new URL(path, "https://yaap.example"),
    localStorage: storage,
    sessionStorage: storage,
    document: {
      referrer: "",
      visibilityState: "visible",
      addEventListener,
      removeEventListener,
    },
    addEventListener,
    removeEventListener,
    setInterval: () => 1,
    clearInterval: () => {},
    fetch: async (endpoint, options) => {
      sent.push({ endpoint, body: JSON.parse(options.body) });
      return { ok: true, status: 202 };
    },
  });
  ctx.window = ctx;
  ctx.history = { state: null, length: 1 };
  for (const method of ["pushState", "replaceState"])
    ctx.history[method] = (state, _title, href) => {
      ctx.history.state = state;
      if (href !== undefined) ctx.location = new URL(href, ctx.location);
    };
  runInContext(outputFiles[0].text, ctx);
  ctx.SelfTrackingTest.mount();
  return {
    ctx,
    sent,
    storageValues,
    navigate: (path) => ctx.testRouter.history.push(path),
    close: () => {
      ctx.cleanup?.();
      ctx.testRouter.history.destroy();
    },
  };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

test("public tracking uses this origin and excludes private SPA routes", async () => {
  const b = await browser({ choice: "accepted" });
  try {
    await flush();
    assert.deepEqual(
      b.sent.map(({ body }) => body.path),
      ["/"],
    );
    assert.equal(b.sent[0].endpoint, "https://yaap.example/ingest");
    assert.equal(b.sent[0].body.siteId, "self-site");
    b.navigate("/?utm_source=test#features");
    await flush();
    assert.equal(b.sent.length, 1);
    for (const path of [
      "/login",
      "/app",
      "/app/private-site/visitors",
      "/setup",
      "/invite/private-token",
    ]) {
      b.navigate(path);
      await flush();
      assert.equal(b.sent.length, 1, path);
      assert.equal(await b.ctx.osAnalytics.track("private_action"), false);
    }
    b.navigate("/");
    await flush();
    assert.deepEqual(
      b.sent.map(({ body }) => body.path),
      ["/", "/"],
    );
  } finally {
    b.close();
  }
});

test("a direct private visit does not send events or create identifiers", async () => {
  const b = await browser({ path: "/invite/private-token" });
  try {
    await flush();
    assert.equal(b.sent.length, 0);
    assert.equal(b.storageValues.size, 0);
    b.navigate("/");
    b.navigate("/app");
    await flush();
    assert.equal(b.sent.length, 0);
    assert.equal(b.storageValues.size, 0);
  } finally {
    b.close();
  }
});

test("missing configuration and development builds disable tracking", async () => {
  for (const config of [
    { siteId: "" },
    { siteId: "  " },
    { production: false },
  ]) {
    const b = await browser(config);
    try {
      await flush();
      assert.equal(b.ctx.osAnalytics, undefined);
      assert.equal(b.sent.length, 0);
      assert.equal(b.storageValues.size, 0);
    } finally {
      b.close();
    }
  }
});

test("unmount cancels a pending homepage start and restores history hooks", async () => {
  const b = await browser({ choice: "accepted" });
  b.ctx.cleanup();
  await flush();
  assert.equal(b.sent.length, 0);
  assert.equal(b.ctx.osAnalytics, undefined);
  b.ctx.SelfTrackingTest.mount();
  await flush();
  assert.deepEqual(
    b.sent.map(({ body }) => body.path),
    ["/"],
  );
  b.close();
});

test("homepage analytics starts by default; opt-out stops and clears identifiers", async () => {
  const b = await browser();
  try {
    await flush();
    assert.equal(b.sent.length, 1);
    assert.ok(b.sent[0].body.visitorId);
    assert.ok(b.storageValues.has("os-analytics:self-site:visitor"));
    b.ctx.SelfTrackingTest.choose("rejected");
    await flush();
    assert.equal(await b.ctx.osAnalytics.track("after_reject"), false);
    assert.equal(b.storageValues.has("os-analytics:self-site:visitor"), false);
    assert.equal(b.storageValues.has("os-analytics:self-site:session"), false);
    b.navigate("/privacy");
    b.navigate("/");
    await flush();
    assert.equal(b.sent.length, 1);
  } finally {
    b.close();
  }
});

test("saved opt-out stops collection; expired and malformed choices use the default", async () => {
  for (const config of [
    { choice: "rejected" },
    {
      storedChoice: JSON.stringify({
        choice: "accepted",
        expiresAt: Date.now() - 1,
      }),
    },
    { storedChoice: "broken" },
    {
      storedChoice: JSON.stringify({
        choice: "accepted",
        expiresAt: "forever",
      }),
    },
  ]) {
    const b = await browser(config);
    try {
      await flush();
      assert.equal(b.sent.length, config.choice === "rejected" ? 0 : 1);
    } finally {
      b.close();
    }
  }
});

test("reject cancels a queued acceptance and changes in another tab stop tracking", async () => {
  const b = await browser();
  try {
    b.ctx.SelfTrackingTest.choose("accepted");
    b.ctx.SelfTrackingTest.choose("rejected");
    await flush();
    assert.equal(b.sent.length, 0);
    b.ctx.SelfTrackingTest.choose("accepted");
    await flush();
    assert.equal(b.sent.length, 1);
    b.storageValues.set(
      "yaap:analytics-consent:v1",
      JSON.stringify({ choice: "rejected", expiresAt: Date.now() + 86400000 }),
    );
    b.ctx.dispatchEvent({ type: "storage", key: "yaap:analytics-consent:v1" });
    assert.equal(await b.ctx.osAnalytics.track("after_external_reject"), false);
    assert.equal(b.storageValues.size, 1);
  } finally {
    b.close();
  }
});

test("blocked storage supports opting out for the current page", async () => {
  const b = await browser({ storageBlocked: true });
  try {
    await flush();
    assert.equal(b.sent.length, 1);
    b.ctx.SelfTrackingTest.choose("rejected");
    assert.equal(
      await b.ctx.osAnalytics.track("blocked_storage_reject"),
      false,
    );
  } finally {
    b.close();
  }
});

test("dismissing the notice keeps tracking active without recording acceptance", async () => {
  const b = await browser();
  try {
    await flush();
    b.ctx.SelfTrackingTest.choose("dismissed");
    await flush();
    assert.equal(b.sent.length, 1);
    assert.equal(
      JSON.parse(b.storageValues.get("yaap:analytics-consent:v1")).choice,
      "dismissed",
    );
    assert.equal(await b.ctx.osAnalytics.track("after_dismiss"), true);
  } finally {
    b.close();
  }
});
