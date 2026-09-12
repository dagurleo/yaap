import { randomUUID } from "node:crypto";
import { userInfo } from "node:os";
import pg from "pg";
import { migratePostgres } from "../../scripts/migrate-postgres.mjs";

// Each run owns a newly created database. Never truncate or reuse developer data.
export async function postgresFixture() {
  const url = new URL(
    process.env.PG_TEST_URL ??
      `postgresql://${userInfo().username}@127.0.0.1:5432/postgres`,
  );
  const loopback = ["localhost", "127.0.0.1", "::1", "[::1]"];
  if (
    !["postgres:", "postgresql:"].includes(url.protocol) ||
    !loopback.includes(url.hostname) ||
    url.searchParams
      .getAll("host")
      .some((host) => host && !loopback.includes(host))
  )
    throw new Error("PG_TEST_URL must point at local Postgres");
  const admin = new pg.Pool({ connectionString: url.href });
  const name = `yaap_test_${randomUUID().replaceAll("-", "")}`;
  await admin.query(`CREATE DATABASE "${name}"`);
  url.pathname = "/" + name;
  // Hyperdrive requires a password even when local Postgres uses trust auth.
  if (!url.password) url.password = "local-test-only";
  const pool = new pg.Pool({
    connectionString: url.href,
    types: {
      getTypeParser(oid, format) {
        return [20, 1700].includes(oid)
          ? Number
          : pg.types.getTypeParser(oid, format);
      },
    },
  });
  const close = async () => {
    await pool.end();
    try {
      await admin.query(`DROP DATABASE "${name}" WITH (FORCE)`);
    } finally {
      await admin.end();
    }
  };
  try {
    await migratePostgres(pool);
    await migratePostgres(pool);
  } catch (error) {
    await close();
    throw error;
  }
  const prepare = (text) => {
    let values = [];
    let index = 0;
    const query = text.replace(/'(?:''|[^'])*'|\?/g, (token) =>
      token === "?" ? `$${++index}` : token,
    );
    return {
      bind(...params) {
        values = params;
        return this;
      },
      async run(client = pool) {
        const result = await client.query(query, values);
        return { results: result.rows, meta: { changes: result.rowCount } };
      },
      async all() {
        return this.run();
      },
      async first() {
        return (await this.run()).results[0] ?? null;
      },
    };
  };
  return {
    connectionString: url.href,
    pool,
    close,
    db: {
      prepare,
      async batch(statements) {
        const client = await pool.connect();
        try {
          await client.query("BEGIN");
          const results = [];
          for (const statement of statements)
            results.push(await statement.run(client));
          await client.query("COMMIT");
          return results;
        } catch (error) {
          await client.query("ROLLBACK");
          throw error;
        } finally {
          client.release();
        }
      },
    },
  };
}
