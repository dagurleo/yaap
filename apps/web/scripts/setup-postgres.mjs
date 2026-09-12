import { randomBytes } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { userInfo } from "node:os";
import { parseEnv } from "node:util";
import pg from "pg";
import { migratePostgres } from "./migrate-postgres.mjs";

const adminUrl = new URL(
  process.env.PG_LOCAL_ADMIN_URL ??
    `postgresql://${userInfo().username}@127.0.0.1:5432/postgres`,
);
const loopback = ["localhost", "127.0.0.1", "::1", "[::1]"];
if (
  !["postgres:", "postgresql:"].includes(adminUrl.protocol) ||
  !loopback.includes(adminUrl.hostname) ||
  adminUrl.searchParams
    .getAll("host")
    .some((host) => host && !loopback.includes(host))
)
  throw new Error("Local setup only connects to localhost");
const admin = new pg.Pool({ connectionString: adminUrl.href, max: 1 });
try {
  const { rows } = await admin.query(
    "SELECT 1 FROM pg_database WHERE datname=$1",
    ["yaap_local"],
  );
  if (!rows.length) await admin.query('CREATE DATABASE "yaap_local"');
} finally {
  await admin.end();
}
adminUrl.pathname = "/yaap_local";
const pool = new pg.Pool({ connectionString: adminUrl.href, max: 1 });
try {
  await migratePostgres(pool);
} finally {
  await pool.end();
}
let content = await readFile(".dev.vars", "utf8").catch((error) => {
  if (error.code === "ENOENT") return "";
  throw error;
});
const current = parseEnv(content);
const values = { DATABASE_PROVIDER: "postgres", DATABASE_URL: adminUrl.href };
for (const key of ["BETTER_AUTH_SECRET", "BOOTSTRAP_SECRET"])
  if (!current[key]) values[key] = randomBytes(32).toString("hex");
for (const [key, value] of Object.entries(values)) {
  const line = `${key}=${JSON.stringify(value)}`;
  const pattern = new RegExp(`^${key}=.*$`, "m");
  content = pattern.test(content)
    ? content.replace(pattern, () => line)
    : content.trimEnd() + "\n" + line + "\n";
}
await writeFile(".dev.vars", content, { mode: 0o600 });
console.log(
  "Local Postgres database yaap_local is ready. .dev.vars now selects Postgres; existing auth secrets were preserved.",
);
console.log(
  "Run npm run dev, then open http://localhost:8790/setup. Read BOOTSTRAP_SECRET from .dev.vars to create your owner.",
);
