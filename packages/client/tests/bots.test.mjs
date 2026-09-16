import { test } from "node:test";
import assert from "node:assert/strict";
import {
  classifyBot,
  isBotTrackingPath,
  trackBotRequest,
} from "../dist/server.js";

test("crawler purposes and browser false positives", () => {
  for (const [ua, category] of [
    ["Mozilla/5.0 (compatible; ChatGPT-User/1.0)", "ai_answers"],
    ["Claude-User/1.0", "ai_answers"],
    ["Claude-SearchBot/1.0", "indexing"],
    ["GPTBot/1.0", "training"],
    ["ClaudeBot/1.0", "training"],
    ["Perplexity-User/1.0", "ai_answers"],
    ["Googlebot/2.1", "indexing"],
    ["curl/8.0", "other"],
    ["HeadlessChrome/120.0", "other"],
  ])
    assert.equal(classifyBot(ua)?.category, category, ua);
  assert.equal(classifyBot("Mozilla/5.0 Chrome/130.0.0.0 Safari/537.36"), null);
  assert.equal(classifyBot(""), null);
  assert.notEqual(classifyBot("FakeChatGPT-User/1.0")?.name, "ChatGPT-User");
  assert.notEqual(classifyBot("GPTBot-Imposter/1.0")?.name, "GPTBot");
  for (const path of [
    "/robots.txt",
    "/llms.txt",
    "/sitemap.xml",
    "/docs/setup.md",
    "/docs/setup.mdx",
  ])
    assert.equal(isBotTrackingPath(path), true, path);
  for (const path of [
    "/api/events",
    "/_next/static/a",
    "/styles.css",
    "/photo.JPG",
  ])
    assert.equal(isBotTrackingPath(path), false, path);
});

test("server helper filters requests, strips secrets and schedules bounded background delivery", async (t) => {
  const calls = [];
  t.mock.method(globalThis, "fetch", async (url, init) => {
    calls.push({ url, init });
    return new Response(null, { status: 202 });
  });
  const options = {
    siteId: "site",
    endpoint: "https://analytics.example/bot-traffic",
    token: "secret",
  };
  const bot = (path, init = {}) =>
    new Request(`https://site.example${path}`, {
      headers: { "user-agent": "ChatGPT-User/1.0", cookie: "private=value" },
      ...init,
    });
  let background;
  await trackBotRequest(
    bot("/robots.txt?secret=1"),
    { ...options, publicOrigin: "https://public.example" },
    {
      waitUntil(work) {
        background = work;
      },
    },
    new Response(null, { status: 404 }),
  );
  await background;
  assert.equal(calls.length, 1);
  const payload = JSON.parse(calls[0].init.body);
  assert.equal(payload.url, "https://public.example/robots.txt");
  assert.equal(payload.statusCode, 404);
  assert.equal(calls[0].init.headers.Authorization, "Bearer secret");
  assert.ok(calls[0].init.signal instanceof AbortSignal);
  assert.equal(calls[0].init.redirect, "error");
  assert.equal(payload.cookie, undefined);
  assert.equal(payload.ip, undefined);
  await trackBotRequest(bot("/styles.css"), options);
  await trackBotRequest(bot("/api"), options);
  await trackBotRequest(bot("/", { method: "POST" }), options);
  await trackBotRequest(new Request("https://site.example"), options);
  assert.equal(calls.length, 1);
  await trackBotRequest(bot("/docs"), options);
  assert.notEqual(JSON.parse(calls[1].init.body).id, payload.id);
});

test("delivery and error-handler failures do not break the website", async (t) => {
  t.mock.method(globalThis, "fetch", async () => {
    throw new Error("offline");
  });
  let error;
  await trackBotRequest(
    new Request("https://site.example", {
      headers: { "user-agent": "GPTBot/1.0" },
    }),
    {
      siteId: "site",
      endpoint: "https://analytics.example/bot-traffic",
      token: "secret",
      onError(value) {
        error = value;
        throw new Error("handler failed");
      },
    },
  );
  assert.equal(error.message, "offline");
});
