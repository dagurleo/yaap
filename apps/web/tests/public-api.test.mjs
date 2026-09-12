import { fileURLToPath } from "node:url";
import { postgresFixture } from "./helpers/postgres.mjs";
import { createHash, randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

let mf, db, directory, postgres;
const usePostgres = process.env.YAAP_TEST_DATABASE === "postgres";
const useHyperdrive = process.env.YAAP_TEST_HYPERDRIVE === "1";
const serverFns = {};
const origin = "https://analytics.example.com";
const setupSecret = "test-bootstrap-" + "b".repeat(40);
const password = "test-owner-password-2026";
let ownerCookie, ownerEmail, site;

function request(
  path,
  { method = "GET", body, cookie, requestOrigin = origin, headers = {} } = {},
) {
  return mf.dispatchFetch(origin + path, {
    method,
    redirect: "manual",
    headers: {
      ...(path.startsWith("/_serverFn/") ? { "x-tsr-serverFn": "true" } : {}),
      Origin: requestOrigin,
      "cf-connecting-ip": "192.0.2.1",
      ...(cookie ? { Cookie: cookie } : {}),
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...headers,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}
function cookies(response) {
  return response.headers
    .getSetCookie()
    .map((value) => value.split(";")[0])
    .join("; ");
}
async function eventually(check) {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    if (await check()) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  assert.fail("Queue did not drain within 15 seconds");
}

before(async () => {
  directory = await mkdtemp(join(tmpdir(), "os-analytics-test-"));
  // Exercise the actual deployment bundle, including Wrangler's runtime shims.
  // npm run check builds first; npm test exercises the current production output.
  execFileSync(
    process.execPath,
    [
      fileURLToPath(
        new URL(
          "bin/wrangler.js",
          import.meta.resolve("wrangler/package.json"),
        ),
      ),
      "deploy",
      "--dry-run",
      "--outdir",
      directory,
    ],
    { stdio: "pipe" },
  );
  if (usePostgres) postgres = await postgresFixture();
  mf = new Miniflare(
    convertV4MiniflareOptions({
      name: "analytics-test",
      modules: (await readdir(directory, { recursive: true }))
        .filter((file) => file.endsWith(".js"))
        .sort((a, b) =>
          a === "index.js" ? -1 : b === "index.js" ? 1 : a.localeCompare(b),
        )
        .map((file) => ({ type: "ESModule", path: join(directory, file) })),
      modulesRoot: directory,
      compatibilityDate: "2026-09-09",
      compatibilityFlags: ["nodejs_compat"],
      bindings: {
        BETTER_AUTH_SECRET: "test-auth-" + "a".repeat(40),
        BOOTSTRAP_SECRET: setupSecret,
        ...(postgres
          ? {
              DATABASE_PROVIDER: "postgres",
              ...(!useHyperdrive
                ? { DATABASE_URL: postgres.connectionString }
                : {}),
            }
          : {}),
      },
      d1Databases: postgres ? [] : ["DB"],
      ...(postgres && useHyperdrive
        ? { hyperdrives: { HYPERDRIVE: postgres.connectionString } }
        : {}),
      queueProducers: { EVENTS: "events", EVENTS_DLQ: "events-dlq" },
      queueConsumers: {
        events: {
          maxBatchSize: 25,
          maxBatchTimeout: 0,
          maxRetries: 1,
          deadLetterQueue: "events-dlq",
        },
      },
      serviceBindings: { ASSETS: () => new Response("OS Analytics") },
    }),
  );
  if (postgres) {
    db = postgres.db;
    return;
  }
  db = await mf.getD1Database("DB");
  const files = (await readdir("migrations"))
    .filter((file) => file.endsWith(".sql"))
    .sort();
  for (const file of files) {
    const migration = await readFile(join("migrations", file), "utf8");
    for (const statement of migration.split("--> statement-breakpoint")) {
      if (statement.trim()) await db.prepare(statement).run();
    }
  }
});
after(async () => {
  await mf?.dispose();
  await postgres?.close();
  if (directory) await rm(directory, { recursive: true, force: true });
});

const scopeList = [
  "sites:read",
  "sites:create",
  "sites:write",
  "reports:read",
  "events:read",
  "visitors:read",
  "goals:read",
  "goals:write",
  "funnels:read",
  "funnels:write",
  "revenue:read",
  "payments:read",
  "settings:read",
  "settings:write",
  "retention:write",
  "integrations:read",
  "integrations:write",
  "operations:read",
  "audit:read",
];
let token, second, readToken, credentials, goal, funnel;
const day = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
const dates = `from=${day}&to=${day}`;
const at = Date.parse(day) + 3600000;
const visitor = "a".repeat(64),
  session = "b".repeat(64);
async function result(path, options = {}, expected = 200) {
  const response = await request(path, options);
  const body = await response.json();
  assert.equal(response.status, expected, `${path}: ${JSON.stringify(body)}`);
  return { body, response };
}
function bearer(extra = {}) {
  return { Authorization: `Bearer ${token}`, ...extra };
}
async function key(
  selectedScopes = scopeList,
  siteIds = [site.id],
  allSites = false,
) {
  const { body } = await result(
    "/api/v1/api-keys",
    {
      method: "POST",
      cookie: ownerCookie,
      headers: { "Idempotency-Key": randomUUID() },
      body: {
        name: "Integration fixture",
        scopes: selectedScopes,
        siteIds,
        allSites,
        expiresAt: Date.now() + 86400000,
      },
    },
    201,
  );
  return body.data;
}
async function get(path, query = "") {
  return (
    await result(`/api/v1/sites/${site.id}${path}${query ? "?" + query : ""}`, {
      headers: bearer(),
    })
  ).body;
}
async function patch(path, body, revision) {
  return (
    await result(`/api/v1/sites/${site.id}${path}`, {
      method: "PATCH",
      headers: bearer({ "If-Match": `"${revision}"` }),
      body,
    })
  ).body;
}
async function clearLimits() {
  await db
    .prepare("DELETE FROM request_limits WHERE key LIKE 'public:%'")
    .run();
}

test("public credentials require owner session; migration, grants, expiry and secret storage", async () => {
  const setup = await request("/api/setup", {
    method: "POST",
    body: {
      name: "API Owner",
      email: "api@example.com",
      password,
      setupSecret,
    },
  });
  assert.equal(setup.status, 200, await setup.clone().text());
  ownerCookie = cookies(setup);
  site = (
    await result(
      "/api/sites",
      {
        method: "POST",
        cookie: ownerCookie,
        body: { name: "API fixture", origin: "https://fixture.example" },
      },
      201,
    )
  ).body;
  second = (
    await result(
      "/api/sites",
      {
        method: "POST",
        cookie: ownerCookie,
        body: { name: "Other site", origin: "https://other.example" },
      },
      201,
    )
  ).body;
  await result("/api/v1/me", {}, 401);
  await result(
    "/api/v1/api-keys",
    {
      method: "POST",
      cookie: ownerCookie,
      requestOrigin: "https://evil.example",
      body: {},
    },
    403,
  );
  await result(
    "/api/v1/api-keys",
    {
      method: "POST",
      cookie: ownerCookie,
      body: {
        name: "Bad grant",
        scopes: ["reports:read"],
        siteIds: ["missing"],
        allSites: false,
        expiresAt: Date.now() + 60000,
      },
      headers: { "Idempotency-Key": randomUUID() },
    },
    400,
  );
  credentials = await key();
  token = credentials.token;
  const stored = await db
    .prepare("select token_hash from api_credentials where id=?")
    .bind(credentials.id)
    .first();
  assert.equal(
    stored.token_hash,
    createHash("sha256").update(token).digest("hex"),
  );
  const listing = (await result("/api/v1/api-keys", { cookie: ownerCookie }))
    .body;
  assert.doesNotMatch(JSON.stringify(listing), new RegExp(token));
  await result("/api/v1/api-keys", { headers: bearer() }, 403);
  assert.equal(
    (await result("/api/v1/me", { headers: bearer() })).body.data.siteIds[0],
    site.id,
  );
  assert.deepEqual(
    (await result("/api/v1/sites", { headers: bearer() })).body.data.map(
      (s) => s.id,
    ),
    [site.id],
  );
  await result(`/api/v1/sites/${second.id}`, { headers: bearer() }, 404);
  await result(
    "/api/v1/me",
    { cookie: ownerCookie, headers: { Authorization: "Bearer invalid" } },
    401,
  );
  const expired = await key();
  await db
    .prepare("update api_credentials set expires_at=1 where id=?")
    .bind(expired.id)
    .run();
  await result(
    "/api/v1/me",
    { headers: { Authorization: `Bearer ${expired.token}` } },
    401,
  );
  const cap = (await result("/api/v1/capabilities", { headers: bearer() }))
    .body;
  assert.equal(cap.data.limits.maxPageSize, 100);
  const spec = (await result("/api/v1/openapi.json")).body;
  assert.equal(spec.openapi, "3.1.0");
  assert.ok(spec.paths["/sites/{siteId}/goals"].post);
  const access = await request("/app/access", { cookie: ownerCookie });
  assert.equal(access.status, 200);
  assert.match(await access.text(), /API &amp; MCP access|API & MCP access/);
});

test("site writes preserve omission, require revisions, audit atomically and grant new sites", async () => {
  const current = await get("");
  await result(
    `/api/v1/sites/${site.id}`,
    { method: "PATCH", headers: bearer(), body: { name: "missing revision" } },
    428,
  );
  const changed = await patch(
    "",
    { name: "Updated fixture" },
    current.meta.revision,
  );
  assert.equal(changed.data.origin, site.origin);
  await result(
    `/api/v1/sites/${site.id}`,
    {
      method: "PATCH",
      headers: bearer({ "If-Match": `"${current.meta.revision}"` }),
      body: { name: "stale" },
    },
    412,
  );
  const rule = await get("/tracking-rules");
  const updated = await patch(
    "/tracking-rules",
    { excludedPaths: ["/internal/*"] },
    rule.meta.revision,
  );
  assert.deepEqual(updated.data.additionalOrigins, []);
  assert.equal(updated.data.excludeBots, true);
  const retained = await get("/retention");
  const retention = await patch(
    "/retention",
    { eventRetentionDays: 90 },
    retained.meta.revision,
  );
  assert.equal(retention.data.paymentRetentionDays, 0);
  const installation = await get("/installation", "mode=paused");
  assert.match(installation.data.snippet, /script.js/);
  assert.match(installation.data.snippet, /data-site-id=/);
  assert.match(installation.data.snippet, /data-tracking="paused"/);
  await get("/ingestion-status");
  const newBody = {
      name: "Created through API",
      origin: "https://created.example",
    },
    idempotency = randomUUID();
  const requests = await Promise.all(
    Array.from({ length: 2 }, () =>
      request("/api/v1/sites", {
        method: "POST",
        headers: bearer({ "Idempotency-Key": idempotency }),
        body: newBody,
      }),
    ),
  );
  const values = await Promise.all(
    requests.map(async (response) => {
      const body = await response.json();
      assert.equal(response.status, 201, JSON.stringify(body));
      return body.data;
    }),
  );
  assert.equal(values[0].id, values[1].id);
  const me = (await result("/api/v1/me", { headers: bearer() })).body;
  assert.ok(me.data.siteIds.includes(values[0].id));
  await result(
    "/api/v1/sites",
    {
      method: "POST",
      headers: bearer({ "Idempotency-Key": idempotency }),
      body: { ...newBody, name: "conflict" },
    },
    409,
  );
  const audit = (await result("/api/v1/audit-log", { headers: bearer() })).body;
  assert.ok(audit.data.some((row) => row.operation === "update_retention"));
  assert.equal(
    audit.data.filter((row) => row.operation === "create_site").length,
    1,
  );
  assert.equal(
    (await db.prepare("select count(*) as n from api_write_guards").first()).n,
    0,
  );
});

test("goals and funnels support partial updates and archive restore; stale concurrent edits roll back", async () => {
  goal = (
    await result(
      `/api/v1/sites/${site.id}/goals`,
      {
        method: "POST",
        headers: bearer({ "Idempotency-Key": randomUUID() }),
        body: {
          name: "Signup",
          eventName: "signup",
          conditions: { plan: "pro" },
        },
      },
      201,
    )
  ).body;
  assert.equal((await get("/goals")).data[0].id, goal.data.id);
  const renamed = await patch(
    `/goals/${goal.data.id}`,
    { name: "Pro signup" },
    goal.meta.revision,
  );
  assert.deepEqual(renamed.data.conditions, { plan: "pro" });
  const concurrent = await Promise.all(
    ["First", "Second"].map((name) =>
      request(`/api/v1/sites/${site.id}/goals/${goal.data.id}`, {
        method: "PATCH",
        headers: bearer({ "If-Match": `"${renamed.meta.revision}"` }),
        body: { name },
      }),
    ),
  );
  assert.deepEqual(concurrent.map((r) => r.status).sort(), [200, 412]);
  const fresh = await get(`/goals/${goal.data.id}`);
  const archived = await patch(
    `/goals/${goal.data.id}`,
    { archived: true },
    fresh.meta.revision,
  );
  assert.equal((await get("/goals")).data.length, 0);
  assert.equal((await get("/goals", "archived=true")).data.length, 1);
  goal = await patch(
    `/goals/${goal.data.id}`,
    { archived: false },
    archived.meta.revision,
  );
  funnel = (
    await result(
      `/api/v1/sites/${site.id}/funnels`,
      {
        method: "POST",
        headers: bearer({ "Idempotency-Key": randomUUID() }),
        body: {
          name: "Signup funnel",
          scope: "session",
          windowHours: 24,
          steps: [
            { kind: "page", value: "/" },
            { kind: "event", value: "signup", conditions: { plan: "pro" } },
          ],
        },
      },
      201,
    )
  ).body;
  const next = await patch(
    `/funnels/${funnel.data.id}`,
    { name: "Renamed funnel" },
    funnel.meta.revision,
  );
  assert.equal(next.data.steps.length, 2);
  const af = await patch(
    `/funnels/${funnel.data.id}`,
    { archived: true },
    next.meta.revision,
  );
  assert.equal((await get("/funnels")).data.length, 0);
  funnel = await patch(
    `/funnels/${funnel.data.id}`,
    { archived: false },
    af.meta.revision,
  );
  await get(`/funnels/${funnel.data.id}`);
});

test("reports match retained data and typed properties; event/visitor pagination has stable ties", async () => {
  await clearLimits();
  const events = [
    ["one", "pageview", "/", at, visitor, session, {}],
    [
      "two",
      "signup",
      "/thanks",
      at + 1000,
      visitor,
      session,
      { plan: "pro", seats: 1 },
    ],
    [
      "three",
      "signup",
      "/thanks",
      at + 1000,
      visitor,
      session,
      { plan: "pro", seats: "1" },
    ],
    [
      "four",
      "signup",
      "/thanks",
      at + 2000,
      null,
      null,
      { plan: "pro", seats: true },
    ],
  ];
  for (const [id, name, path, time, vid, sid, props] of events)
    await db
      .prepare(
        "insert into events(id,site_id,name,path,received_at,visitor_id,session_id,properties) values(?,?,?,?,?,?,?,?)",
      )
      .bind(id, site.id, name, path, time, vid, sid, JSON.stringify(props))
      .run();
  const overview = await get("/reports/overview", dates);
  assert.equal(overview.data.current.pageviews, 1);
  assert.equal(overview.data.current.visitors, 1);
  assert.equal(overview.data.current.customEvents, 3);
  const previous = await get(
    "/reports/overview",
    dates + "&compare=previous_period",
  );
  assert.equal(previous.data.comparison.pageviews, 0);
  const daily = await get("/reports/timeseries", dates);
  assert.deepEqual(daily.data.current, [{ date: day, pageviews: 1 }]);
  const breakdown = await get("/reports/breakdown", dates + "&dimension=path");
  assert.equal(breakdown.data.current.total, 1);
  await get("/reports/breakdown", dates + "&dimension=country&metric=visitors");
  const sessions = await get("/reports/sessions", dates);
  assert.equal(sessions.data.current.averageDurationSeconds, 1);
  assert.equal(sessions.data.current.bounceRate, 0);
  const audience = await get("/reports/audience", dates);
  assert.equal(audience.data.current.newVisitors, 1);
  const goals = await get("/reports/goals", dates);
  assert.equal(goals.data.current[0].completions, 3);
  assert.equal(goals.data.current[0].convertedSessions, 1);
  const f = await get(`/funnels/${funnel.data.id}/report`, dates);
  assert.equal(f.data.current.completed, 1);
  const names = await get("/event-names", dates + "&limit=1");
  assert.ok(names.pagination.nextCursor);
  const nextName = await get(
    "/event-names",
    dates +
      "&limit=1&cursor=" +
      encodeURIComponent(names.pagination.nextCursor),
  );
  assert.notEqual(names.data[0].name, nextName.data[0].name);
  const props = await get("/event-properties", dates);
  assert.equal(props.data.filter((row) => row.key === "seats").length, 3);
  const values = await get(
    "/event-property-values",
    dates + "&propertyKey=seats",
  );
  assert.equal(values.data.length, 3);
  for (const value of [1, "1", true]) {
    const report = await get(
      "/reports/events",
      dates +
        "&propertyKey=seats&propertyValue=" +
        encodeURIComponent(JSON.stringify(value)),
    );
    assert.equal(report.data.events, 1);
  }
  const rows = await get("/events", dates + "&limit=2");
  const next = await get(
    "/events",
    dates + "&limit=2&cursor=" + encodeURIComponent(rows.pagination.nextCursor),
  );
  assert.equal(new Set([...rows.data, ...next.data].map((r) => r.id)).size, 4);
  await result(
    `/api/v1/sites/${site.id}/events?${dates}&limit=3&cursor=${encodeURIComponent(rows.pagination.nextCursor)}`,
    { headers: bearer() },
    400,
  );
  await get("/events/two");
  const visitors = await get("/visitors", dates);
  assert.equal(visitors.data[0].visitorId, visitor);
  const person = await get("/visitors/" + visitor);
  assert.equal(person.data.events, 3);
  const journey = await get("/visitors/" + visitor + "/journey");
  assert.equal(journey.data.events.length, 3);
  await result(
    `/api/v1/sites/${site.id}/live?${dates}`,
    { headers: bearer() },
    400,
  );
  await result(
    `/api/v1/sites/${site.id}/reports/overview?${dates}&typo=value`,
    { headers: bearer() },
    400,
  );
  await result(
    `/api/v1/sites/${site.id}/reports/overview?${dates}&from=${day}`,
    { headers: bearer() },
    400,
  );
  await result(
    `/api/v1/sites/${site.id}/reports/breakdown?${dates}&dimension=path&metric=visitors`,
    { headers: bearer() },
    400,
  );
});

test("revenue remains currency separated; integrations never leak secrets; narrow scopes redact detail", async () => {
  await clearLimits();
  for (const [id, currency, amount] of [
    ["usd", "USD", 1000],
    ["eur", "EUR", 500],
  ])
    await db
      .prepare(
        "insert into payments(site_id,provider,mode,external_id,amount,refunded_amount,currency,paid_at,visitor_id,created_at,updated_at) values(?,'api','live',?,?,100,?,?,?, ?,?)",
      )
      .bind(site.id, id, amount, currency, at + 3000, visitor, at, at)
      .run();
  const revenue = await get("/reports/revenue", dates + "&mode=live");
  assert.equal(revenue.data.current.length, 2);
  assert.equal(revenue.meta.attributionModel, "per_payment_snapshot");
  assert.deepEqual(
    revenue.data.current.map((r) => r.currency),
    ["EUR", "USD"],
  );
  const breakdown = await get(
    "/reports/revenue/breakdown",
    dates + "&mode=live&dimension=source",
  );
  assert.equal(breakdown.data.current.rows.length, 2);
  const payments = await get("/payments", dates + "&mode=live&limit=1");
  assert.ok(payments.pagination.nextCursor);
  assert.equal(payments.data[0].attributionStatus, "pending");
  assert.equal(payments.data[0].attributionModel, "first_touch");
  assert.equal(payments.data[0].attributionLookbackDays, 30);
  await get(
    "/payments",
    dates +
      "&mode=live&limit=1&cursor=" +
      encodeURIComponent(payments.pagination.nextCursor),
  );
  await get("/payments/api/live/usd");
  const integration = await get("/payment-integration");
  const stripeSecret = "whsec_" + "s".repeat(24);
  const set = (
    await result(`/api/v1/sites/${site.id}/payment-integration/stripe/test`, {
      method: "PUT",
      headers: bearer({
        "If-Match": `"${integration.meta.revision}"`,
        "Idempotency-Key": randomUUID(),
      }),
      body: { secret: stripeSecret },
    })
  ).body;
  const status = await get("/payment-integration");
  assert.equal(status.data.stripeTest, true);
  assert.doesNotMatch(JSON.stringify(status), new RegExp(stripeSecret));
  const rotateKey = randomUUID();
  const rotated = await result(
    `/api/v1/sites/${site.id}/payment-integration/api-key`,
    {
      method: "POST",
      headers: bearer({
        "If-Match": `"${set.meta.revision}"`,
        "Idempotency-Key": rotateKey,
      }),
    },
  );
  assert.match(rotated.body.data.token, /^osa_/);
  // Replaying the original request succeeds even after its revision has advanced.
  const replay = await result(
    `/api/v1/sites/${site.id}/payment-integration/api-key`,
    {
      method: "POST",
      headers: bearer({
        "If-Match": `"${set.meta.revision}"`,
        "Idempotency-Key": rotateKey,
      }),
    },
  );
  assert.equal(replay.body.data.token, rotated.body.data.token);
  const revoked = (
    await result(`/api/v1/sites/${site.id}/payment-integration/api-key`, {
      method: "DELETE",
      headers: bearer({ "If-Match": `"${rotated.body.meta.revision}"` }),
    })
  ).body;
  await result(`/api/v1/sites/${site.id}/payment-integration/stripe/test`, {
    method: "DELETE",
    headers: bearer({ "If-Match": `"${revoked.meta.revision}"` }),
  });
  readToken = (
    await key(["sites:read", "reports:read", "events:read", "visitors:read"])
  ).token;
  const narrow = (await key(["reports:read", "events:read", "payments:read"]))
    .token;
  const headers = { Authorization: `Bearer ${narrow}` };
  const rows = (
    await result(`/api/v1/sites/${site.id}/events?${dates}`, { headers })
  ).body;
  assert.ok(
    rows.data.every((row) => !("visitorId" in row) && !("sessionId" in row)),
  );
  const pay = (
    await result(`/api/v1/sites/${site.id}/payments?${dates}&mode=live`, {
      headers,
    })
  ).body;
  assert.ok(pay.data.every((row) => !("visitorId" in row)));
  const journey = (
    await result(`/api/v1/sites/${site.id}/visitors/${visitor}/journey`, {
      headers: { Authorization: `Bearer ${readToken}` },
    })
  ).body;
  assert.ok(!("payments" in journey.data));
  const live = (await result(`/api/v1/sites/${site.id}/live`, { headers }))
    .body;
  assert.ok(!("rows" in live.data.online));
  await result(
    `/api/v1/sites/${site.id}`,
    { method: "PATCH", headers, body: { name: "forbidden" } },
    403,
  );
  await result(`/api/v1/sites/${second.id}/events?${dates}`, { headers }, 404);
});

async function sdk(accessToken) {
  const client = new Client({ name: "yaap-test-client", version: "1.0.0" });
  const transport = new StreamableHTTPClientTransport(
    new URL(origin + "/mcp"),
    {
      requestInit: { headers: { Authorization: `Bearer ${accessToken}` } },
      fetch: async (input, init) =>
        mf.dispatchFetch(
          typeof input === "string"
            ? input
            : input instanceof URL
              ? input.href
              : input.url,
          init,
        ),
    },
  );
  await client.connect(transport);
  return client;
}
test("official MCP SDK connects, discovers scoped schemas, reads and mutates through shared services", async () => {
  await clearLimits();
  const client = await sdk(token);
  try {
    const list = await client.listTools();
    assert.equal(list.tools.length, 47);
    const common = {
      siteId: site.id,
      from: day,
      to: day,
      eventId: "two",
      visitorId: visitor,
      goalId: goal.data.id,
      funnelId: funnel.data.id,
      propertyKey: "seats",
      dimension: "country",
      provider: "api",
      mode: "live",
      externalId: "usd",
    };
    for (const tool of list.tools.filter((t) => t.annotations?.readOnlyHint)) {
      const args = Object.fromEntries(
        (tool.inputSchema.required ?? []).map((key) => [
          key,
          key === "dimension" && tool.name.includes("revenue")
            ? "source"
            : common[key],
        ]),
      );
      const read = await client.callTool({ name: tool.name, arguments: args });
      assert.ok(!read.isError, `${tool.name}: ${JSON.stringify(read)}`);
    }
    await clearLimits();

    assert.ok(
      list.tools
        .find((t) => t.name === "get_overview")
        .inputSchema.required.includes("from"),
    );
    const read = await client.callTool({
      name: "get_overview",
      arguments: { siteId: site.id, from: day, to: day },
    });
    assert.ok(!read.isError, JSON.stringify(read));
    assert.equal(read.structuredContent.data.current.pageviews, 1);
    const before = await client.callTool({
      name: "get_goal",
      arguments: { siteId: site.id, goalId: goal.data.id },
    });
    const archive = await client.callTool({
      name: "set_goal_archived",
      arguments: {
        siteId: site.id,
        goalId: goal.data.id,
        archived: true,
        revision: before.structuredContent.meta.revision,
      },
    });
    assert.ok(!archive.isError, JSON.stringify(archive));
    assert.equal(archive.structuredContent.data.archived, true);
    await client.callTool({
      name: "set_goal_archived",
      arguments: {
        siteId: site.id,
        goalId: goal.data.id,
        archived: false,
        revision: archive.structuredContent.meta.revision,
      },
    });
  } finally {
    await client.close();
  }
  const reader = await sdk(readToken);
  try {
    const list = await reader.listTools();
    assert.ok(!list.tools.some((t) => t.name === "update_site"));
    const denied = await reader.callTool({
      name: "get_overview",
      arguments: { siteId: second.id, from: day, to: day },
    });
    assert.equal(denied.isError, true);
  } finally {
    await reader.close();
  }
  await result(
    "/mcp",
    {
      method: "POST",
      headers: bearer(),
      requestOrigin: "https://evil.example",
      body: { jsonrpc: "2.0", id: 1, method: "tools/list" },
    },
    403,
  );
});

async function oauthPost(path, body, cookie) {
  return mf.dispatchFetch(origin + path, {
    method: "POST",
    redirect: "manual",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Origin: origin,
      ...(cookie ? { Cookie: cookie } : {}),
      "cf-connecting-ip": "192.0.2.3",
    },
    body: new URLSearchParams(body).toString(),
  });
}
test("OAuth PKCE consent, resource binding, code single-use, refresh rotation and revocation", async () => {
  await clearLimits();
  const registration = (
    await result(
      "/oauth/clients",
      {
        method: "POST",
        cookie: ownerCookie,
        body: {
          name: "SDK client",
          redirectUris: ["http://127.0.0.1:9999/callback"],
        },
      },
      201,
    )
  ).body.data;
  const metadata = (await result("/.well-known/oauth-authorization-server"))
    .body;
  assert.deepEqual(metadata.code_challenge_methods_supported, ["S256"]);
  const verifier = "v".repeat(64),
    challenge = createHash("sha256").update(verifier).digest("base64url");
  const params = new URLSearchParams({
    client_id: registration.client_id,
    redirect_uri: registration.redirect_uris[0],
    response_type: "code",
    scope: "sites:read reports:read offline_access",
    state: "roundtrip",
    code_challenge: challenge,
    code_challenge_method: "S256",
    resource: origin + "/mcp",
  });
  const consent = await request("/oauth/authorize?" + params, {
    cookie: ownerCookie,
  });
  assert.equal(consent.status, 200);
  assert.equal(consent.headers.get("referrer-policy"), "no-referrer");
  assert.equal(consent.headers.get("x-frame-options"), "DENY");
  assert.match(
    consent.headers.get("content-security-policy"),
    /form-action 'self' http:\/\/127\.0\.0\.1:9999;/,
  );
  const html = await consent.text(),
    pending = html.match(/name="request" value="([^"]+)"/)[1];
  const redirect = await oauthPost(
    "/oauth/authorize",
    { request: pending, siteId: site.id, decision: "allow" },
    ownerCookie,
  );
  assert.equal(redirect.status, 303, await redirect.clone().text());
  assert.equal(redirect.headers.get("referrer-policy"), "no-referrer");
  const callback = new URL(redirect.headers.get("location"));
  assert.equal(callback.searchParams.get("state"), "roundtrip");
  const input = {
    grant_type: "authorization_code",
    code: callback.searchParams.get("code"),
    code_verifier: verifier,
    client_id: registration.client_id,
    redirect_uri: registration.redirect_uris[0],
    resource: origin + "/mcp",
  };
  assert.equal(
    (
      await oauthPost("/oauth/token", {
        ...input,
        code_verifier: "x".repeat(64),
      })
    ).status,
    400,
  );
  assert.equal(
    (await oauthPost("/oauth/token", { ...input, resource: origin + "/other" }))
      .status,
    400,
  );
  const response = await oauthPost("/oauth/token", input),
    issued = await response.json();
  assert.equal(response.status, 200, JSON.stringify(issued));
  assert.ok(issued.refresh_token);
  assert.equal((await oauthPost("/oauth/token", input)).status, 400);
  await result(
    "/api/v1/me",
    { headers: { Authorization: `Bearer ${issued.access_token}` } },
    401,
  );
  const connected = await sdk(issued.access_token);
  try {
    assert.ok(
      (await connected.listTools()).tools.some(
        (t) => t.name === "get_overview",
      ),
    );
  } finally {
    await connected.close();
  }
  const refresh = {
    grant_type: "refresh_token",
    refresh_token: issued.refresh_token,
    client_id: registration.client_id,
    resource: origin + "/mcp",
  };
  const renewedResponse = await oauthPost("/oauth/token", refresh),
    renewed = await renewedResponse.json();
  assert.equal(renewedResponse.status, 200, JSON.stringify(renewed));
  assert.notEqual(renewed.access_token, issued.access_token);
  assert.equal(
    (
      await request("/mcp", {
        method: "POST",
        headers: { Authorization: `Bearer ${issued.access_token}` },
        body: { jsonrpc: "2.0", id: 1, method: "tools/list" },
      })
    ).status,
    401,
  );
  assert.equal((await oauthPost("/oauth/token", refresh)).status, 400);
  assert.equal(
    (
      await request("/mcp", {
        method: "POST",
        headers: { Authorization: `Bearer ${renewed.access_token}` },
        body: { jsonrpc: "2.0", id: 1, method: "tools/list" },
      })
    ).status,
    401,
  );
  assert.equal(
    (
      await oauthPost("/oauth/revoke", {
        token: renewed.refresh_token,
        client_id: registration.client_id,
      })
    ).status,
    200,
  );
  const concurrentConsent = await oauthPost(
    "/oauth/authorize",
    {
      request: pending,
      siteId: site.id,
      decision: "allow",
    },
    ownerCookie,
  );
  const concurrentCode = new URL(
    concurrentConsent.headers.get("location"),
  ).searchParams.get("code");
  const concurrentIssued = await (
    await oauthPost("/oauth/token", { ...input, code: concurrentCode })
  ).json();
  const attempts = await Promise.all(
    [0, 1].map(() =>
      oauthPost("/oauth/token", {
        ...refresh,
        refresh_token: concurrentIssued.refresh_token,
      }),
    ),
  );
  assert.deepEqual(attempts.map((r) => r.status).sort(), [200, 400]);
  const winner = await attempts.find((r) => r.status === 200).json();
  await result(
    "/mcp",
    {
      method: "POST",
      headers: { Authorization: `Bearer ${winner.access_token}` },
      body: { jsonrpc: "2.0", id: 1, method: "tools/list" },
    },
    401,
  );
  await result("/oauth/clients/" + registration.client_id, {
    method: "DELETE",
    cookie: ownerCookie,
  });
  const noSession = await request("/oauth/authorize?" + params);
  assert.equal(noSession.status, 400); // removed client
});

test("API timezone changes govern daily totals, metadata and cursor validity", async () => {
  await clearLimits();
  const created = await result(
    "/api/v1/sites",
    {
      method: "POST",
      headers: bearer({ "Idempotency-Key": randomUUID() }),
      body: {
        name: "API Tokyo",
        origin: "https://api-tokyo.example",
        timezone: "Asia/Tokyo",
      },
    },
    201,
  );
  const target = created.body.data;
  assert.equal(target.timezone, "Asia/Tokyo");
  const start = Date.parse("2026-01-10T15:00:00Z");
  await db.batch(
    [start - 1, start, start + 1, start + 86400000].map((at, i) =>
      db
        .prepare(
          "INSERT INTO events(id,site_id,name,path,received_at) VALUES(?,?,'pageview','/timezone',?)",
        )
        .bind(`api-zone-${i}`, target.id, at),
    ),
  );
  const url = `/api/v1/sites/${target.id}`;
  const query = "from=2026-01-11&to=2026-01-11";
  const series = (
    await result(`${url}/reports/timeseries?${query}`, { headers: bearer() })
  ).body;
  assert.equal(series.meta.timezone, "Asia/Tokyo");
  assert.equal(series.meta.start, start);
  assert.equal(series.meta.end, start + 86400000);
  assert.equal(series.meta.partial, false);
  assert.deepEqual(series.data.current, [{ date: "2026-01-11", pageviews: 2 }]);
  const events = (
    await result(`${url}/events?${query}&limit=1`, { headers: bearer() })
  ).body;
  assert.ok(events.pagination.nextCursor);
  const changed = (
    await result(url, {
      method: "PATCH",
      headers: bearer({ "If-Match": `"${created.body.meta.revision}"` }),
      body: { timezone: "UTC" },
    })
  ).body;
  assert.equal(changed.data.timezone, "UTC");
  await result(
    `${url}/events?${query}&limit=1&cursor=${encodeURIComponent(events.pagination.nextCursor)}`,
    { headers: bearer() },
    400,
  );
  const utc = (
    await result(`${url}/reports/timeseries?${query}`, { headers: bearer() })
  ).body;
  assert.deepEqual(utc.data.current, [{ date: "2026-01-11", pageviews: 1 }]);
});

test("event discovery uses the report budget independently of management reads", async () => {
  await clearLimits();
  const minute = Math.floor(Date.now() / 60000);
  await db
    .prepare("insert into request_limits(key,count,expires_at) values(?,30,?)")
    .bind(`public:${credentials.id}:true:${minute}`, Date.now() + 60000)
    .run();
  const limited = await result(
    `/api/v1/sites/${site.id}/event-names?from=${day}&to=${day}`,
    { headers: bearer() },
    429,
  );
  assert.equal(limited.response.headers.get("retry-after"), "60");
  await result("/api/v1/me", { headers: bearer() });
});

test("revoked credentials fail on both transports and limits return retry guidance", async () => {
  await clearLimits();
  const minute = Math.floor(Date.now() / 60000);
  await db
    .prepare("insert into request_limits(key,count,expires_at) values(?,120,?)")
    .bind(`public:${credentials.id}:false:${minute}`, Date.now() + 60000)
    .run();
  const limited = await result("/api/v1/me", { headers: bearer() }, 429);
  assert.equal(limited.response.headers.get("retry-after"), "60");
  await result("/api/v1/api-keys/" + credentials.id, {
    method: "DELETE",
    cookie: ownerCookie,
  });
  await result("/api/v1/me", { headers: bearer() }, 401);
  await result(
    "/mcp",
    {
      method: "POST",
      headers: bearer(),
      body: { jsonrpc: "2.0", id: 1, method: "tools/list" },
    },
    401,
  );
});
