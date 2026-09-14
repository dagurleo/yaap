import { fileURLToPath } from "node:url";
import { seedPostgres } from "../scripts/seed-site.mjs";
import { postgresFixture } from "./helpers/postgres.mjs";
import { createHash, createHmac } from "node:crypto";
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { toJSON } from "seroval";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";

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
  const modules = (await readdir(directory, { recursive: true })).filter(
    (file) => file.endsWith(".js"),
  );
  for (const file of modules) {
    const code = await readFile(join(directory, file), "utf8");
    for (const match of code.matchAll(/id: "([a-f0-9]+)",\s*name: "(\w+Fn)"/g))
      serverFns[match[2]] = match[1];
  }
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
        YAAP_DEMO_SITE_ID: "demo-refresh-fixture",
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

test("fresh migrations support app and auth health; private API rejects anonymous reads", async () => {
  const health = await request("/health");
  assert.equal(health.status, 200);
  assert.equal((await health.json()).database, usePostgres ? "postgres" : "d1");
  assert.equal((await request("/api/auth/ok")).status, 200);
  assert.deepEqual(await (await request("/api/setup")).json(), {
    setupRequired: true,
  });
  assert.equal((await request("/api/sites")).status, 401);
  assert.equal((await request("/api/billing")).status, 401);
  const billingTableCount = usePostgres
    ? await db
        .prepare(
          "SELECT COUNT(*) AS count FROM information_schema.tables WHERE table_schema='public' AND table_name LIKE 'billing_%'",
        )
        .first()
    : await db
        .prepare(
          "SELECT COUNT(*) AS count FROM sqlite_master WHERE type='table' AND name LIKE 'billing_%'",
        )
        .first();
  assert.equal(billingTableCount.count, 8);
  const landing = await request("/");
  assert.equal(landing.status, 200);
  assert.match(await landing.text(), /See what brings people in/);
  const pricing = await request("/pricing");
  assert.equal(pricing.status, 200);
  const pricingHtml = await pricing.text();
  assert.match(pricingHtml, /All the analytics/);
  assert.match(pricingHtml, /Hosted plans are coming soon/);
  assert.doesNotMatch(pricingHtml, /class="site-header/);
  assert.doesNotMatch(pricingHtml, /Start your free trial/);
  const workspace = await request("/app");
  assert.equal(workspace.status, 307);
  assert.match(workspace.headers.get("location"), /\/setup/);
  const setup = await request("/setup");
  assert.equal(setup.status, 200);
  assert.match(await setup.text(), /Make this your own/);
});

test("root favicon serves the published brand icon", async () => {
  const response = await request("/favicon.ico");
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "public, max-age=86400");
});

test("registration requires setup secret and same origin; concurrent setup creates one owner", async () => {
  const body = {
    name: "Owner",
    email: "owner@example.com",
    password,
    setupSecret,
  };
  assert.equal(
    (
      await request("/api/setup", {
        method: "POST",
        body,
        requestOrigin: "https://evil.example",
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await request("/api/setup", {
        method: "POST",
        body: { ...body, setupSecret: "incorrect" },
      })
    ).status,
    403,
  );
  const publicSignup = await request("/api/auth/sign-up/email", {
    method: "POST",
    body,
  });
  assert.ok(publicSignup.status >= 400);
  assert.equal(
    (
      await request("/api/registration", {
        method: "POST",
        body,
      })
    ).status,
    404,
  );
  const responses = await Promise.all([
    request("/api/setup", { method: "POST", body }),
    request("/api/setup", {
      method: "POST",
      body: { ...body, email: "second@example.com" },
    }),
  ]);
  const successes = responses.filter((response) => response.ok);
  assert.equal(
    successes.length,
    1,
    await Promise.all(responses.map((r) => r.clone().text())).then(
      JSON.stringify,
    ),
  );
  ownerCookie = cookies(successes[0]);
  const signedUp = await successes[0].json();
  ownerEmail = signedUp.user.email;
  assert.match(ownerCookie, /session_token/);
  assert.match(successes[0].headers.get("set-cookie"), /HttpOnly/i);
  assert.match(successes[0].headers.get("set-cookie"), /Secure/i);
  assert.equal(
    (await db.prepare('SELECT COUNT(*) AS count FROM "user"').first()).count,
    1,
  );
  assert.deepEqual(await (await request("/api/setup")).json(), {
    setupRequired: false,
  });
  const billing = await request("/api/billing", { cookie: ownerCookie });
  assert.equal(billing.status, 200, await billing.clone().text());
  assert.deepEqual(await billing.json(), {
    mode: "self_hosted",
    workspaceId: (
      await db
        .prepare(
          'SELECT id FROM workspaces WHERE owner_user_id=(SELECT id FROM "user" WHERE email=?)',
        )
        .bind(ownerEmail)
        .first()
    ).id,
    catalogVersion: null,
    plans: [],
    entitlements: {
      state: "self_hosted",
      canCollect: true,
      canReadRetainedReports: true,
      canManageAnalytics: true,
      canManageBilling: false,
      collectionPauseReason: null,
      planKey: null,
      period: null,
      usageRatio: null,
      warningThreshold: null,
    },
  });
  assert.equal(
    (await request("/api/setup", { method: "POST", body })).status,
    409,
  );
});

test("owner creates site; ingest validates origin and persists through the queue exactly once", async () => {
  const create = await request("/api/sites", {
    method: "POST",
    cookie: ownerCookie,
    body: { name: "Example", origin: "https://example.com" },
  });
  assert.equal(create.status, 201, await create.clone().text());
  site = await create.json();
  const event = {
    version: 1,
    id: "event-1",
    siteId: site.id,
    name: "pageview",
    path: "/welcome?token=private#fragment",
  };
  assert.equal(
    (
      await request("/ingest", {
        method: "POST",
        body: event,
        requestOrigin: "https://evil.example",
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await request("/ingest", {
        method: "POST",
        body: { ...event, version: 3 },
        requestOrigin: site.origin,
      })
    ).status,
    400,
  );
  const send = () =>
    request("/ingest", {
      method: "POST",
      body: event,
      requestOrigin: site.origin,
    });
  assert.equal((await send()).status, 202);
  await eventually(
    async () =>
      (await db.prepare("SELECT COUNT(*) AS count FROM events").first())
        .count === 1,
  );
  assert.equal((await send()).status, 202);
  // Explicit queue replay tests the consumer, independently of HTTP delivery.
  const worker = await mf.getWorker();
  await worker.queue("events", [
    {
      id: "replay",
      timestamp: new Date(),
      attempts: 2,
      body: { ...event, path: "/welcome", receivedAt: Date.now() },
    },
  ]);
  const response = await request(`/api/sites/${site.id}/events`, {
    cookie: ownerCookie,
  });
  const result = await response.json();
  assert.equal(result.total, 1);
  assert.equal(result.events[0].path, "/welcome");
  assert.equal((await request(`/api/sites/${site.id}/events`)).status, 401);
  assert.equal(
    (await request("/api/sites/missing/events", { cookie: ownerCookie }))
      .status,
    404,
  );
  assert.equal(
    (
      await request("/api/sites", {
        method: "POST",
        cookie: ownerCookie,
        requestOrigin: "https://evil.example",
        body: { name: "Bad", origin: "https://evil.example" },
      })
    ).status,
    403,
  );
});

test("billing receipts reserve shared capacity and persist usage exactly once", async () => {
  const workspace = await db
    .prepare("SELECT workspace_id AS id FROM sites WHERE id=?")
    .bind(site.id)
    .first();
  const now = Date.now();
  const periodId = "test-metered-period";
  await db.batch([
    db
      .prepare(
        `INSERT INTO billing_accounts(workspace_id,environment,trial_starts_at,trial_ends_at,created_at,updated_at)
         VALUES(?,'sandbox',?,?,?,?)`,
      )
      .bind(workspace.id, now - 1000, now + 60000, now, now),
    db
      .prepare(
        `INSERT INTO billing_usage_periods(id,workspace_id,source,source_id,plan_version,starts_at,ends_at,allowance,admission_ceiling,created_at,updated_at)
         VALUES(?,?,'trial',?,1,?,?,2,2,?,?)`,
      )
      .bind(
        periodId,
        workspace.id,
        workspace.id,
        now - 1000,
        now + 60000,
        now,
        now,
      ),
  ]);
  const receipt = (index) =>
    db
      .prepare(
        `INSERT INTO billing_event_receipts(id,workspace_id,site_id,site_label,event_id,period_id,ingressed_at,state,payload,publish_state,next_publish_at,replay_until,updated_at)
         VALUES(?,?,?,?,?,? ,?,'reserved',?,'pending',?,?,?)`,
      )
      .bind(
        `meter-receipt-${index}`,
        workspace.id,
        site.id,
        "Example at admission",
        `meter-event-${index}`,
        periodId,
        now,
        JSON.stringify({ version: 1, id: `meter-event-${index}` }),
        now,
        now + 86400000,
        now,
      )
      .run();
  const reservations = await Promise.allSettled([
    receipt(1),
    receipt(2),
    receipt(3),
  ]);
  assert.equal(
    reservations.filter((result) => result.status === "fulfilled").length,
    2,
  );
  const admitted = await db
    .prepare(
      'SELECT id,event_id AS "eventId" FROM billing_event_receipts WHERE period_id=? ORDER BY id',
    )
    .bind(periodId)
    .all();
  assert.equal(admitted.results.length, 2);
  for (const row of admitted.results)
    await db
      .prepare(
        `INSERT INTO events(id,site_id,name,path,received_at,tracking_version,billing_receipt_id)
         VALUES(?,?,'pageview','/metered',?,1,?)`,
      )
      .bind(row.eventId, site.id, now, row.id)
      .run();
  const period = await db
    .prepare(
      'SELECT persisted_count AS persisted,reserved_count AS reserved,notified_80_at AS "notified80",notified_100_at AS "notified100",notified_ceiling_at AS "notifiedCeiling" FROM billing_usage_periods WHERE id=?',
    )
    .bind(periodId)
    .first();
  assert.equal(period.persisted, 2);
  assert.equal(period.reserved, 0);
  assert.equal(typeof period.notified80, "number");
  assert.equal(typeof period.notified100, "number");
  assert.equal(typeof period.notifiedCeiling, "number");
  assert.deepEqual(
    (
      await db
        .prepare(
          "SELECT kind FROM billing_notification_jobs WHERE period_id=? ORDER BY kind",
        )
        .bind(periodId)
        .all()
    ).results.map((row) => row.kind),
    ["usage_100", "usage_80", "usage_ceiling"],
  );
  assert.deepEqual(
    await db
      .prepare(
        "SELECT persisted_count AS persisted,site_label AS label FROM billing_usage_sites WHERE period_id=? AND site_id=?",
      )
      .bind(periodId, site.id)
      .first(),
    { persisted: 2, label: "Example at admission" },
  );
  await assert.rejects(() => receipt(4));
  await assert.rejects(() =>
    db
      .prepare(
        `INSERT INTO events(id,site_id,name,path,received_at,tracking_version,billing_receipt_id)
         VALUES('unreserved-event',?,'pageview','/metered',?,1,'missing-receipt')`,
      )
      .bind(site.id, now)
      .run(),
  );
});

test("website viewers register through an invitation, read only that site, and lose access immediately", async () => {
  const token = "v".repeat(43);
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const owner = await db
    .prepare('SELECT id FROM "user" WHERE email=?')
    .bind(ownerEmail)
    .first();
  const now = Date.now();
  await db
    .prepare(
      `INSERT INTO site_invitations(id,site_id,email_normalized,token_hash,created_by_user_id,created_at,expires_at,last_sent_at,send_status)
       VALUES('viewer-invite',?,?,?,?,?,?,?,'sent')`,
    )
    .bind(
      site.id,
      "viewer@example.com",
      tokenHash,
      owner.id,
      now,
      now + 7 * 86400000,
      now,
    )
    .run();

  const landing = await request(`/invite/${token}`);
  assert.equal(landing.status, 200);
  assert.match(await landing.text(), /view all analytics/i);
  assert.equal(
    (await db.prepare("SELECT count(*) AS count FROM site_memberships").first())
      .count,
    0,
  );
  const wrong = await request(`/api/invitations/${token}/register`, {
    method: "POST",
    body: {
      name: "Viewer",
      email: "wrong@example.com",
      password: "viewer-password-2026",
    },
  });
  assert.equal(wrong.status, 404);
  assert.equal(
    (
      await request(`/api/invitations/${token}/accept`, {
        method: "POST",
        cookie: ownerCookie,
      })
    ).status,
    403,
  );
  const registration = await request(`/api/invitations/${token}/register`, {
    method: "POST",
    body: {
      name: "Viewer",
      email: "Viewer@Example.com",
      password: "viewer-password-2026",
    },
  });
  assert.equal(registration.status, 200, await registration.clone().text());
  const viewerCookie = cookies(registration);
  const registered = await registration.json();
  assert.equal(registered.user.emailVerified, true);
  assert.equal(
    (await db.prepare("SELECT count(*) AS count FROM workspaces").first())
      .count,
    1,
  );
  assert.equal(
    (await request("/api/billing", { cookie: viewerCookie })).status,
    403,
  );
  assert.deepEqual(
    await (await request("/api/sites", { cookie: viewerCookie })).json(),
    [],
  );

  const preview = await request(`/api/invitations/${token}`, {
    cookie: viewerCookie,
  }).then((response) => response.json());
  assert.equal(preview.emailMatches, true);
  assert.equal(preview.status, "pending");
  const accepted = await request(`/api/invitations/${token}/accept`, {
    method: "POST",
    cookie: viewerCookie,
  });
  assert.equal(accepted.status, 200, await accepted.clone().text());
  const shared = await request("/api/sites", { cookie: viewerCookie }).then(
    (response) => response.json(),
  );
  assert.equal(shared.length, 1);
  assert.equal(shared[0].id, site.id);
  assert.equal(shared[0].access, "viewer");
  const sharingAttempt = await request(
    `/_serverFn/${serverFns.savePublicSharingFn}`,
    {
      method: "POST",
      cookie: viewerCookie,
      body: toJSON({
        data: {
          siteId: site.id,
          settings: {
            enabled: true,
            events: true,
            visitors: true,
            revenue: true,
            conversions: true,
          },
        },
      }),
    },
  );
  assert.match(await sharingAttempt.text(), /Website not found/);
  assert.equal(
    await db
      .prepare(
        "SELECT count(*) AS count FROM site_public_shares WHERE site_id=?",
      )
      .bind(site.id)
      .first()
      .then((row) => row.count),
    0,
  );

  assert.equal(shared[0].capabilities.manageSite, false);
  assert.deepEqual(Object.keys(shared[0]).sort(), [
    "access",
    "capabilities",
    "id",
    "name",
    "origin",
    "timezone",
  ]);
  assert.equal(
    (
      await request(`/api/sites/${site.id}/overview?days=7`, {
        cookie: viewerCookie,
      })
    ).status,
    200,
  );
  assert.equal(
    (await request(`/api/sites/${site.id}/events`, { cookie: viewerCookie }))
      .status,
    200,
  );
  assert.equal(
    (
      await request(`/api/sites/${site.id}/operations`, {
        cookie: viewerCookie,
      })
    ).status,
    404,
  );
  assert.equal(
    (
      await request(`/api/sites/${site.id}/goals`, {
        method: "POST",
        cookie: viewerCookie,
        body: { name: "Forbidden", eventName: "forbidden" },
      })
    ).status,
    404,
  );
  assert.equal(
    (await request(`/api/sites/${site.id}/people`, { cookie: viewerCookie }))
      .status,
    404,
  );

  const people = await request(`/api/sites/${site.id}/people`, {
    cookie: ownerCookie,
  }).then((response) => response.json());
  assert.equal(people.members.length, 1);
  assert.equal(people.members[0].email, "viewer@example.com");
  const removed = await request(
    `/api/sites/${site.id}/members/${people.members[0].userId}`,
    { method: "DELETE", cookie: ownerCookie },
  );
  assert.equal(removed.status, 200);
  assert.deepEqual(
    await (await request("/api/sites", { cookie: viewerCookie })).json(),
    [],
  );
  assert.equal(
    (await request(`/api/sites/${site.id}/events`, { cookie: viewerCookie }))
      .status,
    404,
  );
  assert.equal(
    (
      await request(`/api/invitations/${token}/accept`, {
        method: "POST",
        cookie: viewerCookie,
      })
    ).status,
    410,
  );
});

test("invitation send failures remain revocable without exposing tokens", async () => {
  const response = await request(`/api/sites/${site.id}/invitations`, {
    method: "POST",
    cookie: ownerCookie,
    body: { email: "pending@example.com" },
  });
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), {
    error: "Email sending is not configured.",
  });
  const people = await request(`/api/sites/${site.id}/people`, {
    cookie: ownerCookie,
  }).then((result) => result.json());
  const invitation = people.invitations.find(
    (item) => item.email === "pending@example.com",
  );
  assert.equal(invitation.sendStatus, "failed");
  assert.equal("token" in invitation, false);
  assert.equal("tokenHash" in invitation, false);
  assert.equal(
    (
      await request(
        `/api/sites/${site.id}/invitations/${invitation.id}/revoke`,
        { method: "POST", cookie: ownerCookie },
      )
    ).status,
    200,
  );
});

test("Start renders private pages on the server and guards every server function", async () => {
  for (const report of [
    "overview",
    "visitors",
    "funnels",
    "revenue",
    "events",
    "settings",
  ]) {
    const legacy = await request(
      `/sites/${site.id}/${report}?days=30&country=JP`,
    );
    assert.equal(legacy.status, 308);
    assert.equal(
      legacy.headers.get("location"),
      `${origin}/app/${site.id}/${report}?days=30&country=JP`,
    );
  }
  const siteHome = await request(`/app/${site.id}?days=30`, {
    cookie: ownerCookie,
  });
  assert.equal(siteHome.status, 307);
  const destination = new URL(siteHome.headers.get("location"), origin);
  assert.equal(destination.pathname, `/app/${site.id}/overview`);
  assert.equal(destination.searchParams.get("days"), "30");
  // The marketing route stays public, while the workspace entry retains its guard.
  for (const cookie of [undefined, ownerCookie]) {
    const landing = await request("/", { cookie });
    assert.equal(landing.status, 200);
    const markup = await landing.text();
    assert.match(markup, /See what brings people in/);
    assert.doesNotMatch(markup, /owner@example.com|test-bootstrap-/);
  }
  const workspace = await request("/app");
  assert.equal(workspace.status, 307);
  assert.match(workspace.headers.get("location"), /\/login/);
  const ownerWorkspace = await request("/app", { cookie: ownerCookie });
  assert.equal(ownerWorkspace.status, 200);
  const directoryHtml = await ownerWorkspace.text();
  assert.match(directoryHtml, /Your websites/);
  assert.match(directoryHtml, /Search websites/);
  assert.match(directoryHtml, /Last 7 days/);
  assert.match(directoryHtml, /pageviews/);
  assert.match(directoryHtml, /today/);
  assert.match(directoryHtml, /3 pageviews in the last 7 days, 3 today/);
  assert.ok(directoryHtml.includes(`/app/${site.id}/overview`));
  const billingPage = await request("/app/billing", { cookie: ownerCookie });
  assert.equal(billingPage.status, 200, await billingPage.clone().text());
  assert.match(
    await billingPage.text(),
    /Billing is managed by this installation/,
  );
  for (const path of ["/login", "/setup"]) {
    const signedIn = await request(path, { cookie: ownerCookie });
    assert.equal(signedIn.status, 307);
    assert.match(signedIn.headers.get("location"), /\/app$/);
  }
  const anonymous = await request(`/app/${site.id}/events`);
  assert.equal(anonymous.status, 307);
  assert.match(anonymous.headers.get("location"), /\/login/);
  const page = await request(`/app/${site.id}/events`, {
    cookie: ownerCookie,
  });
  assert.equal(page.status, 200, await page.clone().text());
  assert.match(page.headers.get("cache-control"), /no-store/);
  const html = await page.text();
  assert.match(html, /<h1[^>]*>Events &amp; installation<\/h1>/);
  assert.match(html, /\/welcome/);
  assert.doesNotMatch(
    html,
    /test-auth-|test-bootstrap-|BOOTSTRAP_SECRET|BETTER_AUTH_SECRET/,
  );
  const login = await request("/login");
  assert.match(await login.text(), /Welcome back/);
  // Anonymous request after a private SSR request must not see cached owner data.
  const anonymousAgain = await request(`/app/${site.id}/events`);
  assert.match(anonymousAgain.headers.get("location"), /\/login/);
  assert.doesNotMatch(await anonymousAgain.text(), /\/welcome/);
  assert.ok(serverFns.sitesFn && serverFns.addSiteFn && serverFns.eventsFn);
  const path = (name) => `/_serverFn/${serverFns[name]}`;
  const anonFn = await request(path("sitesFn"));
  assert.match(await anonFn.clone().text(), /login/);
  assert.doesNotMatch(await anonFn.text(), /Example/);
  const listed = await request(path("sitesFn"), { cookie: ownerCookie });
  assert.equal(listed.status, 200);
  assert.match(await listed.text(), /Example/);
  const getEvents = (siteId) =>
    path("eventsFn") +
    "?payload=" +
    encodeURIComponent(JSON.stringify(toJSON({ data: { siteId } })));
  assert.equal(
    (await request(getEvents(site.id), { cookie: ownerCookie })).status,
    200,
  );
  const missing = await request(getEvents("missing"), { cookie: ownerCookie });
  assert.match(await missing.text(), /Website not found/);
  const before = (
    await db.prepare("SELECT count(*) AS count FROM sites").first()
  ).count;
  const body = toJSON({
    data: { name: "From React", origin: "https://react.example.com" },
  });
  const forbidden = await request(path("addSiteFn"), {
    method: "POST",
    cookie: ownerCookie,
    requestOrigin: "https://evil.example",
    body,
  });
  assert.equal(forbidden.status, 403);
  const noSession = await request(path("addSiteFn"), { method: "POST", body });
  assert.match(await noSession.clone().text(), /login/);
  assert.equal(
    (await db.prepare("SELECT count(*) AS count FROM sites").first()).count,
    before,
  );
  const created = await request(path("addSiteFn"), {
    method: "POST",
    cookie: ownerCookie,
    body,
  });
  assert.equal(created.status, 200, await created.clone().text());
  assert.equal(
    (await db.prepare("SELECT count(*) AS count FROM sites").first()).count,
    before + 1,
  );
});

test("traffic reports respect UTC boundaries, pageview semantics, ranking and access", async () => {
  const DAY = 86400000;
  const today = Math.floor(Date.now() / DAY) * DAY;
  const start = today - 6 * DAY;
  const created = await request("/api/sites", {
    method: "POST",
    cookie: ownerCookie,
    body: { name: "Report fixture", origin: "https://report.example.com" },
  });
  const reportSite = await created.json();
  const fixture = [
    ["boundary", "pageview", "/first", start],
    ["before", "pageview", "/older", start - 1],
    ["last-ms", "pageview", "/first", start + DAY - 1],
    ["next-day", "pageview", "/second", start + DAY],
    ["custom", "signup", "/not-a-pageview", today],
    ["future", "pageview", "/future", today + 2 * DAY],
  ];
  for (let index = 0; index < 12; index++)
    fixture.push([
      `page-${index}`,
      "pageview",
      `/page-${String(index).padStart(2, "0")}`,
      today,
    ]);
  await db.batch(
    fixture.map(([id, name, path, at]) =>
      db
        .prepare(
          "INSERT INTO events (id, site_id, name, path, received_at) VALUES (?, ?, ?, ?, ?)",
        )
        .bind(id, reportSite.id, name, path, at),
    ),
  );
  const getReport = (days) =>
    request(`/api/sites/${reportSite.id}/overview?days=${days}`, {
      cookie: ownerCookie,
    });
  const result = await (await getReport(7)).json();
  assert.equal(result.pageviews, 15);
  assert.equal(result.pagesViewed, 14);
  assert.equal(result.series.length, 7);
  assert.deepEqual(
    result.series.map((day) => day.pageviews),
    [2, 1, 0, 0, 0, 0, 12],
  );
  assert.equal(
    result.series.reduce((sum, day) => sum + day.pageviews, 0),
    result.pageviews,
  );
  assert.equal(result.pages.length, 10);
  assert.deepEqual(result.pages[0], { path: "/first", pageviews: 2 });
  assert.equal(result.pages[1].path, "/page-00");
  assert.equal(result.lastPageviewAt, today);
  const longer = await (await getReport(30)).json();
  assert.equal(longer.pageviews, 16);
  assert.equal(longer.series.length, 30);
  assert.equal((await (await getReport(90)).json()).series.length, 90);
  assert.equal((await getReport(365)).status, 400);
  assert.equal((await getReport("invalid")).status, 400);
  assert.equal(
    (await request(`/api/sites/${reportSite.id}/overview`)).status,
    401,
  );
  assert.equal(
    (await request("/api/sites/missing/overview", { cookie: ownerCookie }))
      .status,
    404,
  );
  const empty = await request("/api/sites", {
    method: "POST",
    cookie: ownerCookie,
    body: { name: "Empty fixture", origin: "https://empty.example.com" },
  }).then((r) => r.json());
  const emptyReport = await request(`/api/sites/${empty.id}/overview`, {
    cookie: ownerCookie,
  }).then((r) => r.json());
  assert.equal(emptyReport.pageviews, 0);
  assert.equal(emptyReport.pagesViewed, 0);
  assert.equal(emptyReport.lastPageviewAt, null);
  assert.deepEqual(emptyReport.pages, []);
  assert.equal(emptyReport.series.length, 7);
  assert.ok(emptyReport.series.every((day) => day.pageviews === 0));
  const page = await request(`/app/${reportSite.id}/overview?days=30`, {
    cookie: ownerCookie,
  });
  assert.equal(page.status, 200);
  assert.match(page.headers.get("cache-control"), /no-store/);
  assert.match(await page.text(), /<h1[^>]*>Overview<\/h1>/);
  assert.equal((await request(`/app/${reportSite.id}/overview`)).status, 307);
  const fnPath =
    `/_serverFn/${serverFns.overviewFn}?payload=` +
    encodeURIComponent(
      JSON.stringify(toJSON({ data: { siteId: reportSite.id, days: 7 } })),
    );
  assert.match(await (await request(fnPath)).text(), /login/);
  const fnResult = await request(fnPath, { cookie: ownerCookie });
  assert.equal(fnResult.status, 200);
  assert.match(await fnResult.text(), /pageviews/);
});

test("v2 tracking persists sanitized sources and consented identity without inflating pageviews", async () => {
  const newSite = await request("/api/sites", {
    method: "POST",
    cookie: ownerCookie,
    body: { name: "Tracking fixture", origin: "https://tracking.example.com" },
  }).then((r) => r.json());
  const visitorId = "11111111-1111-4111-8111-111111111111";
  const sessionId = "22222222-2222-4222-8222-222222222222";
  const secondSessionId = "33333333-3333-4333-8333-333333333333";
  const base = {
    version: 2,
    siteId: newSite.id,
    path: "/landing?secret=hidden#fragment",
    name: "pageview",
    referrer: "https://referrer.example/private?token=hidden",
    utmSource: "newsletter",
    utmMedium: "email",
    utmCampaign: "launch",
    consent: true,
    visitorId,
    sessionId,
  };
  const send = (event) =>
    request("/ingest", {
      method: "POST",
      requestOrigin: newSite.origin,
      body: { ...base, ...event },
    });
  assert.equal(
    (await send({ id: "identity-disabled", identityEnabled: false })).status,
    400,
  );
  assert.equal(
    (await send({ id: "identity-without-consent", consent: false })).status,
    400,
  );
  assert.equal(
    (await send({ id: "invalid-identity", visitorId: "person@example.com" }))
      .status,
    400,
  );
  assert.equal(
    (await send({ id: "unsafe-campaign", utmCampaign: "person@example.com" }))
      .status,
    400,
  );
  assert.equal(
    (await send({ id: "unsafe-referrer", referrer: "javascript:alert(1)" }))
      .status,
    400,
  );
  assert.equal(
    (await send({ id: "view-one", identityEnabled: true, consent: undefined }))
      .status,
    202,
  );
  assert.equal((await send({ id: "view-one" })).status, 202);
  assert.equal(
    (await send({ id: "view-two", sessionId: secondSessionId })).status,
    202,
  );
  assert.equal(
    (
      await send({
        id: "custom-one",
        name: "signup",
        sessionId: secondSessionId,
      })
    ).status,
    202,
  );
  assert.equal(
    (
      await send({
        id: "aggregate",
        consent: false,
        visitorId: null,
        sessionId: null,
        referrer: newSite.origin + "/internal",
        utmSource: null,
        utmMedium: null,
        utmCampaign: null,
      })
    ).status,
    202,
  );
  await eventually(
    async () =>
      (
        await db
          .prepare("SELECT count(*) AS count FROM events WHERE site_id = ?")
          .bind(newSite.id)
          .first()
      ).count === 4,
  );
  const row = await db
    .prepare("SELECT * FROM events WHERE site_id = ? AND id = 'view-one'")
    .bind(newSite.id)
    .first();
  assert.equal(row.path, "/landing");
  assert.equal(row.referrer_host, "referrer.example");
  assert.match(row.visitor_id, /^[a-f0-9]{64}$/);
  assert.notEqual(row.visitor_id, visitorId);
  assert.doesNotMatch(JSON.stringify(row), /hidden|private|11111111/);
  const report = await request(`/api/sites/${newSite.id}/overview`, {
    cookie: ownerCookie,
  }).then((r) => r.json());
  assert.equal(report.pageviews, 3);
  assert.equal(report.identifiedPageviews, 2);
  assert.deepEqual(report.identities, { visitors: 1, sessions: 2 });
  assert.deepEqual(report.customTotals, { count: 1, names: 1 });
  assert.deepEqual(report.customEvents[0], {
    name: "signup",
    count: 1,
    visitors: 1,
    sessions: 1,
  });
  assert.deepEqual(report.campaigns[0], {
    source: "newsletter",
    medium: "email",
    campaign: "launch",
    pageviews: 2,
  });
  assert.deepEqual(report.referrers, [
    { host: "referrer.example", pageviews: 2 },
  ]);
  assert.deepEqual(report.sources, [
    { source: "Campaign · newsletter", pageviews: 2 },
    { source: "Direct / unknown", pageviews: 1 },
  ]);
  const oldReport = await request(`/api/sites/${site.id}/overview`, {
    cookie: ownerCookie,
  }).then((r) => r.json());
  assert.equal(oldReport.sources[0].source, "Not recorded");
  assert.deepEqual(oldReport.identities, { visitors: 0, sessions: 0 });
  // A visitor active on multiple UTC days is counted once over the full range.
  const today = Math.floor(Date.now() / 86400000) * 86400000;
  await db
    .prepare(
      "UPDATE events SET received_at = ? WHERE site_id = ? AND id = 'view-one'",
    )
    .bind(today - 86400000, newSite.id)
    .run();
  const crossDay = await request(`/api/sites/${newSite.id}/overview`, {
    cookie: ownerCookie,
  }).then((r) => r.json());
  assert.equal(crossDay.identities.visitors, 1);
  assert.equal(crossDay.identities.sessions, 2);
});

test("goals count sessions once, include historical events, and protect mutations", async () => {
  const fixture = await request("/api/sites", {
    method: "POST",
    cookie: ownerCookie,
    body: { name: "Goals fixture", origin: "https://goals.example.com" },
  }).then((r) => r.json());
  const base = `/api/sites/${fixture.id}`;
  const create = (body, options = {}) =>
    request(base + "/goals", {
      method: "POST",
      cookie: ownerCookie,
      body,
      ...options,
    });
  const goalInput = {
    name: "Sign up",
    eventName: "signup",
    icon: "user-plus",
  };
  assert.equal((await create(goalInput, { cookie: undefined })).status, 401);
  assert.equal(
    (await create(goalInput, { requestOrigin: "https://evil.example" })).status,
    403,
  );
  for (const eventName of ["pageview", "bad name", "", "a".repeat(65)])
    assert.equal((await create({ ...goalInput, eventName })).status, 400);
  assert.equal(
    (await create({ ...goalInput, eventName: "other", icon: "invalid" }))
      .status,
    400,
  );
  const day = 86400000,
    today = Math.floor(Date.now() / day) * day,
    start = today - 6 * day;
  const rows = [
    ["first", "signup", start, "one"],
    ["repeat", "signup", today, "one"],
    ["anonymous", "signup", today, null],
    ["nonconvert", "pageview", today, "two"],
    ["before", "signup", start - 1, "old"],
    ["future", "signup", today + day, "future"],
    ["case", "Signup", today, "two"],
  ];
  await db.batch(
    rows.map(([id, name, at, session]) =>
      db
        .prepare(
          "INSERT INTO events (id,site_id,name,path,received_at,session_id,visitor_id,tracking_version) VALUES (?,?,?,'/',?,?,?,2)",
        )
        .bind(id, fixture.id, name, at, session, session),
    ),
  );
  const created = await create(goalInput);
  assert.equal(created.status, 201);
  const goal = await created.json();
  assert.equal(goal.icon, "user-plus");
  const duplicates = await Promise.all([create(goalInput), create(goalInput)]);
  assert.ok(duplicates.every((r) => r.status === 409));
  const report = (days = 7) =>
    request(base + `/overview?days=${days}`, { cookie: ownerCookie }).then(
      (r) => r.json(),
    );
  let result = await report();
  assert.equal(result.identities.sessions, 2);
  assert.equal(result.goals[0].completions, 3);
  assert.equal(result.goals[0].identifiedCompletions, 2);
  assert.equal(result.goals[0].convertedSessions, 1);
  assert.equal(result.goals[0].conversionRate, 0.5);
  assert.equal((await report(30)).goals[0].completions, 4);
  // Both the summary and dimension-filtered paths include prior goal conversion rates.
  for (const suffix of ["", "&path=%2F"]) {
    const compared = await request(
      base + `/overview?days=7&compare=true${suffix}`,
      {
        cookie: ownerCookie,
      },
    ).then((response) => response.json());
    const priorGoal = compared.comparison.goals.find(
      (entry) => entry.id === goal.id,
    );
    assert.equal(priorGoal.convertedSessions, 1);
    assert.equal(priorGoal.conversionRate, 1);
  }
  const emptyPriorPeriod = await request(
    base + "/overview?days=30&compare=true",
    {
      cookie: ownerCookie,
    },
  ).then((response) => response.json());
  assert.equal(emptyPriorPeriod.comparison.goals[0].convertedSessions, 0);
  assert.equal(emptyPriorPeriod.comparison.goals[0].conversionRate, null);
  const patch = (id, body, options = {}) =>
    request(base + `/goals/${id}`, {
      method: "PATCH",
      cookie: ownerCookie,
      body,
      ...options,
    });
  assert.equal(
    (await patch(goal.id, { archived: true }, { cookie: undefined })).status,
    401,
  );
  assert.equal(
    (
      await patch(
        goal.id,
        { archived: true },
        { requestOrigin: "https://evil.example" },
      )
    ).status,
    403,
  );
  assert.equal((await patch(goal.id, { archived: "true" })).status, 400);
  assert.equal((await patch("missing", { archived: true })).status, 404);
  assert.equal(
    (
      await request(`/api/sites/${site.id}/goals/${goal.id}`, {
        method: "PATCH",
        cookie: ownerCookie,
        body: { archived: true },
      })
    ).status,
    404,
  );
  assert.equal((await patch(goal.id, { archived: true })).status, 200);
  assert.equal((await report()).goals[0].archived, true);
  assert.equal((await create(goalInput)).status, 409);
  assert.equal((await patch(goal.id, { archived: false })).status, 200);
  result = await report();
  assert.equal(result.goals[0].archived, false);
  assert.equal(result.goals[0].completions, 3);
  const zeroGoal = await request(`/api/sites/${site.id}/goals`, {
    method: "POST",
    cookie: ownerCookie,
    body: goalInput,
  });
  assert.equal(zeroGoal.status, 201);
  const zero = await request(`/api/sites/${site.id}/overview`, {
    cookie: ownerCookie,
  }).then((r) => r.json());
  assert.equal(zero.goals[0].completions, 0);
  assert.equal(zero.goals[0].conversionRate, null);
  for (const [name, data] of [
    ["addGoalFn", { siteId: fixture.id, name: "Other", eventName: "other" }],
    ["archiveGoalFn", { siteId: fixture.id, goalId: goal.id, archived: true }],
  ]) {
    assert.ok(serverFns[name]);
    const path = `/_serverFn/${serverFns[name]}`;
    assert.match(
      await (
        await request(path, { method: "POST", body: toJSON({ data }) })
      ).text(),
      /login/,
    );
    assert.equal(
      (
        await request(path, {
          method: "POST",
          cookie: ownerCookie,
          requestOrigin: "https://evil.example",
          body: toJSON({ data }),
        })
      ).status,
      403,
    );
    const missing = await request(path, {
      method: "POST",
      cookie: ownerCookie,
      body: toJSON({ data: { ...data, siteId: "missing" } }),
    });
    assert.match(await missing.text(), /Website not found/);
  }
  const html = await request(`/app/${fixture.id}/overview?days=7`, {
    cookie: ownerCookie,
  }).then((r) => r.text());
  assert.match(html, /Goals &amp; conversions/);
  assert.match(html, /50.0%/);
});

test("request metadata passes through the queue without accepting client-supplied location", async () => {
  const geoSite = await request("/api/sites", {
    method: "POST",
    cookie: ownerCookie,
    body: { name: "Geo fixture", origin: "https://geo.example.com" },
  }).then((r) => r.json());
  const response = await mf.dispatchFetch(origin + "/ingest", {
    method: "POST",
    headers: {
      Origin: geoSite.origin,
      "Content-Type": "application/json",
      "cf-connecting-ip": "192.0.2.5",
      "CF-IPCountry": "US",
      "user-agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
    },
    cf: {
      country: "JP",
      region: "Tokyo",
      city: "Tokyo",
      latitude: "35.6",
      longitude: "139.6",
    },
    body: JSON.stringify({
      version: 2,
      id: "geo-one",
      siteId: geoSite.id,
      name: "pageview",
      path: "/",
      country: "US",
      city: "Fake",
      browser: "Fake",
    }),
  });
  assert.equal(response.status, 202);
  await eventually(
    async () =>
      !!(await db
        .prepare("SELECT id FROM events WHERE site_id=?")
        .bind(geoSite.id)
        .first()),
  );
  const row = await db
    .prepare("SELECT * FROM events WHERE site_id=?")
    .bind(geoSite.id)
    .first();
  assert.equal(row.country, "JP");
  assert.equal(row.city, "Tokyo");
  assert.equal(row.region, "Tokyo");
  assert.equal(row.browser, "Chrome");
  assert.equal(row.os, "Windows");
  assert.equal(row.device, "Desktop");
  assert.equal(row.visitor_id, null);
  assert.equal(row.session_id, null);
  assert.doesNotMatch(
    JSON.stringify(row),
    /Mozilla|192\.0\.2|35\.6|139\.6|Fake/,
  );
  const result = await request(`/api/sites/${geoSite.id}/overview`, {
    cookie: ownerCookie,
  }).then((r) => r.json());
  assert.deepEqual(result.visitorInsights.countries, [
    { country: "JP", pageviews: 1 },
  ]);
  assert.equal(result.visitorInsights.newVisitors, 0);
  assert.equal(result.visitorInsights.liveVisitors, 0);
});

test("visitor cohorts, frequency, geography and live activity respect identity and time boundaries", async () => {
  const fixture = await request("/api/sites", {
    method: "POST",
    cookie: ownerCookie,
    body: { name: "Visitor fixture", origin: "https://visitors.example.com" },
  }).then((r) => r.json());
  const day = 86400000,
    now = Date.now(),
    start = Math.floor(now / day) * day - 6 * day;
  const rows = [
    [
      "older",
      "pageview",
      start - 1,
      "returning",
      "old-session",
      "US",
      "Illinois",
      "Springfield",
    ],
    [
      "return",
      "pageview",
      start,
      "returning",
      "r1",
      "US",
      "Illinois",
      "Springfield",
    ],
    [
      "repeat",
      "pageview",
      start + 1,
      "returning",
      "r1",
      "US",
      "Massachusetts",
      "Springfield",
    ],
    ["new", "pageview", start, "new", "n1", "JP", "Tokyo", "Tokyo"],
    ["new-again", "signup", now, "new", "n2", "JP", "Tokyo", "Tokyo"],
    ["anon", "pageview", now, null, null, null, null, null],
    ["stale", "pageview", now - 301000, "stale", "stale1", null, null, null],
    ["future", "pageview", now + day, "future", "future1", "FR", null, null],
  ];
  for (let i = 0; i < 4; i++)
    rows.push([
      `frequent-${i}`,
      "pageview",
      now,
      "frequent",
      `f${i}`,
      "DK",
      null,
      null,
    ]);
  await db.batch(
    rows.map(([id, name, at, visitor, session, country, region, city]) =>
      db
        .prepare(
          "INSERT INTO events (id,site_id,name,path,received_at,visitor_id,session_id,country,region,city) VALUES (?,?,?,'/',?,?,?,?,?,?)",
        )
        .bind(
          id,
          fixture.id,
          name,
          at,
          visitor,
          session,
          country,
          region,
          city,
        ),
    ),
  );
  const report = (days) =>
    request(`/api/sites/${fixture.id}/overview?days=${days}`, {
      cookie: ownerCookie,
    }).then((r) => r.json());
  const result = await report(7),
    info = result.visitorInsights;
  assert.deepEqual(result.identities, { visitors: 4, sessions: 8 });
  assert.equal(info.newVisitors, 3);
  assert.equal(info.returningVisitors, 1);
  assert.equal(
    info.newVisitors + info.returningVisitors,
    result.identities.visitors,
  );
  assert.equal(info.oneSession, 2);
  assert.equal(info.twoOrThreeSessions, 1);
  assert.equal(info.fourPlusSessions, 1);
  assert.equal(info.sessionsPerVisitor, 2);
  assert.equal(info.liveVisitors, 2);
  assert.equal(
    info.cities.filter((row) => row.city === "Springfield").length,
    2,
  );
  assert.equal(
    info.countries.reduce((sum, row) => sum + row.pageviews, 0),
    result.pageviews,
  );
  assert.equal(info.countries.find((row) => row.country === null).pageviews, 2);
  assert.ok(!info.countries.some((row) => row.country === "FR"));
  assert.equal(
    info.visitorCountries.find((row) => row.country === "US").visitors,
    1,
  );
  assert.equal(
    info.visitorCountries.find((row) => row.country === "DK").visitors,
    1,
  );
  assert.ok(!info.visitorCountries.some((row) => row.country === "FR"));
  assert.equal(
    info.visitorBrowsers.find((row) => row.browser === null).visitors,
    4,
  );
  assert.equal(
    info.visitorOperatingSystems.find((row) => row.os === null).visitors,
    4,
  );
  assert.equal(
    info.visitorDevices.find((row) => row.device === null).visitors,
    4,
  );
  // The same browser is new over a longer window; live activity is independent of that filter.
  const longer = (await report(30)).visitorInsights;
  assert.equal(longer.newVisitors, 4);
  assert.equal(longer.returningVisitors, 0);
  assert.equal(longer.liveVisitors, 2);
  assert.equal(longer.twoOrThreeSessions, 2);
  // Backfilled/out-of-order historical events update first-seen classification correctly.
  await db
    .prepare(
      "INSERT INTO events (id,site_id,name,path,received_at,visitor_id,session_id) VALUES ('backfill',?,'pageview','/',?,'stale','prior')",
    )
    .bind(fixture.id, start - 2)
    .run();
  assert.equal((await report(7)).visitorInsights.returningVisitors, 2);
  // Same visitor ID in another site must never change this site's first-seen date or live count.
  await db
    .prepare(
      "INSERT INTO events (id,site_id,name,path,received_at,visitor_id,session_id) VALUES ('other-site',?,'pageview','/',?,'new','outside')",
    )
    .bind(site.id, start - 3)
    .run();
  assert.equal((await report(7)).visitorInsights.newVisitors, 2);
  assert.equal(
    (await request(`/api/sites/${fixture.id}/overview`)).status,
    401,
  );
  const html = await request(`/app/${fixture.id}/overview?days=7`, {
    cookie: ownerCookie,
  }).then((r) => r.text());
  assert.match(html, /More insights/);
  assert.match(html, /Identified visitors/);
  assert.match(html, /Traffic sources/);
});

test("visitor lists and journeys isolate sites, filter cohorts and goals, and paginate without losing session context", async () => {
  const fixture = await request("/api/sites", {
    method: "POST",
    cookie: ownerCookie,
    body: { name: "Journey fixture", origin: "https://journey.example.com" },
  }).then((r) => r.json());
  const base = `/api/sites/${fixture.id}/visitors`;
  const now = Date.now() - 1000;
  const start = Math.floor(now / 86400000) * 86400000 - 6 * 86400000;
  const insert = (
    id,
    visitor,
    session,
    at,
    name = "pageview",
    path = "/",
    siteId = fixture.id,
  ) =>
    db
      .prepare(
        "INSERT INTO events (id,site_id,name,path,received_at,visitor_id,session_id,country,browser,referrer_host,utm_source,utm_campaign) VALUES (?,?,?,?,?,?,?,'JP','Chrome','example.org','newsletter','launch')",
      )
      .bind(id, siteId, name, path, at, visitor, session);
  await db.batch([
    insert(
      "old",
      "returning-visitor",
      "old-session",
      start - 1,
      "pageview",
      "/original",
    ),
    insert("return", "returning-visitor", "return-session", now),
    insert("anonymous", null, null, now),
    insert("future", "future-visitor", "future-session", now + 86400000),
    insert(
      "journey-other-site",
      "new-visitor",
      "outside",
      start - 100,
      "pageview",
      "/private-other-site",
      site.id,
    ),
    ...Array.from({ length: 103 }, (_, i) =>
      insert(
        `event-${String(i).padStart(3, "0")}`,
        "new-visitor",
        "one-session",
        now,
        i === 102 ? "signup" : "pageview",
        i === 0 ? "/landing" : "/pricing",
      ),
    ),
    ...Array.from({ length: 50 }, (_, i) =>
      insert(
        `visitor-${i}`,
        `quiet-${String(i).padStart(2, "0")}`,
        `session-${i}`,
        now - 100,
      ),
    ),
  ]);
  const goal = await request(`/api/sites/${fixture.id}/goals`, {
    method: "POST",
    cookie: ownerCookie,
    body: { name: "Signed up", eventName: "signup" },
  }).then((r) => r.json());
  const get = (path) =>
    request(path, { cookie: ownerCookie }).then((r) => r.json());
  const list = await get(base);
  assert.equal(list.total, 52);
  assert.equal(list.visitors.length, 50);
  assert.equal(list.visitors[0].visitorId, "new-visitor");
  assert.equal(list.visitors[0].sessions, 1);
  assert.equal(list.visitors[0].pageviews, 102);
  assert.equal(list.visitors[0].country, "JP");
  const page2 = await get(base + "?page=1");
  assert.equal(page2.visitors.length, 2);
  assert.equal(
    new Set([...list.visitors, ...page2.visitors].map((v) => v.visitorId)).size,
    52,
  );
  assert.equal((await get(base + "?cohort=new")).total, 51);
  const returning = await get(base + "?cohort=returning");
  assert.equal(returning.total, 1);
  assert.equal(returning.visitors[0].firstSeen, start - 1);
  assert.equal(returning.visitors[0].sessions, 1);
  const converted = await get(base + `?goalId=${goal.id}`);
  assert.equal(converted.total, 1);
  assert.equal(converted.visitors[0].visitorId, "new-visitor");
  assert.equal(
    (await get(base + `?goalId=${goal.id}&cohort=returning`)).total,
    0,
  );
  const first = await get(base + `/new-visitor?asOf=${list.asOf}`);
  assert.equal(first.events.length, 100);
  assert.equal(first.events[0].id, "event-102");
  assert.equal(first.events[0].goalName, "Signed up");
  assert.equal(first.events[0].entryPath, "/landing");
  assert.equal(first.events[0].utmCampaign, "launch");
  assert.equal(first.sessions, 1);
  assert.equal(first.events[0].sessionStart, now);
  assert.doesNotMatch(JSON.stringify(first), /private-other-site/);
  const next = await get(
    base +
      `/new-visitor?asOf=${list.asOf}&beforeAt=${first.nextCursor.at}&beforeId=${first.nextCursor.id}`,
  );
  assert.equal(next.events.length, 3);
  assert.equal(next.nextCursor, null);
  assert.equal(
    new Set([...first.events, ...next.events].map((e) => e.id)).size,
    103,
  );
  assert.equal(next.events.at(-1).path, "/landing");
  const history = await get(base + `/returning-visitor?asOf=${list.asOf}`);
  assert.equal(history.sessions, 2);
  assert.equal(history.events.at(-1).path, "/original");
  for (const suffix of [
    "?days=8",
    "?cohort=bad",
    "?page=-1",
    "?page=1.5",
    "?goalId=missing",
  ])
    assert.equal(
      (await request(base + suffix, { cookie: ownerCookie })).status,
      400,
    );
  assert.equal((await request(base)).status, 401);
  assert.equal((await request(base + "/new-visitor")).status, 401);
  assert.equal(
    (await request(base + "/missing", { cookie: ownerCookie })).status,
    404,
  );
  assert.equal(
    (
      await request(base + "/new-visitor?beforeAt=oops&beforeId=x", {
        cookie: ownerCookie,
      })
    ).status,
    400,
  );
  assert.equal(
    (await request(`/api/sites/missing/visitors`, { cookie: ownerCookie }))
      .status,
    404,
  );
  for (const [name, data] of [
    [
      "visitorsFn",
      { siteId: fixture.id, days: 7, cohort: "all", goalId: "", page: 0 },
    ],
    [
      "journeyFn",
      { siteId: fixture.id, visitorId: "new-visitor", asOf: list.asOf },
    ],
  ]) {
    assert.ok(serverFns[name]);
    const fnPath = `/_serverFn/${serverFns[name]}?payload=${encodeURIComponent(JSON.stringify(toJSON({ data })))}`;
    assert.match(await (await request(fnPath)).text(), /login/);
    const response = await request(fnPath, { cookie: ownerCookie });
    assert.equal(response.status, 200);
    assert.match(await response.text(), /new-visitor/);
  }
  const html = await request(
    `/app/${fixture.id}/visitors?days=7&cohort=all&goalId=&page=0`,
    { cookie: ownerCookie },
  ).then((r) => r.text());
  assert.match(html, /View journey for Visitor new-visi/);
  assert.match(html, /Consented browsers/);
});

test("shared report filters and custom dates agree across analytics and visitors", async () => {
  const fixture = await request("/api/sites", {
    method: "POST",
    cookie: ownerCookie,
    body: { name: "Filter fixture", origin: "https://filters.example.com" },
  }).then((r) => r.json());
  const base = `/api/sites/${fixture.id}`;
  const today = Math.floor(Date.now() / 86400000) * 86400000,
    start = today - 6 * 86400000;
  const rows = [
    [
      "prior",
      start - 86400000,
      "repeat",
      "prior",
      "JP",
      "Chrome",
      "/pricing",
      "pageview",
    ],
    ["repeat", start, "repeat", "s1", "JP", "Chrome", "/pricing", "pageview"],
    ["new", today, "new", "s2", "JP", "Chrome", "/pricing", "pageview"],
    ["conversion", today, "new", "s2", "JP", "Chrome", "/pricing", "signup"],
    ["anonymous", today, null, null, "JP", "Chrome", "/pricing", "pageview"],
    [
      "other-country",
      today,
      "us",
      "s3",
      "US",
      "Chrome",
      "/pricing",
      "pageview",
    ],
    [
      "other-browser",
      today,
      "safari",
      "s4",
      "JP",
      "Safari",
      "/pricing",
      "pageview",
    ],
    ["other-page", today, "home", "s5", "JP", "Chrome", "/", "pageview"],
    ["unknown", today, "unknown", "s6", null, null, "/", "pageview"],
  ];
  await db.batch(
    rows.map(([id, at, visitor, session, country, browser, path, name]) =>
      db
        .prepare(
          "INSERT INTO events (id,site_id,received_at,visitor_id,session_id,country,browser,path,name,tracking_version,utm_source) VALUES (?,?,?,?,?,?,?,?,?,2,'newsletter')",
        )
        .bind(
          id,
          fixture.id,
          at,
          visitor,
          session,
          country,
          browser,
          path,
          name,
        ),
    ),
  );
  const goal = await request(base + "/goals", {
    method: "POST",
    cookie: ownerCookie,
    body: { name: "Sign up", eventName: "signup" },
  }).then((r) => r.json());
  const query =
    "days=7&country=JP&browser=Chrome&path=%2Fpricing&source=" +
    encodeURIComponent("Campaign · newsletter");
  const get = async (path) => {
    const r = await request(base + path, { cookie: ownerCookie });
    assert.equal(r.status, 200, await r.clone().text());
    return r.json();
  };
  const overview = await get(`/overview?${query}&compare=true`);
  assert.equal(overview.pageviews, 3);
  assert.equal(overview.pagesViewed, 1);
  assert.deepEqual(overview.identities, { visitors: 2, sessions: 2 });
  assert.equal(overview.visitorInsights.newVisitors, 1);
  assert.equal(overview.visitorInsights.returningVisitors, 1);
  assert.equal(overview.goals[0].completions, 1);
  assert.equal(overview.goals[0].conversionRate, 0.5);
  assert.equal(overview.comparison.pageviews, 1);
  assert.equal(overview.comparison.identities.visitors, 1);
  assert.equal(overview.comparison.series.length, 7);
  assert.equal(overview.comparison.end, overview.start);
  assert.equal(
    overview.series.reduce((sum, row) => sum + row.pageviews, 0),
    3,
  );
  assert.equal(overview.sources[0].pageviews, 3);
  assert.equal(overview.visitorInsights.countries.length, 1);
  const visitors = await get(`/visitors?${query}`);
  assert.equal(visitors.total, 2);
  assert.equal(
    visitors.visitors.find((v) => v.visitorId === "repeat").firstSeen,
    start - 86400000,
  );
  assert.equal((await get(`/visitors?${query}&cohort=returning`)).total, 1);
  assert.equal((await get(`/visitors?${query}&goalId=${goal.id}`)).total, 1);
  assert.equal(
    (await get(`/overview?days=7&country=__unknown__`)).pageviews,
    1,
  );
  const from = new Date(start).toISOString().slice(0, 10);
  const custom = await get(
    `/overview?${query}&from=${from}&to=${from}&compare=true`,
  );
  assert.equal(custom.series.length, 1);
  assert.equal(custom.pageviews, 1);
  assert.equal(custom.comparison.pageviews, 1);
  assert.equal(
    (await get(`/visitors?${query}&from=${from}&to=${from}`)).total,
    1,
  );
  for (const bad of [
    "from=2026-02-30&to=2026-03-01",
    "from=2020-01-01&to=2026-01-01",
    "from=2026-01-02&to=2026-01-01",
    "from=2099-01-01&to=2099-01-02",
    "country=not-a-country",
    "compare=oops",
  ])
    assert.equal(
      (await request(`${base}/overview?${bad}`, { cookie: ownerCookie }))
        .status,
      400,
    );
});

test("session metrics use complete matched sessions and live activity stays current across date filters", async () => {
  const fixture = await request("/api/sites", {
    method: "POST",
    cookie: ownerCookie,
    body: { name: "Sessions fixture", origin: "https://sessions.example.com" },
  }).then((r) => r.json());
  const base = `/api/sites/${fixture.id}`;
  const now = Date.now() - 1000,
    day = 86400000,
    start = Math.floor(now / day) * day - 6 * day;
  const rows = [
    ["bounce", "a", "a-session", now, "pageview", "/one", "JP"],
    ["entry", "b", "b-session", start - 1000, "pageview", "/landing", "JP"],
    ["exit", "b", "b-session", start + 59000, "pageview", "/checkout", "JP"],
    ["conversion", "b", "b-session", start + 60000, "signup", "/thanks", "JP"],
    ["custom-only", "c", "c-session", now, "signup", "/custom", "JP"],
    ["anonymous", null, null, now, "pageview", "/anonymous", "JP"],
    ["other-country", "d", "d-session", now, "pageview", "/other", "US"],
    [
      "future",
      "future",
      "future-session",
      now + day,
      "pageview",
      "/future",
      "JP",
    ],
  ];
  const insert = ([id, visitor, session, at, name, path, country]) =>
    db
      .prepare(
        "INSERT INTO events (id,site_id,visitor_id,session_id,received_at,name,path,country) VALUES (?,?,?,?,?,?,?,?)",
      )
      .bind(id, fixture.id, visitor, session, at, name, path, country);
  await db.batch(rows.map(insert));
  const get = async (path) => {
    const response = await request(base + path, { cookie: ownerCookie });
    assert.equal(response.status, 200, await response.clone().text());
    return response.json();
  };
  const report = await get("/overview?country=JP&compare=true");
  assert.equal(report.sessionStats.sessions, 3);
  assert.equal(report.sessionStats.pageviewSessions, 2);
  assert.equal(report.sessionStats.bouncedSessions, 1);
  assert.equal(report.sessionStats.bounceRate, 0.5);
  assert.equal(report.sessionStats.averageDurationMs, 61000 / 3);
  assert.deepEqual(report.sessionStats.entryPages, [
    { path: "/landing", sessions: 1 },
    { path: "/one", sessions: 1 },
  ]);
  assert.deepEqual(report.sessionStats.exitPages, [
    { path: "/checkout", sessions: 1 },
    { path: "/one", sessions: 1 },
  ]);
  assert.equal(report.comparison.sessionStats.bounceRate, 1);
  const page = await get("/overview?path=%2Fcheckout");
  assert.equal(page.pageviews, 1);
  assert.equal(page.sessionStats.bounceRate, 0);
  assert.equal(page.sessionStats.averageDurationMs, 61000);
  assert.equal(page.sessionStats.entryPages[0].path, "/landing");
  const live = await get("/live?country=JP");
  assert.equal(live.visitors, 2);
  assert.deepEqual(
    live.rows.map((row) => row.visitorId),
    ["a", "c"],
  );
  assert.equal(live.rows[1].name, "signup");
  const date = new Date(start).toISOString().slice(0, 10);
  assert.equal(
    (await get(`/overview?country=JP&from=${date}&to=${date}`)).live.visitors,
    2,
  );
  assert.equal((await get("/live?country=JP&path=%2Fone")).visitors, 1);
  assert.equal(
    (await get("/overview?country=FR")).sessionStats.bounceRate,
    null,
  );
  assert.equal(
    (await get("/overview?country=FR")).sessionStats.averageDurationMs,
    null,
  );
  await db.batch(
    Array.from({ length: 25 }, (_, i) =>
      insert([
        `live-${i}`,
        `visitor-${String(i).padStart(2, "0")}`,
        `live-session-${i}`,
        now,
        "pageview",
        "/live",
        "JP",
      ]),
    ),
  );
  const crowded = await get("/live?country=JP");
  assert.equal(crowded.visitors, 27);
  assert.equal(crowded.rows.length, 20);
  assert.equal((await request(base + "/live")).status, 401);
  assert.equal(
    (await request("/api/sites/missing/live", { cookie: ownerCookie })).status,
    404,
  );
  assert.ok(serverFns.liveFn);
  const fnPath = `/_serverFn/${serverFns.liveFn}?payload=${encodeURIComponent(JSON.stringify(toJSON({ data: { siteId: fixture.id, days: 7, country: "JP" } })))}`;
  assert.match(await (await request(fnPath)).text(), /login/);
  assert.match(
    await (await request(fnPath, { cookie: ownerCookie })).text(),
    /visitors/,
  );
});

test("ordered funnels handle retries, sessions, windows, filters and protected edits", async () => {
  const fixture = await request("/api/sites", {
    method: "POST",
    cookie: ownerCookie,
    body: { name: "Funnel fixture", origin: "https://funnels.example.com" },
  }).then((r) => r.json());
  const base = `/api/sites/${fixture.id}/funnels`;
  const now = Date.now() - 3 * 3600000,
    H = 3600000;
  const rows = [];
  const add = (visitor, events, country = "JP") =>
    events.forEach(([name, path, offset = 0, session = "one"], index) =>
      rows.push([
        `${visitor}-${index}`,
        visitor,
        session,
        now + offset,
        name,
        path,
        country,
      ]),
    );
  add("a", [
    ["pageview", "/"],
    ["pageview", "/pricing"],
    ["signup", "/done"],
  ]);
  add(
    "b",
    [
      ["pageview", "/"],
      ["pageview", "/pricing", 1],
    ],
    "US",
  );
  add("c", [
    ["pageview", "/"],
    ["signup", "/done", 1],
    ["pageview", "/pricing", 2],
  ]);
  add("d", [
    ["pageview", "/"],
    ["pageview", "/pricing", 1],
    ["signup", "/done", H + 1],
    ["pageview", "/", H + 2],
    ["pageview", "/pricing", H + 3],
    ["signup", "/done", H + 4],
  ]);
  add("e", [
    ["pageview", "/", 0, "first"],
    ["pageview", "/pricing", 1, "second"],
    ["signup", "/done", 2, "second"],
  ]);
  add("f", [
    ["pageview", "/"],
    ["signup", "/done", 1],
  ]);
  add("g", [
    ["pageview", "/"],
    ["pageview", "/", 1],
    ["signup", "/done", 2],
  ]);
  add("h", [
    ["pageview", "/"],
    ["pageview", "/pricing", 1],
    ["signup", "/done", H + 1],
  ]);
  await db.batch(
    rows.map(([id, visitor, session, at, name, path, country]) =>
      db
        .prepare(
          "INSERT INTO events(id,site_id,visitor_id,session_id,received_at,name,path,country,tracking_version) VALUES (?,?,?,?,?,?,?,?,2)",
        )
        .bind(id, fixture.id, visitor, session, at, name, path, country),
    ),
  );
  // Later-step dimensions must not restrict a cohort selected at the first step.
  await db
    .prepare("UPDATE events SET country='US' WHERE site_id=? AND id='a-1'")
    .bind(fixture.id)
    .run();
  await db
    .prepare(
      "INSERT INTO events(id,site_id,visitor_id,session_id,received_at,name,path) VALUES ('funnel-cross-site',?,'c','one',?,'signup','/done')",
    )
    .bind(site.id, now + 10)
    .run();
  const input = {
    name: "Signup funnel",
    icon: "route",
    scope: "visitor",
    windowHours: 1,
    steps: [
      { kind: "page", value: "/" },
      { kind: "page", value: "/pricing" },
      { kind: "event", value: "signup" },
    ],
  };
  const create = (body, options = {}) =>
    request(base, { method: "POST", cookie: ownerCookie, body, ...options });
  assert.equal((await create(input, { cookie: undefined })).status, 401);
  assert.equal(
    (await create(input, { requestOrigin: "https://evil.example" })).status,
    403,
  );
  for (const invalid of [
    { ...input, steps: [] },
    { ...input, steps: Array(9).fill(input.steps[0]) },
    { ...input, windowHours: 2 },
    { ...input, scope: "user" },
    { ...input, icon: "invalid" },
    {
      ...input,
      steps: [{ kind: "page", value: "/path?secret=x" }, input.steps[2]],
    },
    { ...input, steps: [input.steps[0], { kind: "event", value: "pageview" }] },
  ])
    assert.equal((await create(invalid)).status, 400);
  const created = await create(input);
  assert.equal(created.status, 201);
  const funnel = await created.json();
  assert.equal(funnel.icon, "route");
  const get = async (query = "") => {
    const r = await request(base + `?funnelId=${funnel.id}` + query, {
      cookie: ownerCookie,
    });
    assert.equal(r.status, 200, await r.clone().text());
    return r.json();
  };
  const report = await get("&compare=true");
  assert.deepEqual(
    report.results.steps.map((s) => s.reached),
    [8, 6, 3],
  );
  assert.equal(report.results.conversionRate, 3 / 8);
  assert.equal(report.results.steps[2].dropOff, 3);
  assert.equal(report.results.steps[2].dropOffRate, 0.5);
  assert.equal(report.comparison.entrants, 0);
  assert.deepEqual(
    (await get("&country=JP")).results.steps.map((s) => s.reached),
    [7, 5, 3],
  );
  assert.equal((await get("&country=FR")).results.conversionRate, null);
  const patch = (body) =>
    request(base + `/${funnel.id}`, {
      method: "PATCH",
      cookie: ownerCookie,
      body,
    });
  assert.equal((await patch({ ...input, scope: "session" })).status, 200);
  assert.deepEqual(
    (await get()).results.steps.map((s) => s.reached),
    [8, 5, 2],
  );
  await patch({ ...input, windowHours: 24 });
  assert.equal((await get()).results.completed, 4);
  await patch({
    ...input,
    steps: [input.steps[0], input.steps[0], input.steps[2]],
  });
  assert.equal((await get()).results.completed, 1);
  await patch({ ...input, steps: Array(8).fill(input.steps[0]) });
  assert.equal((await get()).results.steps.length, 8);
  assert.equal((await get()).results.completed, 0);
  await patch(input);
  assert.equal((await patch({ archived: true })).status, 200);
  assert.equal((await get()).selected.archived, true);
  const noActive = await request(base, { cookie: ownerCookie }).then((r) =>
    r.json(),
  );
  assert.equal(noActive.selected, null);
  assert.equal(noActive.definitions.length, 1);
  assert.equal((await patch({ archived: false })).status, 200);
  assert.equal(
    (
      await request(`/api/sites/${site.id}/funnels/${funnel.id}`, {
        method: "PATCH",
        cookie: ownerCookie,
        body: input,
      })
    ).status,
    404,
  );
  assert.equal(
    (
      await request(`/api/sites/${site.id}/funnels?funnelId=${funnel.id}`, {
        cookie: ownerCookie,
      })
    ).status,
    404,
  );
  assert.equal((await request(base)).status, 401);
  for (const [name, data, method] of [
    ["funnelsFn", { siteId: fixture.id, days: 7 }, "GET"],
    ["saveFunnelFn", { siteId: fixture.id, funnel: input }, "POST"],
    [
      "archiveFunnelFn",
      { siteId: fixture.id, id: funnel.id, archived: true },
      "POST",
    ],
  ]) {
    assert.ok(serverFns[name]);
    const fnPath =
      `/_serverFn/${serverFns[name]}` +
      (method === "GET"
        ? `?payload=${encodeURIComponent(JSON.stringify(toJSON({ data })))}`
        : "");
    assert.match(
      await (
        await request(fnPath, {
          method,
          ...(method === "POST" ? { body: toJSON({ data }) } : {}),
        })
      ).text(),
      /login/,
    );
  }
  const page = await request(`/app/${fixture.id}/funnels?days=7`, {
    cookie: ownerCookie,
  });
  assert.equal(page.status, 200);
  assert.match(await page.text(), /Signup funnel/);
});

test("payment keys, Stripe signatures, refunds and attribution are isolated and idempotent", async () => {
  const fixture = await request("/api/sites", {
    method: "POST",
    cookie: ownerCookie,
    body: { name: "Payments fixture", origin: "https://payments.example.com" },
  }).then((r) => r.json());
  const settingsPath = `/api/sites/${fixture.id}/payment-settings`,
    paymentPath = `/payments/${fixture.id}`,
    revenuePath = `/api/sites/${fixture.id}/revenue`;
  const change = (body) =>
    request(settingsPath, { method: "POST", cookie: ownerCookie, body });
  assert.equal((await request(settingsPath)).status, 401);
  assert.equal(
    (
      await request(settingsPath, {
        method: "POST",
        cookie: ownerCookie,
        requestOrigin: "https://other.example",
        body: { action: "rotateKey" },
      })
    ).status,
    403,
  );
  const keyResponse = await change({ action: "rotateKey" });
  assert.equal(keyResponse.status, 200, await keyResponse.clone().text());
  const { key } = await keyResponse.json();
  assert.match(key, /^osa_[a-zA-Z0-9_-]{43}$/);
  const settings = await request(settingsPath, { cookie: ownerCookie }).then(
    (r) => r.json(),
  );
  assert.equal(settings.apiKeyHint, key.slice(-8));
  assert.equal(JSON.stringify(settings).includes(key), false);
  const now = Date.now() - 10000,
    visitorId = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
  const visitorHash = createHmac("sha256", "test-auth-" + "a".repeat(40))
    .update(`${fixture.id}\0visitor\0${visitorId}`)
    .digest("hex");
  const payment = {
    id: "order-a",
    amount: 1000,
    currency: "usd",
    paidAt: now,
    mode: "live",
    visitorId,
    consent: true,
  };
  const send = (body, token = key, path = paymentPath) =>
    request(path, {
      method: "POST",
      headers: { authorization: `Bearer ${token}` },
      body,
    });
  assert.equal(
    (await request(paymentPath, { method: "POST", body: payment })).status,
    401,
  );
  assert.equal((await send(payment, "osa_" + "x".repeat(43))).status, 401);
  assert.equal((await send(payment, key, `/payments/${site.id}`)).status, 401);
  assert.equal(
    (
      await request("/api/sites", {
        headers: { authorization: `Bearer ${key}` },
      })
    ).status,
    401,
  );
  assert.equal((await send({ ...payment, consent: false })).status, 400);
  assert.equal(
    (await send({ ...payment, identityEnabled: false })).status,
    400,
  );
  for (const bad of [
    { amount: 1.5 },
    { amount: -1 },
    { refundedAmount: 1001 },
    { paidAt: Date.now() + 600000 },
    { mode: "sandbox" },
    { currency: "US" },
    { visitorId: "not-an-id" },
  ])
    assert.equal((await send({ ...payment, ...bad })).status, 400);
  const delivered = await Promise.all(
    Array.from({ length: 4 }, (_, index) =>
      send(
        index === 0
          ? { ...payment, consent: undefined, identityEnabled: true }
          : payment,
      ),
    ),
  );
  assert.ok(delivered.every((r) => r.status === 202));
  assert.equal((await send({ ...payment, refundedAmount: 300 })).status, 202);
  assert.equal((await send(payment)).status, 202);
  assert.equal((await send({ ...payment, amount: 2000 })).status, 409);
  assert.equal((await send({ ...payment, currency: "eur" })).status, 409);
  const read = async (query = "") => {
    const r = await request(revenuePath + query, { cookie: ownerCookie });
    assert.equal(r.status, 200, await r.clone().text());
    return r.json();
  };
  let report = await read();
  assert.equal(report.total, 1);
  assert.equal(report.summary[0].net, 700);
  assert.equal(report.sources[0].label, null);
  // Late-arriving queued history acquires attribution without replaying a payment.
  await db.batch([
    db
      .prepare(
        "INSERT INTO events(id,site_id,name,path,received_at,visitor_id,session_id,tracking_version,utm_source,utm_campaign,country,browser) VALUES ('payment-landing',?,'pageview','/welcome',?,?,'p-session',2,'newsletter','launch','JP','Safari')",
      )
      .bind(fixture.id, now - 1000, visitorHash),
    db
      .prepare(
        "INSERT INTO events(id,site_id,name,path,received_at,visitor_id,session_id,tracking_version,utm_source) VALUES ('payment-later',?,'pageview','/pricing',?,?,'p-session',2,'later')",
      )
      .bind(fixture.id, now - 500, visitorHash),
    db
      .prepare(
        "INSERT INTO events(id,site_id,name,path,received_at,visitor_id,tracking_version,utm_source) VALUES ('payment-other-site',?,'pageview','/wrong',?,?,2,'wrong')",
      )
      .bind(site.id, now - 2000, visitorHash),
  ]);
  report = await read("?compare=true");
  assert.equal(report.sources[0].label, "Campaign · newsletter");
  assert.equal(report.campaigns[0].label, "launch");
  assert.equal(report.landingPages[0].label, "/welcome");
  assert.equal(report.comparison.length, 0);
  assert.equal(
    (await read("?country=JP&path=%2Fwelcome&browser=Safari")).total,
    1,
  );
  assert.equal((await read("?path=%2Fpricing")).total, 0);
  assert.equal(
    (
      await send({
        ...payment,
        id: "jpy-a",
        currency: "jpy",
        amount: 100,
        visitorId: null,
        consent: false,
      })
    ).status,
    202,
  );
  report = await read();
  assert.equal(report.summary.length, 2);
  assert.equal(report.summary.find((x) => x.currency === "JPY").net, 100);
  assert.equal((await read("?source=__unknown__")).total, 1);
  assert.equal((await read(`?visitorId=${visitorHash}`)).total, 1);
  assert.equal(
    (await request(revenuePath + "?visitorId=bad", { cookie: ownerCookie }))
      .status,
    400,
  );
  const webhookSecret = "whsec_" + "s".repeat(32),
    liveSecret = "whsec_" + "l".repeat(32);
  assert.equal(
    (await change({ action: "stripe", mode: "test", secret: webhookSecret }))
      .status,
    200,
  );
  assert.equal(
    (await change({ action: "stripe", mode: "live", secret: liveSecret }))
      .status,
    200,
  );
  const stored = await db
    .prepare("SELECT * FROM payment_integrations WHERE site_id=?")
    .bind(fixture.id)
    .first();
  assert.ok(stored.api_key_hash);
  assert.equal(JSON.stringify(stored).includes(key), false);
  assert.equal(JSON.stringify(stored).includes(webhookSecret), false);
  const stripePath = `/payments/stripe/${fixture.id}/test`;
  const charge = {
    id: "ch_one",
    object: "charge",
    paid: true,
    captured: true,
    status: "succeeded",
    amount_captured: 2000,
    amount_refunded: 0,
    currency: "usd",
    created: Math.floor(now / 1000),
    livemode: false,
    metadata: {
      os_analytics_visitor_id: visitorId,
      os_analytics_consent: "true",
    },
  };
  const event = (object = charge, type = "charge.succeeded") => ({
    id: "evt_one",
    object: "event",
    type,
    livemode: object.livemode,
    data: { object },
  });
  const webhook = (
    data,
    {
      secret = webhookSecret,
      timestamp = Math.floor(Date.now() / 1000),
      path = stripePath,
      signature,
      raw,
    } = {},
  ) => {
    const body = raw ?? JSON.stringify(data);
    const signed =
      signature ??
      `t=${timestamp},v1=${createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex")}`;
    return mf.dispatchFetch(origin + path, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "stripe-signature": signed,
      },
      body,
    });
  };
  assert.equal((await webhook(event(), { signature: "bad" })).status, 400);
  assert.equal(
    (await webhook(event(), { timestamp: Math.floor(Date.now() / 1000) - 600 }))
      .status,
    400,
  );
  assert.equal(
    (await webhook(event(), { path: `/payments/stripe/${fixture.id}/live` }))
      .status,
    400,
  );
  assert.equal(
    (await webhook(event({ ...charge, livemode: true }))).status,
    400,
  );
  assert.equal(
    (await webhook(event({ ...charge, captured: false }))).status,
    200,
  );
  assert.equal((await read("?mode=test")).total, 0);
  assert.equal(
    (await webhook(event(charge, "payment_intent.succeeded"))).status,
    200,
  );
  assert.equal((await read("?mode=test")).total, 0);
  assert.equal(
    (
      await webhook(
        event({ ...charge, amount_refunded: 500 }, "charge.refunded"),
      )
    ).status,
    200,
  );
  const duplicates = await Promise.all(
    Array.from({ length: 3 }, (_, index) =>
      webhook(
        event(
          index === 0
            ? {
                ...charge,
                metadata: {
                  os_analytics_visitor_id: visitorId,
                  os_analytics_identity_enabled: "true",
                },
              }
            : charge,
        ),
      ),
    ),
  );
  assert.ok(duplicates.every((r) => r.status === 200));
  report = await read("?mode=test");
  assert.equal(report.total, 1);
  assert.equal(report.summary[0].amount, 2000);
  assert.equal(report.summary[0].refunds, 500);
  assert.equal(report.summary[0].net, 1500);
  assert.equal(report.payments[0].visitorId, visitorHash);
  assert.equal(report.sources[0].label, "Campaign · newsletter");
  assert.equal(
    (
      await webhook(
        event({ ...charge, amount_refunded: 2001 }, "charge.refunded"),
      )
    ).status,
    400,
  );
  assert.equal(
    (await webhook(event({ ...charge, currency: "eur" }))).status,
    409,
  );
  assert.equal(
    (
      await webhook(
        event({
          ...charge,
          id: "ch_no_consent",
          metadata: { os_analytics_visitor_id: visitorId },
        }),
      )
    ).status,
    200,
  );
  report = await read("?mode=test&source=__unknown__");
  assert.equal(report.total, 1);
  assert.equal(report.payments[0].visitorId, null);
  assert.equal(
    (await webhook(event(), { raw: "x".repeat(65537) })).status,
    413,
  );
  assert.equal((await send({ ...payment, mode: "test" })).status, 202);
  assert.equal((await read("?mode=test")).total, 3);
  const journey = await request(
    `/api/sites/${fixture.id}/visitors/${visitorHash}`,
    { cookie: ownerCookie },
  ).then((r) => r.json());
  assert.equal(journey.payments.length, 3);
  assert.ok(journey.payments.some((p) => p.refundedAmount === 500));
  assert.equal(
    (
      await webhook(event({ ...charge, id: "ch_live", livemode: true }), {
        secret: liveSecret,
        path: `/payments/stripe/${fixture.id}/live`,
      })
    ).status,
    200,
  );
  assert.equal(
    (await read()).summary.find((x) => x.currency === "USD").net,
    2700,
  );
  assert.equal(
    (
      await send({
        ...payment,
        id: "previous-period",
        amount: 400,
        paidAt: now - 8 * 86400000,
        visitorId: null,
      })
    ).status,
    202,
  );
  assert.equal(
    (await read("?compare=true")).comparison.find((x) => x.currency === "USD")
      .net,
    400,
  );
  const bulk = await request("/api/sites", {
    method: "POST",
    cookie: ownerCookie,
    body: { name: "Payment pagination", origin: "https://bulk.example.com" },
  }).then((r) => r.json());
  await db.batch(
    Array.from({ length: 53 }, (_, i) =>
      db
        .prepare(
          "INSERT INTO payments(site_id,provider,mode,external_id,amount,refunded_amount,currency,paid_at,created_at,updated_at) VALUES (?,'api','live',?,100,0,'USD',?,?,?)",
        )
        .bind(bulk.id, `bulk-${String(i).padStart(3, "0")}`, now, now, now),
    ),
  );
  const bulkRead = (page) =>
    request(`/api/sites/${bulk.id}/revenue?page=${page}`, {
      cookie: ownerCookie,
    }).then((r) => r.json());
  const first = await bulkRead(0),
    second = await bulkRead(1);
  assert.equal(first.total, 53);
  assert.equal(first.payments.length, 50);
  assert.equal(second.payments.length, 3);
  assert.equal(
    new Set([...first.payments, ...second.payments].map((p) => p.externalId))
      .size,
    53,
  );
  const rotated = await change({ action: "rotateKey" }).then((r) => r.json());
  assert.notEqual(rotated.key, key);
  assert.equal((await send(payment)).status, 401);
  assert.equal((await send(payment, rotated.key)).status, 202);
  assert.equal((await change({ action: "revokeKey" })).status, 200);
  assert.equal((await send(payment, rotated.key)).status, 401);
  assert.equal(
    (await change({ action: "stripe", mode: "test", secret: null })).status,
    200,
  );
  assert.equal((await webhook(event())).status, 404);
  for (const [name, data, method] of [
    [
      "revenueFn",
      { siteId: fixture.id, days: 7, mode: "live", page: 0 },
      "GET",
    ],
    ["paymentSettingsFn", { siteId: fixture.id }, "GET"],
    [
      "changePaymentSettingsFn",
      { siteId: fixture.id, change: { action: "rotateKey" } },
      "POST",
    ],
  ]) {
    assert.ok(serverFns[name]);
    const fnPath =
      `/_serverFn/${serverFns[name]}` +
      (method === "GET"
        ? `?payload=${encodeURIComponent(JSON.stringify(toJSON({ data })))}`
        : "");
    assert.match(
      await (
        await request(fnPath, {
          method,
          ...(method === "POST" ? { body: toJSON({ data }) } : {}),
        })
      ).text(),
      /login/,
    );
  }
  const page = await request(
    `/app/${fixture.id}/revenue?days=7&mode=live&page=0`,
    { cookie: ownerCookie },
  );
  assert.equal(page.status, 200);
  assert.match(await page.text(), /Net revenue/);
});

test("durable payment attribution freezes models, reconciles late history and survives retention", async () => {
  const fixture = await request("/api/sites", {
    method: "POST",
    cookie: ownerCookie,
    body: { name: "Durable attribution", origin: "https://durable.example" },
  }).then((r) => r.json());
  const settings = `/api/sites/${fixture.id}/payment-settings`;
  const change = (body) =>
    request(settings, { method: "POST", cookie: ownerCookie, body });
  const { key } = await change({ action: "rotateKey" }).then((r) => r.json());
  const read = async (filter = "") => {
    const r = await request(
      `/api/sites/${fixture.id}/revenue?days=7${filter}`,
      { cookie: ownerCookie },
    );
    assert.equal(r.status, 200, await r.clone().text());
    return r.json();
  };
  const now = Date.now() - 10000,
    DAY = 86400000;
  const visitorId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
  const hash = createHmac("sha256", "test-auth-" + "a".repeat(40))
    .update(`${fixture.id}\0visitor\0${visitorId}`)
    .digest("hex");
  const event = (id, time, source = null, visitor = hash, path = `/${id}`) =>
    db
      .prepare(
        "INSERT INTO events(site_id,id,name,path,received_at,tracking_version,visitor_id,session_id,utm_source,country,region,city,browser,os,device,utm_campaign) VALUES (?,?,'pageview',?,?,2,?,'session',?,'JP','Tokyo','Tokyo','Chrome','macOS','desktop','launch')",
      )
      .bind(fixture.id, id, path, time, visitor, source)
      .run();
  const send = async (id, extra = {}) => {
    const r = await request(`/payments/${fixture.id}`, {
      method: "POST",
      headers: { authorization: `Bearer ${key}` },
      body: {
        id,
        amount: 1000,
        currency: "USD",
        mode: "live",
        paidAt: now,
        visitorId,
        identityEnabled: true,
        ...extra,
      },
    });
    assert.equal(r.status, 202, await r.clone().text());
    return r.json();
  };
  const row = async (id) =>
    (await read()).payments.find((p) => p.externalId === id);
  const reconcile = async () => {
    const r = await change({ action: "reconcileAttribution" });
    assert.equal(r.status, 200, await r.clone().text());
  };
  for (const bad of [
    { model: "other", lookbackDays: 30 },
    { model: "first_touch", lookbackDays: 0 },
    { model: "first_touch", lookbackDays: 366 },
    { model: "first_touch", lookbackDays: 1.5 },
    { model: "first_touch", lookbackDays: "30" },
  ])
    assert.equal((await change({ action: "attribution", ...bad })).status, 400);
  assert.equal(
    (
      await request(settings, {
        method: "POST",
        body: { action: "reconcileAttribution" },
      })
    ).status,
    401,
  );
  assert.equal(
    (
      await request(`/api/sites/missing/payment-settings`, {
        method: "POST",
        cookie: ownerCookie,
        body: { action: "attribution", model: "first_touch", lookbackDays: 30 },
      })
    ).status,
    404,
  );
  await event("outside", now - 30 * DAY - 1, "outside");
  await event("first-z", now - 10 * DAY, "original");
  await event("latest-campaign", now - 2 * DAY, "recent");
  await event("direct", now - 1000);
  await event("future", now + 1, "future");
  await event("anonymous", now - 20 * DAY, "anonymous", null);
  await send("first");
  assert.equal((await row("first")).source, "Campaign · original");
  assert.equal((await row("first")).attributionStatus, "pending");
  assert.equal((await row("first")).attributionLookbackDays, 30);
  // A delayed earlier event replaces the pending first touch; tied IDs break consistently.
  await event("first-a", now - 10 * DAY, "tie-winner");
  await reconcile();
  assert.equal((await row("first")).source, "Campaign · tie-winner");
  // Preserve a saved candidate even after an operator deletes raw history.
  await db
    .prepare("DELETE FROM events WHERE site_id=? AND id='first-a'")
    .bind(fixture.id)
    .run();
  assert.equal((await row("first")).source, "Campaign · tie-winner");
  assert.equal(
    (
      await change({
        action: "attribution",
        model: "last_non_direct",
        lookbackDays: 5,
      })
    ).status,
    200,
  );
  await send("last");
  assert.equal((await row("last")).source, "Campaign · recent");
  assert.equal((await row("first")).attributionModel, "first_touch");
  await event("late-nondirect", now - DAY, "late");
  await Promise.all([
    reconcile(),
    reconcile(),
    send("last", { refundedAmount: 300 }),
  ]);
  assert.equal((await row("last")).source, "Campaign · late");
  assert.equal((await row("last")).refundedAmount, 300);
  await send("missing", { visitorId: null });
  assert.equal((await row("missing")).attributionReason, "missing_identity");
  await send("missing");
  assert.equal((await row("missing")).source, "Campaign · late");
  await send("frozen-missing", { visitorId: null });
  await send("eur", { currency: "EUR" });
  // Move only the synthetic attribution deadline; production has no early-finalization control.
  await db
    .prepare("UPDATE payment_attributions SET finalize_after=0 WHERE site_id=?")
    .bind(fixture.id)
    .run();
  await reconcile();
  const frozen = await row("first");
  assert.equal(frozen.attributionStatus, "finalized");
  assert.ok(frozen.attributionFinalizedAt > now);
  await event("even-earlier", now - 20 * DAY, "too-late");
  await event("even-later", now - 500, "too-late");
  await send("frozen-missing");
  await send("last", { refundedAmount: 700 });
  assert.equal((await row("first")).source, "Campaign · tie-winner");
  assert.equal((await row("last")).source, "Campaign · late");
  assert.equal(
    (await row("frozen-missing")).attributionReason,
    "missing_identity",
  );
  assert.equal(
    (await read()).summary.find((r) => r.currency === "USD").refunds,
    700,
  );
  assert.equal(
    (await read()).summary.find((r) => r.currency === "EUR").net,
    1000,
  );
  assert.equal(
    (
      await read(
        "&source=Campaign%20%C2%B7%20tie-winner&country=JP&region=Tokyo&city=Tokyo&path=%2Ffirst-a",
      )
    ).total,
    1,
  );
  // Raw retention removes old events without changing frozen dimensions. Payment retention cascades snapshots.
  await db
    .prepare("UPDATE events SET received_at=? WHERE site_id=? AND id='first-z'")
    .bind(now - 40 * DAY, fixture.id)
    .run();
  assert.equal(
    (
      await request(`/api/sites/${fixture.id}/operations`, {
        method: "PATCH",
        cookie: ownerCookie,
        body: {
          eventRetentionDays: 30,
          paymentRetentionDays: 0,
          excludeBots: true,
        },
      })
    ).status,
    200,
  );
  await (await mf.getWorker()).scheduled({ cron: "17 * * * *" });
  assert.equal(
    await db
      .prepare("SELECT id FROM events WHERE site_id=? AND id='first-z'")
      .bind(fixture.id)
      .first(),
    null,
  );
  assert.equal((await row("first")).landingPage, "/first-a");
  assert.equal((await read("&source=Campaign%20%C2%B7%20tie-winner")).total, 1);
  await db
    .prepare("DELETE FROM payments WHERE site_id=? AND external_id='eur'")
    .bind(fixture.id)
    .run();
  assert.equal(
    await db
      .prepare(
        "SELECT external_id FROM payment_attributions WHERE site_id=? AND external_id='eur'",
      )
      .bind(fixture.id)
      .first(),
    null,
  );
  // Changing policy never backfills deleted history; a short window falls back to direct.
  assert.equal(
    (
      await change({
        action: "attribution",
        model: "last_non_direct",
        lookbackDays: 1,
      })
    ).status,
    200,
  );
  await db
    .prepare("DELETE FROM events WHERE site_id=? AND utm_source IS NOT NULL")
    .bind(fixture.id)
    .run();
  await send("fallback");
  assert.equal((await row("fallback")).source, "Direct / unknown");
  // Unknown identity and anonymous traffic cannot supply a touch.
  await send("no-history", {
    visitorId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  });
  assert.equal(
    (await row("no-history")).attributionReason,
    "no_matching_pageview",
  );
  // Pending attribution delays deletion of eligible old pageviews until finalization.
  await change({
    action: "attribution",
    model: "first_touch",
    lookbackDays: 90,
  });
  await event("protected", now - 40 * DAY, "protected");
  await send("pending-retention");
  await (await mf.getWorker()).scheduled({ cron: "17 * * * *" });
  assert.ok(
    await db
      .prepare("SELECT id FROM events WHERE site_id=? AND id='protected'")
      .bind(fixture.id)
      .first(),
  );
  await db
    .prepare("UPDATE payment_attributions SET finalize_after=0 WHERE site_id=?")
    .bind(fixture.id)
    .run();
  await reconcile();
  await (await mf.getWorker()).scheduled({ cron: "17 * * * *" });
  assert.equal(
    await db
      .prepare("SELECT id FROM events WHERE site_id=? AND id='protected'")
      .bind(fixture.id)
      .first(),
    null,
  );
  assert.equal((await row("pending-retention")).source, "Campaign · protected");
  const html = await request(
    `/app/${fixture.id}/revenue?days=7&mode=live&page=0`,
    { cookie: ownerCookie },
  ).then((r) => r.text());
  assert.match(html, /Attribution status/);
  assert.match(html, /Finalized/);
});

test("attribution backfills are bounded, resumable and use each record's captured policy", async () => {
  const fixture = await request("/api/sites", {
    method: "POST",
    cookie: ownerCookie,
    body: { name: "Attribution backfill", origin: "https://backfill.example" },
  }).then((r) => r.json());
  const now = Date.now();
  for (let start = 0; start < 205; start += 25)
    await db.batch(
      Array.from({ length: Math.min(25, 205 - start) }, (_, j) =>
        db
          .prepare(
            "INSERT INTO payments(site_id,provider,mode,external_id,amount,currency,paid_at,created_at,updated_at) VALUES (?,'api','live',?,100,'JPY',?,?,?)",
          )
          .bind(
            fixture.id,
            `backfill-${String(start + j).padStart(3, "0")}`,
            now,
            now,
            now,
          ),
      ),
    );
  const read = () =>
    request(`/api/sites/${fixture.id}/revenue?days=7`, {
      cookie: ownerCookie,
    }).then((r) => r.json());
  const first = await read();
  assert.equal(first.total, 205);
  assert.equal(
    first.attribution.find((r) => r.status === "backfill_required").payments,
    5,
  );
  assert.equal(
    (
      await db
        .prepare(
          "SELECT count(*) AS n FROM payment_attributions WHERE site_id=?",
        )
        .bind(fixture.id)
        .first()
    ).n,
    200,
  );
  await request(`/api/sites/${fixture.id}/payment-settings`, {
    method: "POST",
    cookie: ownerCookie,
    body: { action: "attribution", model: "last_non_direct", lookbackDays: 7 },
  });
  const second = await read();
  assert.equal(
    second.attribution.some((r) => r.status === "backfill_required"),
    false,
  );
  assert.equal(
    second.attribution.find((r) => r.model === "first_touch").payments,
    200,
  );
  assert.equal(
    second.attribution.find((r) => r.model === "last_non_direct").payments,
    5,
  );
  const snapshot = await db
    .prepare(
      "SELECT created_at,finalize_after FROM payment_attributions WHERE site_id=? LIMIT 1",
    )
    .bind(fixture.id)
    .first();
  assert.equal(snapshot.finalize_after - snapshot.created_at, 72 * 3600000);
});

test("operations settings enforce ownership and bot filtering; queue counters distinguish replay and failures", async () => {
  const created = await request("/api/sites", {
    method: "POST",
    cookie: ownerCookie,
    body: { name: "Operations", origin: "https://operations.example" },
  });
  const operational = await created.json();
  const url = `/api/sites/${operational.id}/operations`;
  assert.equal((await request(url)).status, 401);
  assert.equal(
    (await request("/api/sites/missing/operations", { cookie: ownerCookie }))
      .status,
    404,
  );
  const read = async () => (await request(url, { cookie: ownerCookie })).json();
  assert.equal((await read()).site.eventRetentionDays, 0);
  assert.equal((await read()).site.excludeBots, true);
  const settings = {
    eventRetentionDays: 0,
    paymentRetentionDays: 0,
    excludeBots: false,
  };
  assert.equal(
    (
      await request(url, {
        method: "PATCH",
        cookie: ownerCookie,
        requestOrigin: "https://evil.example",
        body: settings,
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await request(url, {
        method: "PATCH",
        cookie: ownerCookie,
        body: { ...settings, eventRetentionDays: 1 },
      })
    ).status,
    400,
  );
  const body = {
    version: 1,
    id: "ops-event",
    siteId: operational.id,
    name: "pageview",
    path: "/",
  };
  const send = () =>
    request("/ingest", {
      method: "POST",
      body,
      requestOrigin: operational.origin,
      headers: { "user-agent": "Googlebot/2.1" },
    });
  assert.deepEqual(await (await send()).json(), { ignored: "bot" });
  assert.equal((await read()).counters.bots, 1);
  assert.equal((await read()).counters.queued, 0);
  assert.equal(
    (
      await request(url, {
        method: "PATCH",
        cookie: ownerCookie,
        body: settings,
      })
    ).status,
    200,
  );
  assert.equal((await send()).status, 202);
  await eventually(async () => (await read()).counters.stored === 1);
  const worker = await mf.getWorker();
  const replay = async (event) =>
    worker.queue("events", [
      { id: "ops-replay", timestamp: new Date(), attempts: 1, body: event },
    ]);
  await replay({ ...body, receivedAt: Date.now() });
  assert.equal((await read()).counters.duplicates, 1);
  await replay({
    ...body,
    id: "bad-version",
    version: 99,
    receivedAt: Date.now(),
  });
  assert.equal((await read()).counters.writeFailures, 1);
  await db
    .prepare(
      usePostgres
        ? "CREATE FUNCTION fail_ops_insert_fn() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic write failure'; END; $$; CREATE TRIGGER fail_ops_insert BEFORE INSERT ON events FOR EACH ROW WHEN (NEW.id='ops-write-failure') EXECUTE FUNCTION fail_ops_insert_fn()"
        : "CREATE TRIGGER fail_ops_insert BEFORE INSERT ON events WHEN NEW.id='ops-write-failure' BEGIN SELECT RAISE(FAIL,'synthetic write failure'); END",
    )
    .run();
  await replay({ ...body, id: "ops-write-failure", receivedAt: Date.now() });
  assert.equal((await read()).counters.writeFailures, 2);
  await db
    .prepare(
      usePostgres
        ? "DROP TRIGGER fail_ops_insert ON events"
        : "DROP TRIGGER fail_ops_insert",
    )
    .run();
  await replay({ ...body, id: "ops-write-failure", receivedAt: Date.now() });
  assert.equal((await read()).counters.stored, 2);
  await replay(null); // A malformed DLQ message must retry without breaking the batch handler.
  const fn = `/_serverFn/${serverFns.saveOperationsFn}`;
  assert.ok(serverFns.saveOperationsFn);
  const mutation = {
    method: "POST",
    body: toJSON({ data: { siteId: operational.id, settings } }),
  };
  assert.match(await (await request(fn, mutation)).text(), /login/);
  assert.equal(
    (
      await request(fn, {
        ...mutation,
        cookie: ownerCookie,
        requestOrigin: "https://evil.example",
      })
    ).status,
    403,
  );
  assert.equal((await read()).hours.length, 24);
  assert.ok((await read()).lastStoredAt);
});

test("hourly retention is opt-in, site-scoped and independent for events and payments; expired replay stays deleted", async () => {
  const made = await request("/api/sites", {
    method: "POST",
    cookie: ownerCookie,
    body: { name: "Retention", origin: "https://retention.example" },
  });
  const target = await made.json();
  const now = Date.now(),
    old = now - 100 * 86400000,
    recent = now - 86400000;
  for (const [id, time] of [
    ["old", old],
    ["recent", recent],
  ]) {
    await db
      .prepare(
        "INSERT INTO events(id,site_id,name,path,received_at) VALUES (?,?,'pageview','/',?)",
      )
      .bind(id, target.id, time)
      .run();
    await db
      .prepare(
        "INSERT INTO payments(site_id,provider,mode,external_id,amount,refunded_amount,currency,paid_at,created_at,updated_at) VALUES (?,'api','test',?,100,0,'USD',?,?,?)",
      )
      .bind(target.id, id, time, now, now)
      .run();
  }
  const worker = await mf.getWorker();
  const count = async (table) =>
    (
      await db
        .prepare(`SELECT count(*) AS n FROM ${table} WHERE site_id=?`)
        .bind(target.id)
        .first()
    ).n;
  await worker.scheduled({ cron: "17 * * * *" });
  assert.equal(await count("events"), 2);
  assert.equal(await count("payments"), 2);
  const otherBefore = (
    await db
      .prepare("SELECT count(*) AS n FROM events WHERE site_id=?")
      .bind(site.id)
      .first()
  ).n;
  const save = async (eventRetentionDays, paymentRetentionDays) =>
    request(`/api/sites/${target.id}/operations`, {
      method: "PATCH",
      cookie: ownerCookie,
      body: { eventRetentionDays, paymentRetentionDays, excludeBots: true },
    });
  assert.equal((await save(30, 0)).status, 200);
  await worker.scheduled({ cron: "17 * * * *" });
  assert.equal(await count("events"), 1);
  assert.equal(await count("payments"), 2);
  assert.equal(
    (
      await db
        .prepare("SELECT count(*) AS n FROM events WHERE site_id=?")
        .bind(site.id)
        .first()
    ).n,
    otherBefore,
  );
  await worker.queue("events", [
    {
      id: "expired-replay",
      timestamp: new Date(),
      attempts: 1,
      body: {
        version: 1,
        id: "old",
        siteId: target.id,
        name: "pageview",
        path: "/",
        receivedAt: old,
      },
    },
  ]);
  assert.equal(await count("events"), 1);
  let report = await (
    await request(`/api/sites/${target.id}/operations`, { cookie: ownerCookie })
  ).json();
  assert.equal(report.counters.expired, 1);
  assert.ok(report.site.lastCleanupAt >= now);
  await save(0, 30);
  await worker.scheduled({ cron: "17 * * * *" });
  const { key } = await (
    await request(`/api/sites/${target.id}/payment-settings`, {
      method: "POST",
      cookie: ownerCookie,
      body: { action: "rotateKey" },
    })
  ).json();
  const expiredPayment = await request(`/payments/${target.id}`, {
    method: "POST",
    headers: { authorization: `Bearer ${key}` },
    body: {
      id: "old",
      amount: 100,
      currency: "USD",
      mode: "test",
      paidAt: old,
    },
  });
  assert.equal(expiredPayment.status, 410);
  await db
    .prepare(
      "WITH RECURSIVE n(x) AS (SELECT 1 UNION ALL SELECT x+1 FROM n WHERE x<5001) INSERT INTO events(id,site_id,name,path,received_at) SELECT 'batch-'||x,?,'pageview','/',? FROM n",
    )
    .bind(target.id, old)
    .run();
  await save(30, 30);
  await worker.scheduled({ cron: "17 * * * *" });
  assert.equal(await count("events"), 2); // One old row remains after the bounded 5,000-row batch.
  await worker.scheduled({ cron: "17 * * * *" });
  assert.equal(await count("payments"), 1);
  assert.equal(await count("events"), 1);
  assert.equal(
    (await request("/api/sites", { cookie: ownerCookie })).status,
    200,
  );
});

test("daily rollups match raw reports, keep uniques exact, and invalidate atomically on event changes", async () => {
  const target = await (
    await request("/api/sites", {
      method: "POST",
      cookie: ownerCookie,
      body: { name: "Rollups", origin: "https://rollups.example" },
    })
  ).json();
  const DAY = 86400000,
    today = Math.floor(Date.now() / DAY) * DAY;
  const older = today - 2 * DAY,
    yesterday = today - DAY;
  for (const [id, at, path, country, visitor, version] of [
    ["a", older + 1000, "/a", "JP", "repeat", 2],
    ["b", yesterday + 1000, "/b", null, "repeat", 2],
    ["c", yesterday + 2000, "/a", "US", null, 1],
    ["d", today + 1, "/today", "JP", null, 2],
  ])
    await db
      .prepare(
        "INSERT INTO events(id,site_id,name,path,received_at,country,visitor_id,session_id,tracking_version,browser,utm_source,utm_medium,utm_campaign) VALUES (?,?,'pageview',?,?,?,?,?,?,'Safari','newsletter','email','launch')",
      )
      .bind(
        id,
        target.id,
        path,
        at,
        country,
        visitor,
        visitor ? "session-" + id : null,
        version,
      )
      .run();
  // Same visitor repeats across days and changes dimensions within a day.
  for (const [id, at, country, browser] of [
    ["repeat-again", older + 4000, "JP", "Safari"],
    ["changed-device", older + 5000, "US", "Firefox"],
  ])
    await db
      .prepare(
        "INSERT INTO events(id,site_id,name,path,received_at,country,browser,visitor_id,session_id) VALUES (?,?,'pageview','/a',?,?,?,'repeat','session-a')",
      )
      .bind(id, target.id, at, country, browser)
      .run();
  const report = async (extra = "") => {
    const response = await request(
      `/api/sites/${target.id}/overview?days=7&compare=true${extra}`,
      { cookie: ownerCookie },
    );
    assert.equal(response.status, 200, await response.clone().text());
    const value = await response.json();
    delete value.asOf;
    delete value.end;
    delete value.live;
    delete value.visitorInsights.liveSince;
    // Cron updates another operational site field only when retention is enabled; this fixture keeps it off.
    return value;
  };
  const before = await report();
  const filteredBefore = await report("&country=JP&browser=Safari");
  assert.equal(before.identities.visitors, 1); // Returning on another day is not another visitor.
  const worker = await mf.getWorker();
  const coverage = async () =>
    (
      await db
        .prepare("SELECT count(*) AS n FROM rollup_days WHERE site_id=?")
        .bind(target.id)
        .first()
    ).n;
  for (let i = 0; i < 15 && (await coverage()) < 2; i++)
    await worker.scheduled({ cron: "17 * * * *" });
  assert.equal(await coverage(), 2);
  assert.equal(
    await db
      .prepare("SELECT day FROM rollup_days WHERE site_id=? AND day=?")
      .bind(target.id, today)
      .first(),
    null,
  );
  assert.deepEqual(await report(), before);
  assert.deepEqual(await report("&country=JP&browser=Safari"), filteredBefore);
  const facts = await db
    .prepare(
      "SELECT sum(pageviews) AS n FROM daily_traffic WHERE site_id=? AND dimension='page'",
    )
    .bind(target.id)
    .first();
  assert.equal(facts.n, 5);
  const memberships = await db
    .prepare(
      "SELECT count(*) AS n FROM daily_visitor_dimensions WHERE site_id=?",
    )
    .bind(target.id)
    .first();
  assert.equal(memberships.n, 3); // Repeated pageviews collapse; changed tuples survive.
  assert.equal(
    before.visitorInsights.visitorBrowsers.find(
      (row) => row.browser === "Safari",
    ).visitors,
    1,
  );
  for (const days of [30, 90]) {
    const response = await request(
      `/api/sites/${target.id}/overview?days=${days}&compare=true`,
      { cookie: ownerCookie },
    );
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.deepEqual(
      result.visitorInsights.visitorCountries,
      before.visitorInsights.visitorCountries,
    );
    assert.deepEqual(
      result.visitorInsights.visitorBrowsers,
      before.visitorInsights.visitorBrowsers,
    );
    assert.equal(result.pageviews, before.pageviews);
  }
  await worker.scheduled({ cron: "17 * * * *" });
  assert.deepEqual(await report(), before); // Repeated jobs cannot increment counts.
  await db
    .prepare(
      "INSERT INTO events(id,site_id,name,path,received_at,visitor_id,country,browser) VALUES ('late',?,'pageview','/late',?,'late-visitor','FR','Chrome')",
    )
    .bind(target.id, older + 3000)
    .run();
  assert.equal(await coverage(), 1);
  assert.equal((await report()).pageviews, before.pageviews + 1); // Dirty day uses raw events, never stale summaries.
  const late = await report();
  assert.equal(
    late.visitorInsights.visitorCountries.find((row) => row.country === "FR")
      .visitors,
    1,
  );
  await db
    .prepare(
      usePostgres
        ? "CREATE FUNCTION fail_rollup_fn() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic rollup failure'; END; $$; CREATE TRIGGER fail_rollup BEFORE INSERT ON daily_traffic FOR EACH ROW WHEN (NEW.dimension='country') EXECUTE FUNCTION fail_rollup_fn()"
        : "CREATE TRIGGER fail_rollup BEFORE INSERT ON daily_traffic WHEN NEW.dimension='country' BEGIN SELECT RAISE(FAIL,'synthetic rollup failure'); END",
    )
    .run();
  try {
    await worker.scheduled({ cron: "17 * * * *" });
  } catch {}
  assert.equal(await coverage(), 1);
  assert.deepEqual(await report(), late);
  await db
    .prepare(
      usePostgres
        ? "DROP TRIGGER fail_rollup ON daily_traffic"
        : "DROP TRIGGER fail_rollup",
    )
    .run();
  for (let i = 0; i < 15 && (await coverage()) < 2; i++)
    await worker.scheduled({ cron: "17 * * * *" });
  assert.equal(await coverage(), 2);
  assert.deepEqual(await report(), late);
  await db
    .prepare(
      "INSERT INTO events(id,site_id,name,path,received_at,visitor_id,country,browser) VALUES ('late',?,'pageview','/late',?,'late-visitor','FR','Chrome') ON CONFLICT DO NOTHING",
    )
    .bind(target.id, older + 3000)
    .run();
  assert.equal(await coverage(), 2); // Duplicate queue delivery does not dirty an unchanged day.
  await db
    .prepare(
      "UPDATE events SET path='/moved',received_at=? WHERE site_id=? AND id='late'",
    )
    .bind(yesterday + 5000, target.id)
    .run();
  assert.equal(await coverage(), 0);
  assert.equal((await report()).pageviews, late.pageviews);
  await db
    .prepare("DELETE FROM events WHERE site_id=? AND id='late'")
    .bind(target.id)
    .run();
  assert.deepEqual(await report(), before);
  assert.equal((await request(`/api/sites/${target.id}/overview`)).status, 401);
});

test("activity summaries preserve cross-day sessions, ties, custom goals, cohorts and historical cutoffs", async () => {
  const target = await (
    await request("/api/sites", {
      method: "POST",
      cookie: ownerCookie,
      body: { name: "Activity summaries", origin: "https://activity.example" },
    })
  ).json();
  const DAY = 86400000,
    today = Math.floor(Date.now() / DAY) * DAY;
  const rows = [
    ["prior", today - 10 * DAY, "same", "cross", "pageview", "/prior"],
    ["entry-b", today - 3 * DAY + 1000, "same", "cross", "pageview", "/b"],
    ["entry-a", today - 3 * DAY + 1000, "same", "cross", "pageview", "/a"],
    ["goal", today - 2 * DAY + 1000, "same", "cross", "signup", "/signup"],
    ["exit", today - DAY + 1000, "same", "cross", "pageview", "/exit"],
    [
      "custom-only",
      today - 2 * DAY + 2000,
      "custom",
      "only",
      "signup",
      "/signup",
    ],
    ["bounce", today - DAY + 2000, "bounce", "single", "pageview", "/bounce"],
    ["anonymous", today - DAY + 3000, null, null, "signup", "/signup"],
  ];
  for (const [id, at, visitor, session, name, path] of rows)
    await db
      .prepare(
        "INSERT INTO events(id,site_id,received_at,visitor_id,session_id,name,path,country) VALUES (?,?,?,?,?,?,?,'JP')",
      )
      .bind(id, target.id, at, visitor, session, name, path)
      .run();
  await request(`/api/sites/${target.id}/goals`, {
    method: "POST",
    cookie: ownerCookie,
    body: { name: "Sign up", eventName: "signup" },
  });
  const get = async (raw = false, range = "") => {
    const response = await request(
      `/api/sites/${target.id}/overview?days=7&compare=true${raw ? "&country=JP" : ""}${range}`,
      { cookie: ownerCookie },
    );
    assert.equal(response.status, 200, await response.clone().text());
    const r = await response.json();
    delete r.filters;
    delete r.asOf;
    delete r.end;
    delete r.live;
    delete r.visitorInsights.liveSince;
    return r;
  };
  const baseline = await get(true);
  assert.deepEqual(await get(), baseline);
  const worker = await mf.getWorker();
  const pending = async () =>
    (
      await db
        .prepare(
          "SELECT count(*) AS n FROM rollup_pending WHERE site_id=? AND day<?",
        )
        .bind(target.id, today)
        .first()
    ).n;
  for (let i = 0; i < 20 && (await pending()); i++)
    await worker.scheduled({ cron: "17 * * * *" });
  assert.equal(await pending(), 0);
  assert.deepEqual(await get(), baseline);
  const date = new Date(today - 2 * DAY).toISOString().slice(0, 10),
    range = `&from=${date}&to=${date}`;
  assert.deepEqual(await get(false, range), await get(true, range));
  assert.equal((await get()).identities.visitors, 3);
  // A late event inside a summarized day updates counts and duration without waiting for cron.
  await db
    .prepare(
      "INSERT INTO events(id,site_id,received_at,visitor_id,session_id,name,path,country) VALUES ('late-goal',?,?, 'same','cross','signup','/signup','JP')",
    )
    .bind(target.id, today - DAY + 4000)
    .run();
  assert.deepEqual(await get(), await get(true));
  await db
    .prepare("DELETE FROM events WHERE site_id=? AND id='prior'")
    .bind(target.id)
    .run();
  assert.equal(
    (
      await db
        .prepare(
          "SELECT first_at FROM visitor_first_seen WHERE site_id=? AND visitor_id='same'",
        )
        .bind(target.id)
        .first()
    ).first_at,
    today - 3 * DAY + 1000,
  );
  assert.deepEqual(await get(), await get(true));
  await db
    .prepare(
      "UPDATE events SET visitor_id='changed',received_at=? WHERE site_id=? AND id='bounce'",
    )
    .bind(today - 4 * DAY, target.id)
    .run();
  assert.equal(
    await db
      .prepare(
        "SELECT visitor_id FROM visitor_first_seen WHERE site_id=? AND visitor_id='bounce'",
      )
      .bind(target.id)
      .first(),
    null,
  );
  assert.deepEqual(await get(), await get(true));
});

test("online presence deduplicates visitors, expires after 60s and never enters report events", async () => {
  const created = await request("/api/sites", {
    method: "POST",
    cookie: ownerCookie,
    body: { name: "Presence test", origin: "https://presence.example" },
  });
  const fixture = await created.json();
  const payload = {
    version: 2,
    id: "heartbeat-one",
    siteId: fixture.id,
    name: "presence",
    path: "/reading?secret=removed",
    presence: true,
    visible: true,
    consent: true,
    visitorId: "12345678-1234-4123-8123-123456789abc",
    sessionId: "12345678-1234-4123-8123-123456789def",
    utmSource: "newsletter",
  };
  const send = (body = payload, requestOrigin = fixture.origin) =>
    request("/ingest", { method: "POST", body, requestOrigin });
  assert.equal((await send(payload, "https://wrong.example")).status, 403);
  assert.equal((await send({ ...payload, consent: false })).status, 400);
  assert.equal(
    (await send({ ...payload, visitorId: null, sessionId: null })).status,
    400,
  );
  assert.equal((await send()).status, 202);
  assert.equal(
    (
      await send({
        ...payload,
        id: "heartbeat-two",
        path: "/pricing",
        sessionId: "12345678-1234-4123-8123-123456789aaa",
      })
    ).status,
    202,
  );
  const live = async () =>
    (
      await request(`/api/sites/${fixture.id}/live?days=30`, {
        cookie: ownerCookie,
      })
    ).json();
  let result = await live();
  assert.equal(result.online.visitors, 1);
  assert.equal(result.online.rows[0].path, "/pricing");
  assert.equal(result.online.rows[0].source, "Campaign · newsletter");
  assert.notEqual(result.online.rows[0].visitorId, payload.visitorId);
  assert.equal(result.visitors, 0);
  assert.equal(
    (
      await db
        .prepare("select count(*) as total from events where site_id=?")
        .bind(fixture.id)
        .first()
    ).total,
    0,
  );
  assert.equal(
    (await send({ ...payload, visible: false, path: "/hidden" })).status,
    202,
  );
  assert.equal((await live()).online.rows[0].path, "/pricing");
  await db
    .prepare("update visitor_presence set received_at=? where site_id=?")
    .bind(Date.now() - 61_000, fixture.id)
    .run();
  assert.equal((await live()).online.visitors, 0);
  assert.equal((await send()).status, 202);
  assert.equal((await live()).online.rows[0].path, "/reading");
  assert.equal((await request(`/api/sites/${fixture.id}/live`)).status, 401);
  assert.equal(
    (await request(`/api/sites/${site.id}/live`, { cookie: ownerCookie }))
      .status,
    200,
  );
  assert.equal(
    (
      await db
        .prepare(
          "select count(*) as total from visitor_presence where site_id=?",
        )
        .bind(fixture.id)
        .first()
    ).total,
    1,
  );
});

test("website settings persist with owner checks and exclusions prevent ingestion", async () => {
  const made = await request("/api/sites", {
    method: "POST",
    cookie: ownerCookie,
    body: { name: "Settings fixture", origin: "https://settings.example" },
  });
  const target = await made.json();
  const rules = {
    additionalOrigins: ["https://app.settings.example"],
    allowAllDomains: false,
    excludedPaths: ["/private/*"],
    excludedHostnames: ["staging.settings.example"],
  };
  const mutate = (name, data, cookie = ownerCookie) =>
    request(`/_serverFn/${serverFns[name]}`, {
      method: "POST",
      cookie,
      body: toJSON({ data }),
    });
  assert.ok(serverFns.saveTrackingRulesFn && serverFns.saveSiteDetailsFn);
  const input = { siteId: target.id, rules, excludeBots: true };
  assert.match(
    await (await mutate("saveTrackingRulesFn", input, "")).text(),
    /login/,
  );
  assert.match(
    await (
      await mutate("saveTrackingRulesFn", { ...input, siteId: "missing-site" })
    ).text(),
    /Website not found/,
  );
  assert.match(
    await (
      await mutate("saveSiteDetailsFn", {
        siteId: "missing-site",
        name: "Forbidden",
        origin: target.origin,
      })
    ).text(),
    /Website not found/,
  );
  const forbidden = await request(
    `/_serverFn/${serverFns.saveTrackingRulesFn}`,
    {
      method: "POST",
      cookie: ownerCookie,
      requestOrigin: "https://evil.example",
      body: toJSON({ data: input }),
    },
  );
  assert.equal(forbidden.status, 403);
  assert.equal((await mutate("saveTrackingRulesFn", input)).status, 200);
  assert.deepEqual(
    JSON.parse(
      (
        await db
          .prepare("SELECT tracking_rules FROM sites WHERE id=?")
          .bind(target.id)
          .first()
      ).tracking_rules,
    ),
    rules,
  );
  const send = (origin, path, id) =>
    request("/ingest", {
      method: "POST",
      requestOrigin: origin,
      body: { version: 1, siteId: target.id, name: "pageview", id, path },
    });
  const allowed = await send(
    "https://app.settings.example",
    "/public",
    "settings-allowed",
  );
  assert.equal(allowed.status, 202);
  assert.equal(
    allowed.headers.get("access-control-allow-origin"),
    "https://app.settings.example",
  );
  assert.equal(
    (await send("https://unknown.example", "/public", "settings-unknown"))
      .status,
    403,
  );
  const excluded = await send(
    target.origin,
    "/private/page",
    "settings-excluded",
  );
  assert.equal(excluded.status, 202);
  assert.equal((await excluded.json()).ignored, "exclusion");
  await eventually(
    async () =>
      !!(await db
        .prepare("SELECT id FROM events WHERE id='settings-allowed'")
        .first()),
  );
  assert.equal(
    await db
      .prepare("SELECT id FROM events WHERE id='settings-excluded'")
      .first(),
    null,
  );
  await mutate("saveTrackingRulesFn", {
    ...input,
    rules: { ...rules, allowAllDomains: true },
  });
  assert.equal(
    (
      await (
        await send(
          "https://staging.settings.example",
          "/",
          "settings-host-excluded",
        )
      ).json()
    ).ignored,
    "exclusion",
  );
  assert.equal((await send("null", "/", "settings-null")).status, 403);
  const updated = await mutate("saveSiteDetailsFn", {
    siteId: target.id,
    name: "Renamed website",
    origin: "https://new.settings.example",
  });
  assert.equal(updated.status, 200);
  assert.equal(
    (
      await db
        .prepare("SELECT name FROM sites WHERE id=?")
        .bind(target.id)
        .first()
    ).name,
    "Renamed website",
  );
});

test("long Unicode paths survive raw reporting and rollup indexes", async () => {
  const created = await request("/api/sites", {
    method: "POST",
    cookie: ownerCookie,
    body: { name: "Unicode", origin: "https://unicode.example" },
  });
  const target = await created.json();
  const path =
    "/" +
    Array.from({ length: 1023 }, (_, i) =>
      String.fromCharCode(0x4e00 + ((i * 997) % 18000)),
    ).join("");
  const yesterday = Math.floor(Date.now() / 86400000) * 86400000 - 86400000;
  await db
    .prepare(
      "INSERT INTO events(id,site_id,name,path,received_at) VALUES ('unicode',?,'pageview',?,?)",
    )
    .bind(target.id, path, yesterday)
    .run();
  const read = async () => {
    const response = await request(`/api/sites/${target.id}/overview?days=7`, {
      cookie: ownerCookie,
    });
    assert.equal(response.status, 200, await response.clone().text());
    return response.json();
  };
  assert.equal((await read()).pages[0].path, path);
  await (await mf.getWorker()).scheduled({ cron: "17 * * * *" });
  assert.equal(
    (
      await db
        .prepare("SELECT count(*) AS n FROM rollup_days WHERE site_id=?")
        .bind(target.id)
        .first()
    ).n,
    1,
  );
  assert.equal((await read()).pages[0].path, path);
});

test(
  "Postgres rollups wait for concurrent event writes and include the committed event",
  { skip: !usePostgres },
  async () => {
    const created = await request("/api/sites", {
      method: "POST",
      cookie: ownerCookie,
      body: { name: "Concurrent rollup", origin: "https://concurrent.example" },
    });
    const target = await created.json();
    const yesterday = Math.floor(Date.now() / 86400000) * 86400000 - 86400000;
    await db
      .prepare(
        "INSERT INTO events(id,site_id,name,path,received_at) VALUES ('initial',?,'pageview','/',?)",
      )
      .bind(target.id, yesterday)
      .run();
    const connection = await postgres.pool.connect();
    let scheduled;
    try {
      await connection.query("BEGIN");
      await connection.query(
        "INSERT INTO events(id,site_id,name,path,received_at) VALUES ('concurrent',$1,'pageview','/late',$2)",
        [target.id, yesterday + 1],
      );
      scheduled = (await mf.getWorker()).scheduled({ cron: "17 * * * *" });
      await eventually(
        async () =>
          (
            await postgres.pool.query(
              "SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock'",
            )
          ).rows[0].n > 0,
      );
      await connection.query("COMMIT");
      await scheduled;
      const row = await db
        .prepare(
          "SELECT sum(pageviews) AS n FROM daily_traffic WHERE site_id=? AND dimension='page'",
        )
        .bind(target.id)
        .first();
      assert.equal(row.n, 2);
      assert.equal(
        (
          await db
            .prepare("SELECT count(*) AS n FROM rollup_pending WHERE site_id=?")
            .bind(target.id)
            .first()
        ).n,
        0,
      );
    } finally {
      await connection.query("ROLLBACK");
      connection.release();
      await scheduled?.catch(() => {});
    }
  },
);

test(
  "Postgres seed CLI populates reports and rollups; a failed seed leaves existing sites intact",
  { skip: !usePostgres },
  async () => {
    const existing = (
      await postgres.pool.query("SELECT count(*)::int AS n FROM sites")
    ).rows[0].n;
    const output = execFileSync(
      process.execPath,
      [
        "scripts/seed-site.mjs",
        "--sessions",
        "1000",
        "--days",
        "7",
        "--name",
        "Owner's demo",
      ],
      {
        encoding: "utf8",
        env: {
          ...process.env,
          DATABASE_PROVIDER: "postgres",
          DATABASE_URL: postgres.connectionString,
        },
      },
    );
    const siteId = output.match(/\/app\/([a-f0-9-]+)\/overview/)[1];
    assert.match(output, /local Postgres/);
    assert.equal(
      (await postgres.pool.query("SELECT count(*)::int AS n FROM sites"))
        .rows[0].n,
      existing + 1,
    );
    const counts = (
      await postgres.pool.query(
        `SELECT
    (SELECT count(*)::int FROM events WHERE site_id=$1) AS events,
    (SELECT count(*)::int FROM payments WHERE site_id=$1) AS payments,
    (SELECT count(*)::int FROM goals WHERE site_id=$1) AS goals,
    (SELECT count(*)::int FROM funnels WHERE site_id=$1) AS funnels`,
        [siteId],
      )
    ).rows[0];
    assert.ok(counts.events > 3000);
    assert.ok(counts.payments > 0);
    assert.equal(counts.goals, 3);
    assert.equal(counts.funnels, 2);
    const report = async () => {
      const response = await request(`/api/sites/${siteId}/overview?days=7`, {
        cookie: ownerCookie,
      });
      assert.equal(response.status, 200, await response.clone().text());
      return response.json();
    };
    const before = await report();
    assert.equal(before.site.name, "Owner's demo");
    assert.ok(before.identities.visitors > 0);
    assert.ok(before.pageviews > 0);
    for (const route of ["visitors", "funnels", "revenue"]) {
      const response = await request(`/api/sites/${siteId}/${route}?days=7`, {
        cookie: ownerCookie,
      });
      assert.equal(response.status, 200, await response.clone().text());
    }
    const coverage = async () =>
      (
        await postgres.pool.query(
          "SELECT count(*)::int AS n FROM rollup_days WHERE site_id=$1",
          [siteId],
        )
      ).rows[0].n;
    for (let i = 0; i < 15 && (await coverage()) < 6; i++)
      await (await mf.getWorker()).scheduled({ cron: "17 * * * *" });
    assert.equal(await coverage(), 6);
    const after = await report();
    assert.equal(after.pageviews, before.pageviews);
    assert.deepEqual(after.identities, before.identities);
    assert.deepEqual(after.customTotals, before.customTotals);
    assert.deepEqual(after.sessionStats, before.sessionStats);

    await postgres.pool.query(
      "CREATE FUNCTION fail_seed_fn() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic seed failure'; END; $$; CREATE TRIGGER fail_seed BEFORE INSERT ON events FOR EACH ROW EXECUTE FUNCTION fail_seed_fn()",
    );
    try {
      await assert.rejects(
        seedPostgres(postgres.pool, { sessions: 10, days: 7 }),
        /Postgres seed rolled back/,
      );
      assert.equal(
        (await postgres.pool.query("SELECT count(*)::int AS n FROM sites"))
          .rows[0].n,
        existing + 1,
      );
      assert.equal(
        (
          await postgres.pool.query(
            "SELECT count(*)::int AS n FROM events WHERE site_id=$1",
            [siteId],
          )
        ).rows[0].n,
        counts.events,
      );
    } finally {
      await postgres.pool.query(
        "DROP TRIGGER fail_seed ON events; DROP FUNCTION fail_seed_fn()",
      );
    }
  },
);

test("event properties survive queue delivery and replay; explorer filters types and paginates", async () => {
  const fixture = await request("/api/sites", {
    method: "POST",
    cookie: ownerCookie,
    body: { name: "Property explorer", origin: "https://properties.example" },
  }).then((r) => r.json());
  const at = Date.now() - 60000;
  const rows = Array.from({ length: 55 }, (_, i) => ({
    id: `property-${String(i).padStart(3, "0")}`,
    properties: { seats: 1, plan: "pro", trial: false },
  }));
  rows.push(
    { id: "string-one", properties: { seats: "1", plan: "starter" } },
    { id: "boolean-one", properties: { seats: true, plan: "starter" } },
    { id: "decimal", properties: { seats: 1.5 } },
  );
  await db.batch(
    rows.map((row) =>
      db
        .prepare(
          "insert into events(id,site_id,name,path,received_at,properties) values(?,?,'signup','/pricing',?,?)",
        )
        .bind(row.id, fixture.id, at, JSON.stringify(row.properties)),
    ),
  );
  await db
    .prepare(
      "insert into events(id,site_id,name,path,received_at) values('old-no-properties',?,'pageview','/',?)",
    )
    .bind(fixture.id, at)
    .run();
  const payload = {
    version: 2,
    id: "queued-properties",
    siteId: fixture.id,
    name: "checkout",
    path: "/checkout",
    properties: {
      plan: "日本語",
      empty: "",
      special: "x' OR 1=1 --",
      trial: false,
    },
  };
  const send = (body) =>
    request("/ingest", {
      method: "POST",
      requestOrigin: fixture.origin,
      headers: { "cf-connecting-ip": "192.0.2.91" },
      body,
    });
  assert.equal((await send(payload)).status, 202);
  await eventually(
    async () =>
      !!(await db
        .prepare("select id from events where site_id=? and id=?")
        .bind(fixture.id, payload.id)
        .first()),
  );
  const stored = await db
    .prepare("select * from events where site_id=? and id=?")
    .bind(fixture.id, payload.id)
    .first();
  assert.deepEqual(JSON.parse(stored.properties), payload.properties);
  const worker = await mf.getWorker();
  const replay = await worker.queue("events", [
    {
      id: "replay-properties",
      attempts: 1,
      timestamp: new Date(),
      body: {
        ...payload,
        receivedAt: stored.received_at,
        properties: { plan: "changed" },
      },
    },
  ]);
  assert.equal(replay.retryBatch.retry, false);
  assert.deepEqual(
    JSON.parse(
      (
        await db
          .prepare("select properties from events where site_id=? and id=?")
          .bind(fixture.id, payload.id)
          .first()
      ).properties,
    ),
    payload.properties,
  );
  for (const properties of [
    null,
    [],
    { nested: {} },
    { value: null },
    { value: "\ud800" },
    { "bad.key": 1 },
    { constructor: "bad" },
    { value: "x".repeat(257) },
    { value: "line\nbreak" },
    Object.fromEntries(Array.from({ length: 21 }, (_, i) => [`key${i}`, 1])),
    Object.fromEntries(
      Array.from({ length: 3 }, (_, i) => [`key${i}`, "語".repeat(256)]),
    ),
  ]) {
    assert.equal(
      (await send({ ...payload, id: "invalid-properties", properties })).status,
      400,
    );
  }
  const invalidReplay = await worker.queue("events", [
    {
      id: "bad-properties",
      attempts: 1,
      timestamp: new Date(),
      body: {
        ...payload,
        id: "invalid-queue-properties",
        receivedAt: Date.now(),
        properties: { nested: {} },
      },
    },
  ]);
  assert.ok(
    invalidReplay.retryBatch.retry || invalidReplay.retryMessages.length,
  );
  assert.equal(
    await db
      .prepare(
        "select id from events where site_id=? and id='invalid-queue-properties'",
      )
      .bind(fixture.id)
      .first(),
    null,
  );
  const endpoint = `/api/sites/${fixture.id}/event-explorer`;
  const report = async (params = {}) => {
    const response = await request(
      `${endpoint}?${new URLSearchParams(params)}`,
      { cookie: ownerCookie },
    );
    assert.equal(response.status, 200, await response.clone().text());
    assert.match(response.headers.get("cache-control"), /no-store/);
    return response.json();
  };
  const all = await report();
  assert.equal(all.total, 60);
  assert.equal(all.visitors, 0);
  assert.equal(all.events.length, 50);
  assert.deepEqual(
    (await report({ eventName: "pageview" })).events[0].properties,
    {},
  );
  for (const [value, total] of [
    [1, 55],
    ["1", 1],
    [true, 1],
    [1.5, 1],
  ]) {
    const result = await report({
      propertyKey: "seats",
      propertyValue: `json:${JSON.stringify(value)}`,
    });
    assert.equal(result.total, total);
    assert.ok(result.events.every((row) => row.properties.seats === value));
    assert.equal(result.properties.length, 4);
  }
  assert.equal(
    (await report({ propertyKey: "empty", propertyValue: 'json:""' })).total,
    1,
  );
  assert.equal(
    (await report({ propertyKey: "trial", propertyValue: "json:false" })).total,
    56,
  );
  assert.equal(
    (
      await report({
        propertyKey: "special",
        propertyValue: `json:${JSON.stringify(payload.properties.special)}`,
      })
    ).total,
    1,
  );
  assert.equal(
    (
      await report({
        eventName: "signup",
        path: "/missing",
        propertyKey: "seats",
        propertyValue: "json:1",
      })
    ).total,
    0,
  );
  assert.equal(
    (await report({ eventName: "signup", propertyKey: "seats" })).total,
    58,
  );
  const date = new Date(at).toISOString().slice(0, 10);
  assert.equal(
    (await report({ from: date, to: date, eventName: "signup" })).total,
    58,
  );
  const first = await report({ eventName: "signup" });
  await db
    .prepare(
      "insert into events(id,site_id,name,path,received_at) values('later-event',?,'signup','/',?)",
    )
    .bind(fixture.id, first.asOf + 1)
    .run();
  const second = await report({ eventName: "signup", ...first.nextCursor });
  assert.equal(second.total, 58);
  assert.equal(second.events.length, 8);
  assert.equal(second.nextCursor, null);
  assert.equal(
    new Set([...first.events, ...second.events].map((row) => row.id)).size,
    58,
  );
  assert.equal((await request(endpoint)).status, 401);
  assert.equal(
    (
      await request("/api/sites/missing/event-explorer", {
        cookie: ownerCookie,
      })
    ).status,
    404,
  );
  const other = await request(
    `/api/sites/${site.id}/event-explorer?eventName=checkout&propertyKey=plan&propertyValue=json:${encodeURIComponent('"日本語"')}`,
    { cookie: ownerCookie },
  ).then((r) => r.json());
  assert.equal(other.total, 0);
  for (const query of [
    { propertyValue: "json:1" },
    { propertyKey: "seats", propertyValue: "json:null" },
    { propertyKey: "seats", propertyValue: "json:{}" },
    { propertyKey: "x' OR 1=1" },
    { eventName: "x' OR 1=1" },
    { beforeAt: at },
    { beforeId: "x" },
    { asOf: Date.now() + 86400000 },
    { days: 366 },
  ]) {
    assert.equal(
      (
        await request(`${endpoint}?${new URLSearchParams(query)}`, {
          cookie: ownerCookie,
        })
      ).status,
      400,
    );
  }
  assert.ok(serverFns.eventExplorerFn);
  const fnPath = `/_serverFn/${serverFns.eventExplorerFn}?payload=${encodeURIComponent(JSON.stringify(toJSON({ data: { siteId: fixture.id, days: 7, eventName: "checkout" } })))}`;
  assert.match(await (await request(fnPath)).text(), /login/);
  const authenticated = await request(fnPath, { cookie: ownerCookie });
  assert.equal(authenticated.status, 200);
  assert.match(await authenticated.text(), /日本語/);
  const html = await request(
    `/app/${fixture.id}/events?propertyKey=seats&propertyValue=json%3A1`,
    { cookie: ownerCookie },
  ).then((r) => r.text());
  assert.match(html, /Event explorer/);
  assert.match(html, /55/);
  assert.match(html, /property-054/);
});

test("typed conversion conditions match history, page goals, variants and ordered steps", async () => {
  const fixture = await request("/api/sites", {
    method: "POST",
    cookie: ownerCookie,
    body: {
      name: "Conditional conversions",
      origin: "https://conditions.example",
    },
  }).then((r) => r.json());
  const base = `/api/sites/${fixture.id}`;
  const get = async (path) => {
    const response = await request(base + path, { cookie: ownerCookie });
    assert.equal(response.status, 200, await response.clone().text());
    return response.json();
  };
  const create = (body) =>
    request(base + "/goals", { method: "POST", cookie: ownerCookie, body });
  const day = 86400000,
    today = Math.floor(Date.now() / day) * day,
    at = today - day + 1000;
  const rows = [
    [
      "c1",
      "signup",
      "/thanks",
      "one",
      { plan: "pro", count: 1, paid: true },
      at,
    ],
    [
      "c2",
      "signup",
      "/thanks",
      "one",
      { plan: "pro", count: 1, paid: true },
      at + 1,
    ],
    [
      "c3",
      "signup",
      "/thanks",
      "two",
      { plan: "pro", count: "1", paid: "true" },
      at,
    ],
    ["c4", "signup", "/thanks", "three", {}, at],
    [
      "c5",
      "signup",
      "/thanks",
      null,
      { plan: "pro", count: 1, paid: true },
      at,
    ],
    ["c6", "pageview", "/thanks", "one", {}, at + 2],
    ["c7", "pageview", "/other", "two", {}, at + 2],
    [
      "c8",
      "signup",
      "/thanks",
      "old",
      { plan: "pro", count: 1, paid: true },
      today - 8 * day,
    ],
  ];
  await db.batch(
    rows.map(([id, name, path, session, properties, received]) =>
      db
        .prepare(
          "INSERT INTO events(id,site_id,name,path,visitor_id,session_id,properties,received_at,tracking_version) VALUES(?,?,?,?,?,?,?,?,2)",
        )
        .bind(
          id,
          fixture.id,
          name,
          path,
          session,
          session,
          JSON.stringify(properties),
          received,
        ),
    ),
  );
  const plain = await (
    await create({ name: "All signups", eventName: "signup" })
  ).json();
  const input = {
    name: "Pro signups",
    eventName: "signup",
    conditions: { plan: "pro", count: 1, paid: true },
  };
  const response = await create(input);
  assert.equal(response.status, 201, await response.clone().text());
  const pro = await response.json();
  assert.equal(
    (
      await create({
        ...input,
        conditions: { paid: true, count: 1, plan: "pro" },
      })
    ).status,
    409,
  );
  const text = await (
    await create({
      name: "Text count",
      eventName: "signup",
      conditions: { count: "1" },
    })
  ).json();
  const page = await (
    await create({ name: "Thanks page", path: "/thanks" })
  ).json();
  for (const invalid of [
    { a: 1, b: 2, c: 3, d: 4 },
    { nested: {} },
    { missing: null },
    { constructor: true },
  ])
    assert.equal((await create({ ...input, conditions: invalid })).status, 400);
  for (const path of ["thanks", "//thanks", "/thanks?x=1", "/thanks#x"])
    assert.equal((await create({ name: "Bad path", path })).status, 400);
  async function verify() {
    for (const suffix of ["", "&path=%2Fthanks"]) {
      const report = await get("/overview?days=7&compare=true" + suffix);
      const goal = (id) => report.goals.find((g) => g.id === id);
      assert.equal(report.identities.sessions, 3);
      assert.equal(goal(plain.id).completions, 5);
      assert.equal(goal(pro.id).completions, 3);
      assert.equal(goal(pro.id).identifiedCompletions, 2);
      assert.equal(goal(pro.id).convertedSessions, 1);
      assert.equal(goal(pro.id).conversionRate, 1 / 3);
      assert.equal(goal(text.id).completions, 1);
      assert.equal(goal(page.id).completions, 1);
      assert.equal(
        report.comparison.goals.find((g) => g.id === pro.id).convertedSessions,
        1,
      );
    }
  }
  await verify();
  await (
    await mf.getWorker()
  ).scheduled({ cron: "0 * * * *", scheduledTime: Date.now() });
  await verify();
  const visitors = await get(`/visitors?days=7&goalId=${pro.id}`);
  assert.equal(visitors.total, 1);
  assert.equal(visitors.visitors[0].visitorId, "one");
  const journey = await get(`/visitors/one?asOf=${Date.now()}`);
  assert.equal(journey.events.length, 3);
  assert.equal(journey.events.find((e) => e.id === "c1").goals.length, 2);
  const patch = (id, body, cookie = ownerCookie) =>
    request(base + `/goals/${id}`, { method: "PATCH", cookie, body });
  assert.equal((await patch(pro.id, { archived: true })).status, 200);
  assert.equal((await create(input)).status, 409);
  assert.equal(
    (await patch(pro.id, { ...input, conditions: { count: "1" } })).status,
    409,
  );
  assert.equal(
    (await patch(pro.id, { ...input, conditions: { count: 999 } })).status,
    200,
  );
  let changed = (await get("/overview?days=7")).goals.find(
    (g) => g.id === pro.id,
  );
  assert.equal(changed.completions, 0);
  assert.equal(changed.archived, true);
  assert.equal((await patch(pro.id, input, "")).status, 401);
  assert.equal((await patch("missing", input)).status, 404);
  const funnelInput = {
    name: "Repeated pro signup",
    scope: "session",
    windowHours: 24,
    steps: [
      { kind: "event", value: "signup", conditions: { count: 1 } },
      { kind: "event", value: "signup", conditions: { paid: true } },
      { kind: "page", value: "/thanks" },
    ],
  };
  const saved = await request(base + "/funnels", {
    method: "POST",
    cookie: ownerCookie,
    body: funnelInput,
  });
  assert.equal(saved.status, 201, await saved.clone().text());
  const funnel = await saved.json();
  const funnelReport = await get(`/funnels?days=7&funnelId=${funnel.id}`);
  assert.deepEqual(
    funnelReport.results.steps.map((s) => s.reached),
    [1, 1, 1],
  );
  const edited = await request(base + `/funnels/${funnel.id}`, {
    method: "PATCH",
    cookie: ownerCookie,
    body: {
      ...funnelInput,
      steps: [
        { ...funnelInput.steps[0], conditions: { count: "1" } },
        ...funnelInput.steps.slice(1),
      ],
    },
  });
  assert.equal(edited.status, 200);
  assert.deepEqual(
    (await get(`/funnels?days=7&funnelId=${funnel.id}`)).results.steps.map(
      (s) => s.reached,
    ),
    [1, 0, 0],
  );
});

test("conversion acquisition reports preserve sessions, typed goals, filters and comparison groups", async () => {
  const created = await request("/api/sites", {
    method: "POST",
    cookie: ownerCookie,
    body: { name: "Acquisition", origin: "https://acquisition.example" },
  });
  assert.equal(created.status, 201);
  const fixture = await created.json(),
    base = `/api/sites/${fixture.id}`;
  const goalResponse = await request(base + "/goals", {
    method: "POST",
    cookie: ownerCookie,
    body: { name: "Pro signup", eventName: "signup", conditions: { seats: 1 } },
  });
  const goal = await goalResponse.json();
  const day = 86400000,
    today = Math.floor(Date.now() / day) * day,
    start = today - 6 * day;
  const rows = [
    [
      "a00",
      "a",
      "shared",
      "pageview",
      "/landing",
      start - 1,
      "first",
      "JP",
      {},
      2,
    ],
    [
      "a01",
      "a",
      "shared",
      "pageview",
      "/wrong",
      start - 1,
      "wrong",
      "US",
      {},
      2,
    ],
    [
      "a02",
      "a",
      "shared",
      "signup",
      "/finish",
      start + 1,
      "later",
      "US",
      { seats: 1 },
      2,
    ],
    [
      "a03",
      "a",
      "shared",
      "signup",
      "/finish",
      start + 2,
      "later",
      "US",
      { seats: 1 },
      2,
    ],
    [
      "b00",
      "b",
      "b",
      "signup",
      "/checkout",
      today,
      null,
      "JP",
      { seats: 1 },
      2,
    ],
    ["b01", "b", "b", "pageview", "/purchase", today + 1, null, "JP", {}, 2],
    [
      "c00",
      "c",
      "c",
      "signup",
      "/custom",
      today,
      null,
      null,
      { seats: "1" },
      2,
    ],
    ["d00", "d", "d", "pageview", "/old", start - 100, "retired", "JP", {}, 2],
    [
      "d01",
      "d",
      "d",
      "signup",
      "/old",
      start - 99,
      "retired",
      "JP",
      { seats: 1 },
      2,
    ],
    ["e00", "e", "e", "pageview", "/legacy", today, null, null, {}, 1],
    ["f00", "f", "shared", "pageview", "/landing", today, "first", "JP", {}, 2],
    [
      "anon",
      null,
      null,
      "signup",
      "/finish",
      today,
      "first",
      "JP",
      { seats: 1 },
      2,
    ],
    [
      "future",
      "future",
      "future",
      "signup",
      "/future",
      today + day,
      "future",
      "JP",
      { seats: 1 },
      2,
    ],
  ];
  await db.batch(
    rows.map(
      ([
        id,
        visitor,
        session,
        name,
        path,
        at,
        source,
        country,
        props,
        version,
      ]) =>
        db
          .prepare(
            "INSERT INTO events(id,site_id,visitor_id,session_id,name,path,received_at,utm_source,country,properties,tracking_version) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
          )
          .bind(
            id,
            fixture.id,
            visitor,
            session,
            name,
            path,
            at,
            source,
            country,
            JSON.stringify(props),
            version,
          ),
    ),
  );
  const get = async (params = {}) => {
    const response = await request(
      base +
        "/conversions?" +
        new URLSearchParams({
          days: "7",
          goalId: goal.id,
          compare: "true",
          ...params,
        }),
      { cookie: ownerCookie },
    );
    assert.equal(response.status, 200, await response.clone().text());
    return response.json();
  };
  const report = await get();
  assert.equal(report.totals.sessions, 5);
  assert.equal(report.totals.convertedSessions, 2);
  assert.equal(report.totals.conversionRate, 0.4);
  assert.equal(report.totals.previousSessions, 2);
  assert.equal(report.totals.previousConvertedSessions, 1);
  assert.equal(
    report.rows.reduce((n, r) => n + r.sessions, 0),
    5,
  );
  const first = report.rows.find((r) => r.key === "Campaign · first");
  assert.equal(first.sessions, 2);
  assert.equal(first.convertedSessions, 1);
  assert.equal(first.previousSessions, 1);
  assert.ok(report.rows.some((r) => r.key === "Not recorded"));
  const retired = report.rows.find((r) => r.key === "Campaign · retired");
  assert.equal(retired.sessions, 0);
  assert.equal(retired.previousConvertedSessions, 1);
  assert.equal(retired.conversionRate, null);
  const landing = await get({ dimension: "landing", sort: "conversionRate" });
  assert.equal(landing.rows[0].key, "/purchase");
  assert.equal(landing.rows.find((r) => r.key === "/landing").sessions, 2);
  assert.equal(landing.rows.find((r) => r.key === null).sessions, 1);
  const filtered = await get({
    source: "Campaign · first",
    path: "/landing",
    country: "JP",
  });
  assert.equal(filtered.totals.sessions, 2);
  assert.equal(filtered.totals.convertedSessions, 1);
  assert.equal((await get({ source: "Campaign · later" })).totals.sessions, 0);
  assert.equal((await get({ path: "__unknown__" })).totals.sessions, 1);
  assert.equal((await get({ country: "US" })).totals.sessions, 0);
  const date = new Date(today).toISOString().slice(0, 10);
  assert.equal(
    (await get({ from: date, to: date, compare: "false" })).totals.sessions,
    4,
  );
  await (
    await mf.getWorker()
  ).scheduled({ cron: "0 * * * *", scheduledTime: Date.now() });
  assert.deepEqual((await get()).rows, report.rows);
  assert.equal((await request(base + "/conversions")).status, 401);
  assert.equal(
    (
      await request(`/api/sites/${site.id}/conversions?goalId=${goal.id}`, {
        cookie: ownerCookie,
      })
    ).status,
    404,
  );
  for (const params of [
    "sort=sql",
    "direction=no",
    "page=-1",
    "page=1.5",
    "dimension=bad",
    "days=8",
  ])
    assert.equal(
      (await request(base + "/conversions?" + params, { cookie: ownerCookie }))
        .status,
      400,
    );
  const fnPath = `/_serverFn/${serverFns.conversionsFn}?payload=${encodeURIComponent(JSON.stringify(toJSON({ data: { siteId: fixture.id, days: 7, goalId: goal.id } })))}`;
  assert.match(await (await request(fnPath)).text(), /login/);
  assert.match(
    await (await request(fnPath, { cookie: ownerCookie })).text(),
    /convertedSessions/,
  );
  const html = await request(
    `/app/${fixture.id}/overview?days=7&view=conversions&goalId=${goal.id}`,
    { cookie: ownerCookie },
  ).then((r) => r.text());
  assert.match(html, /Conversion performance/);
  // A full page and a short final page with tied sort values must not repeat keys.
  await db.batch(
    Array.from({ length: 55 }, (_, i) =>
      db
        .prepare(
          "INSERT INTO events(id,site_id,visitor_id,session_id,name,path,received_at,tracking_version) VALUES(?,?,?,?,'pageview',?,?,2)",
        )
        .bind(
          `paged-${i}`,
          fixture.id,
          `paged-${i}`,
          `paged-${i}`,
          `/page-${String(i).padStart(2, "0")}`,
          today,
        ),
    ),
  );
  const p0 = await get({
    dimension: "landing",
    compare: "false",
    sort: "sessions",
    direction: "asc",
  });
  const p1 = await get({
    dimension: "landing",
    compare: "false",
    sort: "sessions",
    direction: "asc",
    page: "1",
  });
  assert.equal(p0.rows.length, 50);
  assert.equal(p0.hasMore, true);
  assert.equal(p1.hasMore, false);
  assert.equal(
    new Set([...p0.rows, ...p1.rows].map((r) => r.key)).size,
    p0.groups,
  );
  const pageGoal = await request(base + "/goals", {
    method: "POST",
    cookie: ownerCookie,
    body: { name: "Arrive", path: "/landing" },
  }).then((r) => r.json());
  assert.equal(
    (await get({ goalId: pageGoal.id, compare: "false" })).totals
      .convertedSessions,
    1,
  );
  await request(base + `/goals/${goal.id}`, {
    method: "PATCH",
    cookie: ownerCookie,
    body: { archived: true },
  });
  assert.equal((await get()).selected.archived, true);
});

test("site timezone persists and Tokyo reports exclude adjacent local days", async () => {
  const created = await request("/api/sites", {
    method: "POST",
    cookie: ownerCookie,
    body: {
      name: "Tokyo fixture",
      origin: "https://tokyo.example.com",
      timezone: "Asia/Tokyo",
    },
  });
  assert.equal(created.status, 201);
  const target = await created.json();
  assert.equal(target.timezone, "Asia/Tokyo");
  const start = Date.parse("2026-01-10T15:00:00Z"),
    end = start + 86400000;
  await db.batch(
    [start - 1, start, end - 1, end].map((time, i) =>
      db
        .prepare(
          "INSERT INTO events(id,site_id,visitor_id,session_id,name,path,received_at,tracking_version) VALUES(?,?,?,?,'pageview','/tokyo',?,2)",
        )
        .bind(`tokyo-${i}`, target.id, `visitor-${i}`, `session-${i}`, time),
    ),
  );
  const path = `/api/sites/${target.id}/overview?from=2026-01-11&to=2026-01-11&compare=true`;
  const report = await (await request(path, { cookie: ownerCookie })).json();
  assert.equal(report.start, start);
  assert.equal(report.end, end);
  assert.equal(report.pageviews, 2);
  assert.equal(report.identities.visitors, 2);
  assert.equal(report.sessionStats.sessions, 2);
  assert.deepEqual(report.series, [{ date: "2026-01-11", pageviews: 2 }]);
  assert.equal(report.comparison.pageviews, 1);
  assert.equal(report.visitorInsights.visitorCountries[0].visitors, 2);
  // Completed UTC summaries must not change the meaning of a local day.
  await db
    .prepare("INSERT INTO rollup_days(site_id,day,completed_at) VALUES(?,?,?)")
    .bind(target.id, Date.parse("2026-01-11T00:00:00Z"), Date.now())
    .run();
  const rolled = await (await request(path, { cookie: ownerCookie })).json();
  assert.deepEqual(rolled.series, report.series);
  assert.equal(rolled.identities.visitors, 2);
  const saved = await request(`/_serverFn/${serverFns.saveSiteDetailsFn}`, {
    method: "POST",
    cookie: ownerCookie,
    body: toJSON({
      data: {
        siteId: target.id,
        name: target.name,
        origin: target.origin,
        timezone: "America/New_York",
      },
    }),
  });
  assert.equal(saved.status, 200);
  const persisted = await db
    .prepare("SELECT timezone FROM sites WHERE id=?")
    .bind(target.id)
    .first();
  assert.equal(persisted.timezone, "America/New_York");
  const invalid = await request("/api/sites", {
    method: "POST",
    cookie: ownerCookie,
    body: {
      name: "Invalid zone",
      origin: "https://invalidzone.example.com",
      timezone: "Mars/Olympus",
    },
  });
  assert.equal(invalid.status, 400);
});

test("public dashboards enforce report opt-ins, site isolation, revocation and owner-only configuration", async () => {
  const fixture = await request("/api/sites", {
    method: "POST",
    cookie: ownerCookie,
    body: {
      name: "Public sharing fixture",
      origin: "https://public-fixture.example",
    },
  }).then((r) => r.json());
  const getFn = async (name, data, cookie) => {
    assert.ok(serverFns[name], name);
    return request(
      `/_serverFn/${serverFns[name]}?payload=${encodeURIComponent(JSON.stringify(toJSON({ data })))}`,
      { cookie },
    );
  };
  const write = (settings, cookie = ownerCookie, requestOrigin = origin) =>
    request(`/_serverFn/${serverFns.savePublicSharingFn}`, {
      method: "POST",
      cookie,
      requestOrigin,
      body: toJSON({ data: { siteId: fixture.id, settings } }),
    });
  const settings = {
    enabled: true,
    events: false,
    visitors: false,
    revenue: false,
    conversions: false,
  };
  const before = await getFn(
    "publicSharingFn",
    { siteId: fixture.id },
    ownerCookie,
  );
  assert.match(await before.text(), /publicId/);
  assert.match(await (await write(settings, "")).text(), /Sign in/);
  assert.equal(
    (await write(settings, ownerCookie, "https://evil.example")).status,
    403,
  );
  assert.equal((await write(settings)).status, 200);
  const settingsPage = await request(
    `/app/${fixture.id}/settings?section=sharing`,
    { cookie: ownerCookie },
  );
  assert.equal(settingsPage.status, 200);
  const settingsHtml = await settingsPage.text();
  assert.match(settingsHtml, /Make this dashboard public/);
  assert.match(settingsHtml, /Save sharing settings/);
  assert.doesNotMatch(settingsHtml, /withDatabase scope/);

  const shared = await db
    .prepare("SELECT public_id AS id FROM site_public_shares WHERE site_id=?")
    .bind(fixture.id)
    .first();
  assert.ok(shared.id);
  const now = Date.now() - 1000;
  await db
    .prepare(
      "INSERT INTO events(site_id,id,name,path,received_at,visitor_id,session_id,tracking_version,properties) VALUES (?,?,?,?,?,?,?,?,?)",
    )
    .bind(
      fixture.id,
      "public-page",
      "pageview",
      "/public-traffic",
      now,
      "public-visitor",
      "public-session",
      2,
      "{}",
    )
    .run();
  await db
    .prepare(
      "INSERT INTO events(site_id,id,name,path,received_at,visitor_id,session_id,tracking_version,properties) VALUES (?,?,?,?,?,?,?,?,?)",
    )
    .bind(
      fixture.id,
      "private-event",
      "private_custom_event",
      "/private-event-path",
      now,
      "public-visitor",
      "public-session",
      2,
      '{"secret_property":"sensitive-value"}',
    )
    .run();
  await db
    .prepare(
      "INSERT INTO payments(site_id,provider,mode,external_id,amount,currency,paid_at,visitor_id,created_at,updated_at) VALUES (?,'api','live','private-payment-ref',2900,'USD',?,'public-visitor',?,?)",
    )
    .bind(fixture.id, now, now, now)
    .run();
  const read = async (report, filters = {}, publicId = shared.id) =>
    (await getFn("publicReportFn", { publicId, report, filters })).text();
  const overview = await read("overview");
  assert.match(overview, /public-traffic/);
  assert.doesNotMatch(
    overview,
    /private_custom_event|sensitive-value|private-payment-ref|public-visitor/,
  );
  for (const report of [
    "events",
    "visitors",
    "journey",
    "revenue",
    "conversions",
    "funnels",
    "live",
  ])
    assert.match(await read(report), /not shared/);
  assert.match(await read("overview", {}, crypto.randomUUID()), /unavailable/);
  assert.doesNotMatch(await read("overview", { siteId: site.id }), /welcome/);
  assert.equal(
    (await request(`/api/sites/${fixture.id}/overview`)).status,
    401,
  );
  for (const name of ["addGoalFn", "saveOperationsFn", "saveSiteDetailsFn"]) {
    const response = await request(`/_serverFn/${serverFns[name]}`, {
      method: "POST",
      body: toJSON({
        data: {
          siteId: fixture.id,
          name: "Unauthorized",
          eventName: "signup",
          origin: "https://evil.example",
        },
      }),
    });
    assert.doesNotMatch(await response.text(), /"access":"owner"/);
  }
  const page = await request(`/share/${shared.id}/overview?days=7`);
  assert.equal(
    page.status,
    200,
    JSON.stringify({
      location: page.headers.get("location"),
      body: await page.clone().text(),
    }),
  );
  assert.match(page.headers.get("cache-control"), /no-store/);
  assert.equal(page.headers.get("x-robots-tag"), "noindex, nofollow");
  const html = await page.text();
  assert.match(html, /Public sharing fixture/);
  assert.match(html, /public-traffic/);
  assert.match(html, /Search your workspace/);
  assert.match(html, /Help &amp; documentation/);
  assert.doesNotMatch(html, /href="[^"]*\/app(?:\/|")/);
  for (const report of ["visitors", "funnels", "revenue", "events"]) {
    assert.doesNotMatch(
      html,
      new RegExp('href="[^"]*/share/' + shared.id + "/" + report),
    );
  }
  assert.doesNotMatch(
    html,
    /sensitive-value|private-payment-ref|Revenue settings|Manage goals|API &amp; MCP access/,
  );
  // Even owners see a public view when opening the share URL.
  const ownerView = await request(`/share/${shared.id}/overview?days=7`, {
    cookie: ownerCookie,
  }).then((r) => r.text());
  assert.doesNotMatch(
    ownerView,
    /Revenue settings|Manage goals|Add website|All websites/,
  );
  await write({ ...settings, visitors: true });
  const journey = await read("journey", {
    visitorId: "public-visitor",
    asOf: Date.now(),
  });
  assert.match(journey, /public-traffic/);
  assert.doesNotMatch(
    journey,
    /sensitive-value|private_custom_event|private-payment-ref/,
  );
  await write({ ...settings, events: true });
  const events = await read("events");
  assert.match(events, /sensitive-value/);
  assert.doesNotMatch(events, /public-visitor/);
  await write({
    enabled: true,
    events: true,
    visitors: true,
    revenue: true,
    conversions: true,
  });
  for (const report of [
    "overview",
    "events",
    "visitors",
    "funnels",
    "revenue",
  ]) {
    const response = await request(`/share/${shared.id}/${report}?days=7`);
    assert.equal(response.status, 200, await response.clone().text());
    assert.doesNotMatch(
      await response.text(),
      /Something went wrong|Public dashboard unavailable/,
    );
  }
  assert.match(
    await read("journey", { visitorId: "public-visitor", asOf: Date.now() }),
    /private-payment-ref/,
  );
  await write({ ...settings, enabled: false });
  assert.match(await read("overview"), /unavailable/);
  assert.doesNotMatch(
    await request(`/share/${shared.id}/overview?days=7`).then((r) => r.text()),
    /public-traffic/,
  );
  // Previously shared URLs stay disabled without affecting the owner's report.
  assert.equal(
    (
      await request(`/api/sites/${fixture.id}/overview`, {
        cookie: ownerCookie,
      })
    ).status,
    200,
  );
});

test("configured demo uses public sharing and hourly refresh is isolated and retry-safe", async () => {
  const demoId = "demo-refresh-fixture";
  const publicId = crypto.randomUUID();
  await db
    .prepare(
      "INSERT INTO sites(id,owner_id,workspace_id,name,origin,created_at) SELECT ?,owner_id,workspace_id,'Atlas Demo','https://atlas-demo.example',? FROM sites WHERE id=?",
    )
    .bind(demoId, Date.now(), site.id)
    .run();
  await db
    .prepare(
      "INSERT INTO site_public_shares(site_id,public_id,enabled,events,visitors,revenue,conversions) VALUES (?,?,1,1,1,1,1)",
    )
    .bind(demoId, publicId)
    .run();
  const counts = () =>
    db
      .prepare(
        "SELECT (SELECT count(*) FROM events WHERE site_id=?) AS events,(SELECT count(*) FROM payments WHERE site_id=?) AS payments,(SELECT count(*) FROM events WHERE site_id!=?) AS other",
      )
      .bind(demoId, demoId, demoId)
      .first();
  const before = await counts();
  const worker = await mf.getWorker();
  const scheduledTime = Math.floor(Date.now() / 3600000) * 3600000;
  await worker.scheduled({ cron: "17 * * * *", scheduledTime });
  const first = await counts();
  assert.ok(first.events > 400);
  assert.ok(first.payments > 20);
  assert.equal(first.other, before.other);
  await worker.scheduled({ cron: "17 * * * *", scheduledTime });
  assert.deepEqual(await counts(), first);
  const demo = await request("/demo");
  assert.equal(demo.status, 307);
  assert.match(
    demo.headers.get("location"),
    new RegExp(`/share/${publicId}/overview`),
  );
  const page = await request(`/share/${publicId}/overview?days=30`).then((r) =>
    r.text(),
  );
  assert.match(page, /Sample data/);
  const landing = await request("/").then((r) => r.text());
  assert.match(landing, /View demo/);
  await db
    .prepare("UPDATE site_public_shares SET enabled=0 WHERE site_id=?")
    .bind(demoId)
    .run();
  await worker.scheduled({
    cron: "17 * * * *",
    scheduledTime: scheduledTime + 3600000,
  });
  assert.deepEqual(await counts(), first);
});

test("payload limits, sign-in, expired sessions and logout are enforced", async () => {
  assert.equal(
    (
      await request("/ingest", {
        method: "POST",
        body: { padding: "a".repeat(10000) },
      })
    ).status,
    413,
  );
  const login = await request("/api/auth/sign-in/email", {
    method: "POST",
    body: { email: ownerEmail, password },
  });
  assert.equal(login.status, 200, await login.clone().text());
  const loginCookie = cookies(login);
  assert.equal(
    (await request("/api/sites", { cookie: loginCookie })).status,
    200,
  );
  const logout = await request("/api/auth/sign-out", {
    method: "POST",
    cookie: loginCookie,
    body: {},
  });
  assert.equal(logout.status, 200);
  assert.equal(
    (await request("/api/sites", { cookie: loginCookie })).status,
    401,
  );
  await db.prepare('UPDATE "session" SET expires_at = 0').run();
  assert.equal(
    (await request("/api/sites", { cookie: ownerCookie })).status,
    401,
  );
});
