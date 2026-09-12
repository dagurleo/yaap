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
} = {}) {
  const { outputFiles } = await build({
    stdin: {
      contents: `
        import { createBrowserHistory } from "@tanstack/history";
        import { SelfTracking } from "./src/components/self-tracking";
        globalThis.testRouter = { history: createBrowserHistory({ window }) };
        export const mount = SelfTracking;
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
  const storage = {
    getItem: (key) => storageValues.get(key) ?? null,
    setItem: (key, value) => storageValues.set(key, value),
    removeItem: (key) => storageValues.delete(key),
  };
  const ctx = createContext({
    URL,
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
  const b = await browser();
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
  const b = await browser();
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
