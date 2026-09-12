import { build } from "esbuild";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { parseEnv } from "node:util";
import pg from "pg";

// Direct database access is restricted to localhost by the shared executor.
const local = await readFile(".dev.vars", "utf8")
  .then(parseEnv)
  .catch((error) => {
    if (error.code === "ENOENT") return {};
    throw error;
  });
const DATABASE_URL = process.env.DATABASE_URL ?? local.DATABASE_URL;
if (!DATABASE_URL) throw new Error("Set DATABASE_URL for local Postgres");
const url = new URL(DATABASE_URL);
const client = new pg.Client({ connectionString: DATABASE_URL });
if (
  !["postgres:", "postgresql:"].includes(url.protocol) ||
  ![url.hostname, client.connectionParameters.host].every((host) =>
    ["localhost", "127.0.0.1", "::1", "[::1]"].includes(host),
  )
)
  throw new Error(
    "Rollup backfill is local-only; use a localhost DATABASE_URL",
  );
const directory = await mkdtemp(join(tmpdir(), "yaap-rollups-pg-"));
try {
  await build({
    stdin: {
      contents:
        'export { withDatabase } from "./src/db"; export { refreshRollups } from "./src/server/rollups";',
      resolveDir: process.cwd(),
      loader: "ts",
    },
    outfile: join(directory, "rollups.mjs"),
    bundle: true,
    platform: "node",
    format: "esm",
    banner: {
      js: 'import { createRequire } from "node:module"; const require = createRequire(import.meta.url);',
    },
  });
  const { withDatabase, refreshRollups } = await import(
    pathToFileURL(join(directory, "rollups.mjs"))
  );
  const started = performance.now();
  await withDatabase(
    { DATABASE_PROVIDER: "postgres", DATABASE_URL },
    async (env) => {
      let total = 0,
        count;
      do {
        count = await refreshRollups(env);
        total += count;
        if (count) console.log(`Built ${total} daily rollups`);
      } while (count);
      console.log(
        `Complete: ${total} days in ${((performance.now() - started) / 1000).toFixed(1)}s. Raw events unchanged.`,
      );
    },
  );
} finally {
  await rm(directory, { recursive: true, force: true });
}
