import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parseEnv } from "node:util";
import { unstable_readConfig } from "wrangler";
import {
  configureDeploymentDatabase,
  configureHomepageBotTracking,
  configureDeploymentPlacement,
} from "./deployment-config.mjs";

const read = async (path) => JSON.parse(await readFile(path, "utf8"));
const source = unstable_readConfig({ config: "../../wrangler.jsonc" });
configureDeploymentDatabase(source, process.env.YAAP_HYPERDRIVE_ID);
configureHomepageBotTracking(source, process.env.YAAP_SELF_TRACKING_SITE_ID);
configureDeploymentPlacement(source, process.env.YAAP_PLACEMENT_REGION);
const built = await read("dist/server/wrangler.json");
const pkg = await read("../../package.json");
const webPkg = await read("package.json");
const tracker = await readFile(
  new URL(import.meta.resolve("@yaap/client/script.js")),
);
for (const path of ["public/script.js", "dist/client/script.js"])
  assert.deepEqual(
    await readFile(path),
    tracker,
    `${path}: must use the workspace client build`,
  );
function validate(config, label) {
  assert.equal(
    config.keep_vars,
    true,
    `${label}: dashboard runtime variables must survive deploys`,
  );
  const provider = config.vars?.DATABASE_PROVIDER ?? "d1";
  assert.ok(
    ["d1", "postgres"].includes(provider),
    `${label}: valid database provider required`,
  );
  if (provider === "postgres") {
    const connections = config.hyperdrive?.filter(
      (item) => item.binding === "HYPERDRIVE",
    );
    assert.equal(
      connections?.length,
      1,
      `${label}: one HYPERDRIVE binding required`,
    );
    assert.match(
      connections[0].id,
      /^[a-f0-9]{32}$/i,
      `${label}: configured Hyperdrive ID required`,
    );
    assert.ok(
      !config.vars?.DATABASE_URL,
      `${label}: database credentials belong in secrets`,
    );
  } else {
    const db = config.d1_databases?.filter((item) => item.binding === "DB");
    assert.equal(db?.length, 1, `${label}: one DB binding required`);
    assert.ok(db[0].database_name, `${label}: database needs a default name`);
  }
  const producers = config.queues?.producers ?? [];
  const queue = producers.find((item) => item.binding === "EVENTS")?.queue;
  const dlq = producers.find((item) => item.binding === "EVENTS_DLQ")?.queue;
  assert.ok(
    queue && dlq && queue !== dlq,
    `${label}: distinct main/dead-letter queues required`,
  );
  const consumers = config.queues?.consumers ?? [];
  assert.equal(consumers.length, 1, `${label}: exactly one push consumer`);
  assert.equal(
    consumers[0].queue,
    queue,
    `${label}: consumer name must match EVENTS`,
  );
  assert.equal(
    consumers[0].dead_letter_queue,
    dlq,
    `${label}: dead-letter name must match EVENTS_DLQ`,
  );
  assert.ok(consumers[0].max_retries > 0, `${label}: retries required`);
  assert.ok(
    config.triggers?.crons?.length,
    `${label}: retention cron required`,
  );
  assert.ok(
    config.triggers.crons.includes("* * * * *"),
    `${label}: billing outbox repair cron required`,
  );
  assert.ok(
    config.triggers.crons.includes("17 * * * *"),
    `${label}: hourly maintenance cron required`,
  );
  assert.equal(
    config.observability?.enabled,
    true,
    `${label}: logging required`,
  );
  assert.equal(config.assets?.binding, "ASSETS");
  const email = config.send_email ?? [];
  assert.ok(email.length <= 1, `${label}: at most one optional EMAIL binding`);
  if (email.length) {
    assert.equal(email[0].name, "EMAIL");
    assert.ok(!email[0].remote, `${label}: local email must be simulated`);
  }
  for (const route of [
    "/api/*",
    "/payments/*",
    "/ingest",
    "/bot-traffic",
    "/health",
    "/mcp",
    "/oauth/*",
    "/.well-known/*",
    "/mcp/server-card",
    "/robots.txt",
    "/sitemap.xml",
    "/llms.txt",
    "/*.md",
    "/docs/api.md",
  ])
    assert.ok(
      config.assets.run_worker_first.includes(route),
      `${label}: ${route} must reach Worker`,
    );
  assert.ok(config.compatibility_flags.includes("nodejs_compat"));
  const hostingMode = config.vars?.YAAP_HOSTING_MODE ?? "self_hosted";
  assert.ok(
    ["self_hosted", "hosted"].includes(hostingMode),
    `${label}: valid hosting mode required`,
  );
}
validate(source, "source");
validate(built, "build");
assert.deepEqual(
  built.placement,
  source.placement,
  "build must preserve the selected Worker placement",
);
assert.equal(built.keep_vars, source.keep_vars);
assert.deepEqual(
  built.send_email ?? [],
  source.send_email ?? [],
  "build must preserve email wiring",
);
assert.deepEqual(
  built.queues,
  source.queues,
  "build must preserve queue wiring",
);
assert.equal(built.vars?.DATABASE_PROVIDER, source.vars?.DATABASE_PROVIDER);
assert.deepEqual(built.hyperdrive ?? [], source.hyperdrive ?? []);
assert.equal(
  built.d1_databases?.[0]?.database_name,
  source.d1_databases?.[0]?.database_name,
);
assert.match(
  pkg.scripts["db:migrate:remote"],
  /migrations apply DB --remote --config wrangler\.jsonc$/,
);
assert.equal(pkg.scripts.deploy, "cd apps/web && node scripts/deploy.mjs");
assert.match(
  webPkg.scripts.deploy,
  /npm run build && node scripts\/deploy\.mjs$/,
);
assert.ok(
  pkg.scripts.build,
  "Deploy button must detect a separate build command",
);
for (const binding of [
  "DB",
  "EVENTS",
  "EVENTS_DLQ",
  "BETTER_AUTH_SECRET",
  "BOOTSTRAP_SECRET",
])
  assert.ok(
    pkg.cloudflare.bindings[binding]?.description,
    `${binding}: deployment description required`,
  );
const example = await readFile("../../.dev.vars.example", "utf8");
for (const key of ["BETTER_AUTH_SECRET", "BOOTSTRAP_SECRET"])
  assert.match(
    example,
    new RegExp(`^${key}=\\s*$`, "m"),
    `${key}: declare an empty secret input`,
  );
assert.deepEqual(
  Object.keys(parseEnv(example)).sort(),
  ["BETTER_AUTH_SECRET", "BOOTSTRAP_SECRET"].sort(),
  "Default installation should only prompt for the two owner secrets",
);
assert.deepEqual(
  built.secrets,
  source.secrets,
  "build must preserve required secrets",
);
assert.deepEqual(source.secrets.required, [
  "BETTER_AUTH_SECRET",
  "BOOTSTRAP_SECRET",
]);
assert.equal(
  built.name,
  source.name,
  "build must preserve the chosen Worker name",
);
assert.deepEqual(
  built.vars,
  source.vars ?? {},
  "build must preserve runtime configuration",
);
assert.equal(
  built.d1_databases?.[0]?.database_id,
  source.d1_databases?.[0]?.database_id,
);
if ((source.vars?.DATABASE_PROVIDER ?? "d1") === "d1")
  assert.equal(
    resolve("dist/server", built.d1_databases[0].migrations_dir),
    resolve("../..", source.d1_databases[0].migrations_dir),
    "built migrations must resolve to the template's migration directory",
  );
const readme = await readFile("../../README.md", "utf8");
assert.ok(
  readme.includes(
    "https://deploy.workers.cloudflare.com/?url=https://github.com/dagurleo/yaap",
  ),
);
console.log(
  "Deployment configuration verified locally. Live provisioning remains untested.",
);
