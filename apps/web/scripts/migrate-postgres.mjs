import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { parseEnv } from "node:util";
import { pathToFileURL } from "node:url";
import pg from "pg";

export function migrationConnectionString(connectionString) {
  const url = new URL(connectionString);
  if (url.searchParams.get("sslrootcert") !== "system") return connectionString;

  // PlanetScale's libpq URLs use "system" as a trust-store keyword, but pg
  // reads it as a filename. Use Node's trusted CAs and verify the hostname.
  url.searchParams.delete("sslrootcert");
  url.searchParams.set("sslmode", "verify-full");
  return url.href;
}

export async function migratePostgres(pool) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(736492810)");
    await client.query(
      "CREATE TABLE IF NOT EXISTS yaap_migrations (name text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())",
    );
    const files = (
      await readdir(new URL("../migrations/postgres/", import.meta.url))
    )
      .filter((f) => f.endsWith(".sql"))
      .sort();
    for (const name of files) {
      const text = await readFile(
        new URL(`../migrations/postgres/${name}`, import.meta.url),
        "utf8",
      );
      const checksum = createHash("sha256").update(text).digest("hex");
      const { rows } = await client.query(
        "SELECT checksum FROM yaap_migrations WHERE name=$1",
        [name],
      );
      if (rows.length) {
        if (rows[0].checksum !== checksum)
          throw new Error(`Applied migration was edited: ${name}`);
        continue;
      }
      await client.query(text);
      await client.query(
        "INSERT INTO yaap_migrations(name,checksum) VALUES($1,$2)",
        [name, checksum],
      );
      console.log(`Applied ${name}`);
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const local = await readFile(".dev.vars", "utf8")
    .then(parseEnv)
    .catch((error) => {
      if (error.code === "ENOENT") return {};
      throw error;
    });
  const connectionString = process.env.DATABASE_URL ?? local.DATABASE_URL;
  if (!connectionString)
    throw new Error("Set DATABASE_URL for the Postgres database to migrate");
  const pool = new pg.Pool({
    connectionString: migrationConnectionString(connectionString),
    max: 1,
  });
  try {
    await migratePostgres(pool);
    console.log("Postgres migrations are up to date.");
  } finally {
    await pool.end();
  }
}
