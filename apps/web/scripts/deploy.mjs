import { fileURLToPath } from "node:url";
import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import pg from "pg";
import { migratePostgres } from "./migrate-postgres.mjs";

const config = JSON.parse(
  await readFile("dist/server/wrangler.json", "utf8").catch((error) => {
    if (error.code === "ENOENT")
      throw new Error(
        "Build output is missing. Run npm run build from the repository root before npm run deploy.",
      );
    throw error;
  }),
);
const provider = config.vars?.DATABASE_PROVIDER ?? "d1";
const wrangler = (...args) =>
  execFileSync(
    process.execPath,
    [
      fileURLToPath(
        new URL(
          "bin/wrangler.js",
          import.meta.resolve("wrangler/package.json"),
        ),
      ),
      ...args,
    ],
    { stdio: "inherit" },
  );
if (provider === "d1") {
  if (!config.d1_databases?.some((db) => db.binding === "DB"))
    throw new Error("D1 deployment requires DB");
  const database = config.d1_databases.find((db) => db.binding === "DB");
  if (
    !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(
      database.database_id ?? "",
    )
  )
    throw new Error(
      "DB must be provisioned before migration. Use Deploy to Cloudflare or set database_id in the root wrangler.jsonc, then rebuild.",
    );
  wrangler(
    "d1",
    "migrations",
    "apply",
    "DB",
    "--remote",
    "--config",
    "dist/server/wrangler.json",
  );
} else if (provider === "postgres") {
  if (
    !config.hyperdrive?.some(
      (db) => db.binding === "HYPERDRIVE" && /^[a-f0-9]{32}$/i.test(db.id),
    )
  )
    throw new Error(
      "Postgres deployment requires a configured HYPERDRIVE binding",
    );
  if (!process.env.DATABASE_URL)
    throw new Error(
      "Set the production DATABASE_URL build secret to apply Postgres migrations",
    );
  const url = new URL(process.env.DATABASE_URL);
  if (["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))
    throw new Error("Refusing to deploy using a local migration database");
  const pool = new pg.Pool({ connectionString: url.href, max: 1 });
  try {
    await migratePostgres(pool);
  } finally {
    await pool.end();
  }
} else {
  throw new Error("Invalid DATABASE_PROVIDER; deployment stopped");
}
wrangler("deploy", "--config", "dist/server/wrangler.json");
