import { DatabaseSync } from "node:sqlite";
import { readdir, mkdtemp, rm } from "node:fs/promises";
import { resolve, join } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { build } from "esbuild";

const { values } = parseArgs({
  options: { database: { type: "string" }, help: { type: "boolean" } },
});
if (values.help) {
  console.log(
    "node scripts/rollup-local.mjs [--database local.sqlite]\nBackfills complete UTC days in local D1. Run local migrations first. Never connects to Cloudflare.",
  );
  process.exit(0);
}
const directory = ".wrangler/state/v3/d1/miniflare-D1DatabaseObject";
let database = values.database;
if (!database) {
  const files = (await readdir(directory)).filter((file) =>
    file.endsWith(".sqlite"),
  );
  const candidates = files.filter((file) => {
    const probe = new DatabaseSync(join(directory, file), { readOnly: true });
    try {
      return !!probe
        .prepare("select name from sqlite_master where name='daily_traffic'")
        .get();
    } finally {
      probe.close();
    }
  });
  if (candidates.length !== 1)
    throw new Error(
      "Expected one migrated analytics database. Apply local migrations or pass --database.",
    );
  database = join(directory, candidates[0]);
}
const probe = new DatabaseSync(resolve(database), { readOnly: true });
try {
  if (
    !probe
      .prepare("select name from sqlite_master where name='rollup_pending'")
      .get()
  )
    throw new Error("Apply all local migrations before backfilling rollups.");
} finally {
  probe.close();
}
const sqlite = new DatabaseSync(resolve(database), { readOnly: false });
sqlite.exec("PRAGMA busy_timeout=10000; PRAGMA foreign_keys=ON");
const temporary = await mkdtemp(join(tmpdir(), "yaap-rollups-"));
try {
  await build({
    entryPoints: ["src/server/rollups.ts"],
    outfile: join(temporary, "rollups.mjs"),
    bundle: true,
    platform: "node",
    banner: {
      js: 'import { createRequire } from "node:module"; const require = createRequire(import.meta.url);',
    },
    format: "esm",
  });
  const { refreshRollups } = await import(
    pathToFileURL(join(temporary, "rollups.mjs"))
  );
  const DB = {
    prepare(sql) {
      let params = [];
      return {
        bind(...values) {
          params = values;
          return this;
        },
        async all() {
          return { success: true, results: sqlite.prepare(sql).all(...params) };
        },
        async raw() {
          return sqlite
            .prepare(sql)
            .all(...params)
            .map(Object.values);
        },
        async run() {
          const result = sqlite.prepare(sql).run(...params);
          return {
            success: true,
            meta: { changes: Number(result.changes) },
            results: [],
          };
        },
      };
    },
    async batch(statements) {
      sqlite.exec("BEGIN IMMEDIATE");
      try {
        const results = [];
        for (const statement of statements) results.push(await statement.run());
        sqlite.exec("COMMIT");
        return results;
      } catch (error) {
        sqlite.exec("ROLLBACK");
        throw error;
      }
    },
  };
  let total = 0,
    count;
  const started = performance.now();
  do {
    count = await refreshRollups({ DB });
    total += count;
    if (count) console.log(`Built ${total} daily rollups`);
  } while (count);
  console.log(
    `Complete: ${total} days in ${((performance.now() - started) / 1000).toFixed(1)}s. Raw events unchanged.`,
  );
} finally {
  sqlite.close();
  await rm(temporary, { recursive: true, force: true });
}
