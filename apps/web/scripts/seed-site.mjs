import { randomUUID } from "node:crypto";
import { mkdtemp, open, rm, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import { parseArgs, parseEnv } from "node:util";
import pg from "pg";

const DAY = 86_400_000,
  HOUR = 3_600_000;
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const locations = [
  ["US", "California", "San Francisco"],
  ["US", "New York", "New York"],
  ["GB", "England", "London"],
  ["DE", "Berlin", "Berlin"],
  ["JP", "Tokyo", "Tokyo"],
  ["CA", "Ontario", "Toronto"],
  ["AU", "New South Wales", "Sydney"],
  ["FR", "Île-de-France", "Paris"],
  ["IN", "Maharashtra", "Mumbai"],
  ["BR", "São Paulo", "São Paulo"],
  ["NL", "North Holland", "Amsterdam"],
  ["IS", "Capital Region", "Reykjavik"],
  [null, null, null],
];
const technologies = [
  ["Chrome", "Windows", "Desktop"],
  ["Chrome", "macOS", "Desktop"],
  ["Safari", "iOS", "Mobile"],
  ["Chrome", "Android", "Mobile"],
  ["Safari", "macOS", "Desktop"],
  ["Firefox", "Linux", "Desktop"],
  ["Microsoft Edge", "Windows", "Desktop"],
  ["Safari", "iOS", "Tablet"],
];
const sources = [
  [null, null, null, null],
  [null, null, null, null],
  ["www.google.com", null, null, null],
  ["www.google.com", "google", "cpc", "summer-launch"],
  ["github.com", null, null, null],
  ["news.ycombinator.com", null, null, null],
  [null, "newsletter", "email", "weekly-digest"],
  ["linkedin.com", "linkedin", "social", "founder-stories"],
  ["www.bing.com", null, null, null],
  ["reddit.com", null, null, null],
  ["www.facebook.com", "meta", "paid_social", "autumn-retargeting"],
];
// Synthetic numeric dimensions, including IDs larger than JavaScript's safe integer.
const adCampaigns = [
  ["google", "1234567890", "90071992547409931234", "456001", "789001"],
  [
    "meta",
    "2345678901",
    "120123456789012345",
    "120123456789012346",
    "120123456789012347",
  ],
  [
    "meta",
    null,
    "120987654321098765",
    "120987654321098766",
    "120987654321098767",
  ],
];
const landings = [
  "/",
  "/",
  "/",
  "/pricing",
  "/blog",
  "/blog/privacy-first-analytics",
  "/docs",
  "/features",
  "/integrations",
  "/about",
  "/changelog",
  "/compare",
  "/blog/cloudflare",
  "/docs/quickstart",
];
const quote = (value) =>
  value == null
    ? "NULL"
    : typeof value === "number"
      ? String(value)
      : `'${String(value).replaceAll("'", "''")}'`;
const insert = (table, columns, rows) =>
  `INSERT INTO ${table} (${columns.join(",")}) VALUES\n${rows.map((row) => `(${row.map(quote).join(",")})`).join(",\n")};\n`;

export function optionsFromArgs(args) {
  const { values } = parseArgs({
    args,
    options: {
      sessions: { type: "string", default: "100000" },
      days: { type: "string", default: "180" },
      seed: { type: "string", default: "42" },
      name: { type: "string", default: "Atlas Demo" },
      origin: { type: "string", default: "https://atlas-demo.example" },
      help: { type: "boolean" },
      public: { type: "boolean" },
      demo: { type: "boolean" },
      output: { type: "string" },
      "owner-id": { type: "string" },
      "workspace-id": { type: "string" },
    },
  });
  if (values.help) return { help: true };
  for (const [key, max] of [
    ["sessions", 2_000_000],
    ["days", 730],
    ["seed", 4_294_967_295],
  ]) {
    if (
      !/^\d+$/.test(values[key]) ||
      Number(values[key]) < 1 ||
      Number(values[key]) > max
    )
      throw new Error(`--${key} must be an integer from 1 to ${max}.`);
    values[key] = Number(values[key]);
  }
  if (!values.name.trim() || values.name.length > 120)
    throw new Error("--name must contain 1–120 characters.");
  const url = new URL(values.origin);
  if (url.protocol !== "https:" || url.origin !== values.origin)
    throw new Error(
      "--origin must be an exact HTTPS origin, e.g. https://demo.example.",
    );
  if (values.demo && values.origin !== "https://atlas-demo.example")
    throw new Error("--demo requires the synthetic atlas-demo.example origin.");
  return values;
}

/** Yield bounded SQL batches instead of retaining every generated event in memory. */
export function* generateSeed({
  ownerId,
  workspaceId,
  siteId,
  sessions = 100000,
  days = 180,
  seed = 42,
  name = "Atlas Demo",
  origin = "https://atlas-demo.example",
  now = Date.now(),
  public: publicDashboard = false,
  demo = false,
}) {
  let state = seed >>> 0;
  const random = () => {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0;
    return state / 4294967296;
  };
  const pick = (items) => items[Math.floor(random() * items.length)];
  const start = Math.floor(now / DAY) * DAY - (days - 1) * DAY;
  const visitors = [],
    buckets = new Map();
  let eventRows = [],
    paymentRows = [],
    eventCount = 0,
    paymentCount = 0;
  yield insert(
    "sites",
    ["id", "owner_id", "workspace_id", "name", "origin", "created_at"],
    [[siteId, ownerId, workspaceId, name, origin, start]],
  );
  yield insert(
    "goals",
    ["id", "site_id", "name", "event_name", "created_at"],
    [
      ["signup", "Sign up"],
      ["purchase", "Purchase"],
      ["newsletter_subscribe", "Newsletter subscription"],
    ].map(([event, label]) => [
      `${siteId}-${event}`,
      siteId,
      label,
      event,
      start,
    ]),
  );
  yield insert(
    "funnels",
    [
      "id",
      "site_id",
      "name",
      "scope",
      "window_hours",
      "steps",
      "created_at",
      "updated_at",
    ],
    [
      [
        "acquisition",
        "Homepage → pricing → signup",
        "session",
        24,
        [
          { kind: "page", value: "/" },
          { kind: "page", value: "/pricing" },
          { kind: "event", value: "signup" },
        ],
      ],
      [
        "purchase",
        "Signup → purchase",
        "visitor",
        720,
        [
          { kind: "event", value: "signup" },
          { kind: "event", value: "purchase" },
        ],
      ],
    ].map(([id, label, scope, window, steps]) => [
      `${siteId}-${id}`,
      siteId,
      label,
      scope,
      window,
      JSON.stringify(steps),
      start,
      start,
    ]),
  );

  // Weight weekdays, daytime hours, growth and campaign bursts. Today receives
  // only elapsed hours; a small final cohort populates the five-minute live feed.
  const hours = [];
  let totalWeight = 0;
  for (let time = start; time < now; time += HOUR) {
    const date = new Date(time),
      age = (time - start) / DAY;
    const weight =
      ((date.getUTCDay() % 6 === 0 ? 0.65 : 1) *
        (date.getUTCHours() >= 8 && date.getUTCHours() <= 20 ? 1.8 : 0.55) *
        (0.55 + age / days) *
        (Math.abs(age - days * 0.72) < 3 || Math.abs(age - days * 0.93) < 2
          ? 2.3
          : 1) *
        (Math.min(now, time + HOUR) - time)) /
      HOUR;
    totalWeight += weight;
    hours.push({ time, cumulative: totalWeight });
  }
  if (!hours.length) hours.push({ time: now, cumulative: 0 });
  let hourIndex = 0;
  const liveSessions = Math.min(40, Math.floor(sessions / 20));
  for (let i = 0; i < sessions; i++) {
    // Always include recent paid journeys, even in small preview seeds.
    const preview = i >= sessions - Math.min(3, sessions);
    const previewIndex = i - (sessions - Math.min(3, sessions));
    const live = preview || i >= sessions - liveSessions;
    const target = (totalWeight * i) / Math.max(1, sessions - liveSessions);
    while (hourIndex < hours.length - 1 && hours[hourIndex].cumulative < target)
      hourIndex++;
    const hour = hours[hourIndex].time;
    const at = live
      ? Math.max(
          start,
          now - 240000 + Math.max(0, i - sessions + liveSessions) * 3000,
        )
      : Math.floor(hour + random() * (Math.min(now, hour + HOUR) - hour));
    const identified = live || random() < 0.82;
    let visitor = null;
    if (identified) {
      if (!preview && visitors.length && random() < 0.42)
        visitor = pick(visitors);
      else {
        visitor = {
          id: `${siteId}-v${i}`,
          location: pick(locations),
          technology: pick(technologies),
        };
        visitors.push(visitor);
      }
    }
    const session = identified ? `${siteId}-s${i}` : null;
    const location = visitor?.location ?? pick(locations),
      technology = visitor?.technology ?? pick(technologies);
    const source = preview
      ? previewIndex === 0
        ? sources[3]
        : sources[sources.length - 1]
      : pick(sources);
    const ad = identified
      ? preview
        ? adCampaigns[previewIndex]
        : source[2] === "cpc"
          ? adCampaigns[0]
          : source[2] === "paid_social"
            ? adCampaigns[1]
            : null
      : null;
    const adFields = ad
      ? [
          ...ad,
          `00000000-0000-4000-8000-${i.toString(16).padStart(12, "0")}`,
          at,
          "seed-demo-v1",
        ]
      : Array(8).fill(null);
    const landing = preview ? "/pricing" : pick(landings);
    const journey = [["pageview", landing]];
    if (random() > 0.32) {
      for (let j = 0, length = 1 + Math.floor(random() * 4); j < length; j++)
        journey.push(["pageview", pick(landings)]);
      if (random() < 0.6) {
        journey.push(["pageview", "/pricing"]);
        if (random() < 0.38) {
          journey.push(
            ["pageview", "/signup"],
            ["signup", "/signup"],
            ["pageview", "/onboarding"],
          );
          if (random() < 0.35)
            journey.push(
              ["pageview", "/checkout"],
              ["purchase", "/checkout/success"],
            );
        }
      }
      if (random() < 0.12) journey.push(["newsletter_subscribe", landing]);
    }
    if (preview && !journey.some(([event]) => event === "signup"))
      journey.push(["pageview", "/signup"], ["signup", "/signup"]);
    if (preview && !journey.some(([event]) => event === "purchase"))
      journey.push(
        ["pageview", "/checkout"],
        ["purchase", "/checkout/success"],
      );
    let timestamp = at;
    for (const [event, path] of journey) {
      timestamp = Math.min(
        now,
        timestamp + Math.floor(random() * 75000) + 1000,
      );
      eventRows.push([
        `${siteId}-e${String(eventCount++).padStart(9, "0")}`,
        siteId,
        event,
        path,
        timestamp,
        visitor?.id ?? null,
        session,
        2,
        ...source,
        ...location,
        ...technology,
        ...adFields,
      ]);
      const bucketHour = Math.floor(timestamp / HOUR) * HOUR;
      if (bucketHour >= Math.floor(now / HOUR) * HOUR - 23 * HOUR) {
        const bucket = buckets.get(bucketHour) ?? { count: 0, last: 0 };
        bucket.count++;
        bucket.last = Math.max(bucket.last, timestamp);
        buckets.set(bucketHour, bucket);
      }
      if (event === "purchase") {
        const amount = pick([1900, 4900, 4900, 9900, 19900]);
        const refund =
          random() < 0.06
            ? amount
            : random() < 0.04
              ? Math.floor(amount / 2)
              : 0;
        paymentRows.push([
          siteId,
          random() < 0.8 ? "stripe" : "api",
          !preview && random() < 0.15 ? "test" : "live",
          `${siteId}-p${paymentCount++}`,
          amount,
          refund,
          preview
            ? previewIndex === 2
              ? "EUR"
              : "USD"
            : random() < 0.85
              ? "USD"
              : "EUR",
          timestamp,
          visitor?.id ?? null,
          timestamp,
          timestamp,
        ]);
      }
    }
    if (eventRows.length >= 100 || i === sessions - 1) {
      yield insert(
        "events",
        [
          "id",
          "site_id",
          "name",
          "path",
          "received_at",
          "visitor_id",
          "session_id",
          "tracking_version",
          "referrer_host",
          "utm_source",
          "utm_medium",
          "utm_campaign",
          "country",
          "region",
          "city",
          "browser",
          "os",
          "device",
          "ad_provider",
          "ad_account_id",
          "ad_campaign_id",
          "ad_group_id",
          "ad_id",
          "ad_touch_id",
          "ad_touched_at",
          "ad_consent_policy",
        ],
        eventRows,
      );
      eventRows = [];
    }
    if (
      paymentRows.length >= 100 ||
      (i === sessions - 1 && paymentRows.length)
    ) {
      yield insert(
        "payments",
        [
          "site_id",
          "provider",
          "mode",
          "external_id",
          "amount",
          "refunded_amount",
          "currency",
          "paid_at",
          "visitor_id",
          "created_at",
          "updated_at",
        ],
        paymentRows,
      );
      paymentRows = [];
    }
  }
  if (buckets.size)
    yield insert(
      "ingestion_buckets",
      [
        "site_id",
        "hour",
        "queued",
        "stored",
        "last_queued_at",
        "last_stored_at",
      ],
      [...buckets].map(([hour, { count, last }]) => [
        siteId,
        hour,
        count,
        count,
        last,
        last,
      ]),
    );
  if (publicDashboard || demo)
    yield insert(
      "site_public_shares",
      [
        "site_id",
        "public_id",
        "enabled",
        "events",
        "visitors",
        "revenue",
        "conversions",
      ],
      [[siteId, siteId, 1, 1, 1, 1, 1]],
    );
}

function wrangler(args) {
  const result = spawnSync(
    process.execPath,
    [
      fileURLToPath(
        new URL(
          "bin/wrangler.js",
          import.meta.resolve("wrangler/package.json"),
        ),
      ),
      ...args,
      "--config",
      join(root, "wrangler.jsonc"),
    ],
    { cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
  );
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw new Error(result.stderr || result.stdout || "Wrangler failed");
  return result.stdout;
}
const query = (sql) =>
  JSON.parse(
    wrangler(["d1", "execute", "DB", "--local", "--command", sql, "--json"]),
  )[0].results;

/** Match local Worker configuration, with explicit environment values taking precedence. */
export function seedDatabaseConfig(local = {}, environment = process.env) {
  const provider =
    environment.DATABASE_PROVIDER ?? local.DATABASE_PROVIDER ?? "d1";
  if (provider === "d1") return { provider };
  if (provider !== "postgres")
    throw new Error("Invalid DATABASE_PROVIDER; expected d1 or postgres.");
  const connectionString = environment.DATABASE_URL ?? local.DATABASE_URL;
  if (!connectionString)
    throw new Error(
      "Set a local DATABASE_URL or run npm run db:setup:postgres first.",
    );
  const url = new URL(connectionString);
  if (!["postgres:", "postgresql:"].includes(url.protocol))
    throw new Error("DATABASE_URL must be a Postgres URL.");
  // Check the driver's effective host too: query parameters can override the URL host.
  const client = new pg.Client({ connectionString });
  if (
    ![url.hostname, client.connectionParameters.host].every((host) =>
      ["localhost", "127.0.0.1", "::1", "[::1]"].includes(host),
    )
  )
    throw new Error(
      "Seeding is local-only; DATABASE_URL must point to localhost.",
    );
  return { provider, connectionString };
}

export async function seedPostgres(pool, options) {
  const client = await pool.connect();
  const siteId = randomUUID();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL standard_conforming_strings = on");
    const { rows: owners } = await client.query(
      'SELECT u.id,w.id AS workspace_id FROM "user" u JOIN workspaces w ON w.owner_user_id=u.id LIMIT 2',
    );
    if (owners.length !== 1)
      throw new Error(
        "Create your local owner account at http://localhost:8790/setup before seeding.",
      );
    // Stream bounded batches through the real event triggers. A failed import
    // rolls back the site, its definitions, events, payments, and summaries together.
    for (const statement of generateSeed({
      ...options,
      siteId,
      ownerId: owners[0].id,
      workspaceId: owners[0].workspace_id,
    }))
      await client.query(statement);
    const {
      rows: [counts],
    } = await client.query(
      `SELECT
      (SELECT count(*)::int FROM events WHERE site_id=$1) AS events,
      (SELECT count(*)::int FROM payments WHERE site_id=$1) AS payments`,
      [siteId],
    );
    await client.query("COMMIT");
    return { siteId, ...counts };
  } catch (error) {
    await client.query("ROLLBACK");
    throw new Error(
      `${error.message}\nPostgres seed rolled back; no partial demo site was kept.`,
      { cause: error },
    );
  } finally {
    client.release();
  }
}

async function printResult(options, { siteId, events, payments }) {
  if (options.public || options.demo)
    console.log(`Public dashboard: http://localhost:8790/share/${siteId}`);
  if (options.demo) {
    const file = join(root, ".dev.vars");
    const previous = await readFile(file, "utf8").catch((error) => {
      if (error.code === "ENOENT") return "";
      throw error;
    });
    const next = previous.replace(/^YAAP_DEMO_SITE_ID=.*\n?/gm, "");
    await writeFile(file, `${next.trimEnd()}\nYAAP_DEMO_SITE_ID=${siteId}\n`, {
      mode: 0o600,
    });
    console.log(
      "Demo configured locally. Restart the dev server, then open /demo. The existing hourly Worker schedule refreshes synthetic traffic in deployed environments.",
    );
  }
  console.log(
    `Created ${options.name}: ${events.toLocaleString()} events, ${payments.toLocaleString()} payments, 3 goals, 2 funnels.\nhttp://localhost:8790/app/${siteId}/overview?days=30\nAd campaign revenue: http://localhost:8790/app/${siteId}/revenue?days=30\nLive activity expires after five minutes; rerun to create another fresh demo site.`,
  );
}

async function main() {
  const options = optionsFromArgs(process.argv.slice(2));
  if (options.help) {
    console.log(
      "Usage: npm run db:seed -- [--sessions 100000] [--days 180] [--seed 42] [--name 'Atlas Demo'] [--origin https://atlas-demo.example]\nCreates a NEW site for the existing owner in the local backend selected by DATABASE_PROVIDER (D1 by default). Reads .dev.vars, with environment overrides. For Postgres, DATABASE_URL must point to localhost. Apply that backend's migrations first. Never seeds a remote database.",
    );
    return;
  }
  if (options.output) {
    if (!options["owner-id"] || !options["workspace-id"])
      throw new Error(
        "SQL export requires --owner-id and --workspace-id for the target installation.",
      );
    const siteId = randomUUID();
    const file = await open(options.output, "wx");
    try {
      for (const statement of generateSeed({
        ...options,
        siteId,
        ownerId: options["owner-id"],
        workspaceId: options["workspace-id"],
      }))
        await file.write(statement);
    } finally {
      await file.close();
    }
    console.log(
      `Wrote synthetic seed SQL to ${options.output}. No database was changed.\nSite ID: ${siteId}\n${options.public || options.demo ? `Public URL after import: /share/${siteId}\n` : ""}${options.demo ? `Set YAAP_DEMO_SITE_ID=${siteId} on the existing Worker after import.` : ""}`,
    );
    return;
  }
  const local = await readFile(join(root, ".dev.vars"), "utf8")
    .then(parseEnv)
    .catch((error) => {
      if (error.code === "ENOENT") return {};
      throw error;
    });
  const config = seedDatabaseConfig(local);
  if (config.provider === "postgres") {
    const pool = new pg.Pool({
      connectionString: config.connectionString,
      max: 1,
      connectionTimeoutMillis: 10000,
    });
    try {
      console.log(
        `Generating and importing ${options.sessions.toLocaleString()} visits over ${options.days} days into local Postgres for ${options.name}…`,
      );
      await printResult(options, await seedPostgres(pool, options));
    } finally {
      await pool.end();
    }
    return;
  }
  const owners = query(
    "SELECT user.id,workspaces.id AS workspace_id FROM user JOIN workspaces ON workspaces.owner_user_id=user.id LIMIT 2",
  );
  if (owners.length !== 1)
    throw new Error(
      "Create your local owner account at http://localhost:8790/setup before seeding.",
    );
  const siteId = randomUUID();
  const dir = await mkdtemp(join(tmpdir(), "os-analytics-seed-"));
  const file = join(dir, "seed.sql");
  console.log(
    `Generating ${options.sessions.toLocaleString()} visits over ${options.days} days for ${options.name}…`,
  );
  const output = await open(file, "w");
  try {
    for (const sql of generateSeed({
      ...options,
      siteId,
      ownerId: owners[0].id,
      workspaceId: owners[0].workspace_id,
    }))
      await output.write(sql);
  } finally {
    await output.close();
  }
  console.log("Importing into local D1 (large seeds may take a minute)…");
  try {
    wrangler(["d1", "execute", "DB", "--local", "--file", file, "--json"]);
    const counts = query(
      `SELECT (SELECT count(*) FROM events WHERE site_id=${quote(siteId)}) AS events, (SELECT count(*) FROM payments WHERE site_id=${quote(siteId)}) AS payments`,
    )[0];
    await printResult(options, { siteId, ...counts });
    await rm(dir, { recursive: true, force: true });
  } catch (error) {
    throw new Error(
      `${error.message}\nSeed SQL retained at ${file}. A partial site may exist with ID ${siteId}; inspect before retrying.`,
    );
  }
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch((error) => {
    console.error(`Seed failed: ${error.message}`);
    process.exitCode = 1;
  });
}
