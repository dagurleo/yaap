import { sql, type SQL } from "drizzle-orm";
import { SQLiteAsyncDialect } from "drizzle-orm/sqlite-core";
import { PgDialect } from "drizzle-orm/pg-core";
import { Pool, types } from "pg";
import type { Env } from "../types";

export type DatabaseEnv = Pick<
  Env,
  "DB" | "DATABASE_PROVIDER" | "DATABASE_URL" | "HYPERDRIVE"
>;
export function databaseProvider(env: DatabaseEnv) {
  const provider = env.DATABASE_PROVIDER ?? "d1";
  if (provider !== "d1" && provider !== "postgres")
    throw new Error("Invalid DATABASE_PROVIDER");
  return provider;
}
export interface ReadQuery<T> {
  sql: SQL;
  readonly result?: T;
}
type BatchRows<Q extends readonly ReadQuery<unknown>[]> = {
  [K in keyof Q]: Q[K] extends ReadQuery<infer T> ? T[] : never;
};
export interface Executor {
  readonly provider: "d1" | "postgres";
  all<T>(query: SQL): Promise<T[]>;
  run(query: SQL): Promise<void>;
  query<T>(query: SQL): ReadQuery<T>;
  /** Read a group of panels from one consistent database snapshot. */
  batch<const Q extends readonly ReadQuery<unknown>[]>(
    queries: Q,
  ): Promise<BatchRows<Q>>;
  /** All statements commit together or roll back together. */
  atomic(queries: SQL[]): Promise<void>;
  close(): Promise<void>;
}
function safeNumber(value: string) {
  const number = Number(value);
  if (
    !Number.isFinite(number) ||
    (Number.isInteger(number) && !Number.isSafeInteger(number))
  )
    throw new Error("Database numeric result exceeds JavaScript precision");
  return number;
}
export function postgresPool(env: DatabaseEnv) {
  const connectionString = env.HYPERDRIVE?.connectionString ?? env.DATABASE_URL;
  if (!connectionString)
    throw new Error("Postgres requires HYPERDRIVE or a local DATABASE_URL");
  if (!env.HYPERDRIVE) {
    const url = new URL(connectionString);
    const loopback = ["localhost", "127.0.0.1", "::1", "[::1]"];
    // node-postgres lets a query parameter override the URL's hostname.
    if (
      !["postgres:", "postgresql:"].includes(url.protocol) ||
      !loopback.includes(url.hostname) ||
      url.searchParams
        .getAll("host")
        .some((host) => host && !loopback.includes(host))
    )
      throw new Error("Use HYPERDRIVE for remote Postgres connections");
  }
  // One pool per Worker invocation; Hyperdrive owns pooling across requests.
  return new Pool({
    connectionString,
    max: 3,
    connectionTimeoutMillis: 10_000,
    application_name: "yaap",
    // Direct connections include auth queries. Hyperdrive transaction settings
    // are set explicitly below because origin sessions are transaction-pooled.
    ...(!env.HYPERDRIVE
      ? {
          statement_timeout: 15_000,
          lock_timeout: 3_000,
          idle_in_transaction_session_timeout: 10_000,
        }
      : {}),
    types: {
      getTypeParser(oid, format) {
        if (format !== "binary" && [20, 1700].includes(oid)) return safeNumber;
        // Reports share the same JSON text contract as SQLite.
        if (format !== "binary" && [114, 3802].includes(oid))
          return (value: string) => value;
        return types.getTypeParser(oid, format);
      },
    },
  });
}
export function createExecutor(env: DatabaseEnv, pool?: Pool): Executor {
  if (databaseProvider(env) === "d1") {
    if (!env.DB) throw new Error("D1 requires the DB binding");
    const binding = env.DB,
      dialect = new SQLiteAsyncDialect();
    const prepare = (query: SQL) => {
      const q = dialect.sqlToQuery(query);
      return binding.prepare(q.sql).bind(...q.params);
    };
    return {
      provider: "d1",
      query<T>(query: SQL): ReadQuery<T> {
        return { sql: query };
      },
      async batch<Q extends readonly ReadQuery<unknown>[]>(queries: Q) {
        const rows = await binding.batch(
          queries.map((query) => prepare(query.sql)),
        );
        return rows.map((row) => row.results) as BatchRows<Q>;
      },
      async all<T>(query: SQL) {
        return (await prepare(query).all<T>()).results;
      },
      async run(query) {
        await prepare(query).run();
      },
      async atomic(queries) {
        if (queries.length) await binding.batch(queries.map(prepare));
      },
      async close() {},
    };
  }
  const client = pool ?? postgresPool(env),
    dialect = new PgDialect();
  const compile = (query: SQL) => {
    const q = dialect.sqlToQuery(query);
    return { text: q.sql, values: q.params };
  };
  async function transaction<T>(
    work: (connection: import("pg").PoolClient) => Promise<T>,
    readOnly = false,
  ): Promise<T> {
    const connection = await client.connect();
    let discard = false;
    try {
      await connection.query(`${readOnly ? "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY" : "BEGIN"};
        SET LOCAL statement_timeout = '15s'; SET LOCAL lock_timeout = '3s';
        SET LOCAL idle_in_transaction_session_timeout = '10s'; SET LOCAL application_name = 'yaap';`);
      const result = await work(connection);
      await connection.query("COMMIT");
      return result;
    } catch (error) {
      try {
        await connection.query("ROLLBACK");
      } catch {
        discard = true;
      }
      throw error;
    } finally {
      connection.release(discard);
    }
  }
  return {
    provider: "postgres",
    query<T>(query: SQL): ReadQuery<T> {
      return { sql: query };
    },
    async batch<Q extends readonly ReadQuery<unknown>[]>(queries: Q) {
      return transaction(async (connection) => {
        const rows = [];
        for (const query of queries)
          rows.push((await connection.query(compile(query.sql))).rows);
        return rows as BatchRows<Q>;
      }, true);
    },
    async all<T>(query: SQL) {
      return transaction(
        async (connection) =>
          (await connection.query(compile(query))).rows as T[],
      );
    },
    async run(query) {
      await transaction(async (connection) => {
        await connection.query(compile(query));
      });
    },
    async atomic(queries) {
      if (!queries.length) return;
      await transaction(async (connection) => {
        for (const query of queries) await connection.query(compile(query));
      });
    },
    async close() {
      await client.end();
    },
  };
}

/** SQL syntax differences are explicit here, never rewritten in SQL strings. */
export function expressions(provider: Executor["provider"]) {
  const pg = provider === "postgres";
  return {
    least: (a: SQL, b: SQL) =>
      pg ? sql`least(${a},${b})` : sql`min(${a},${b})`,
    greatest: (a: SQL, b: SQL) =>
      pg ? sql`greatest(${a},${b})` : sql`max(${a},${b})`,
    date: (value: SQL) =>
      pg
        ? sql`to_char(to_timestamp(${value}/1000.0) at time zone 'UTC','YYYY-MM-DD')`
        : sql`date(${value}/1000,'unixepoch')`,
    jsonArray: (args: SQL) =>
      pg ? sql`jsonb_build_array(${args})::text` : sql`json_array(${args})`,
    jsonObject: (args: SQL) =>
      pg ? sql`jsonb_build_object(${args})` : sql`json_object(${args})`,
    jsonGroupArray: (value: SQL) =>
      pg
        ? sql`coalesce(jsonb_agg(${value}), '[]'::jsonb)`
        : sql`json_group_array(${value})`,
    json: (value: SQL) => (pg ? sql`(${value})::jsonb` : sql`json(${value})`),
    jsonExtract: (value: SQL, index: number) =>
      pg
        ? sql`(${value}::jsonb ->> ${sql.raw(String(index))})`
        : sql`json_extract(${value},${`$[${index}]`})`,
  };
}
