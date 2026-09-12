import { drizzle as d1Drizzle } from "drizzle-orm/d1";
import { drizzle as pgDrizzle } from "drizzle-orm/node-postgres";
import * as authSchema from "./auth-schema";
import * as pgAuthSchema from "./postgres/auth-schema";
import { createStore, type Store } from "./store";
import {
  createExecutor,
  databaseProvider,
  postgresPool,
  type DatabaseEnv,
} from "./executor";
import type { Pool } from "pg";

const scopes = new WeakMap<DatabaseEnv, { store: Store; pool?: Pool }>();
export function createDb(env: DatabaseEnv): Store {
  const scoped = scopes.get(env);
  if (scoped) return scoped.store;
  if (databaseProvider(env) === "postgres")
    throw new Error("Postgres operations require withDatabase scope");
  return createStore(createExecutor(env));
}
export function authDatabase(env: DatabaseEnv) {
  if (databaseProvider(env) === "postgres") {
    const pool = scopes.get(env)?.pool;
    if (!pool)
      throw new Error("Postgres authentication requires withDatabase scope");
    return {
      db: pgDrizzle(pool, { schema: pgAuthSchema }),
      schema: pgAuthSchema,
      provider: "pg" as const,
      transaction: true,
    };
  }
  if (!env.DB) throw new Error("D1 requires the DB binding");
  return {
    db: d1Drizzle(env.DB, { schema: authSchema }),
    schema: authSchema,
    provider: "sqlite" as const,
    transaction: false,
  };
}
/** Isolate connections to one HTTP, queue, or scheduled invocation. */
export async function withDatabase<T extends DatabaseEnv, R>(
  env: T,
  work: (env: T) => Promise<R>,
): Promise<R> {
  const scopedEnv = { ...env };
  const pool =
    databaseProvider(env) === "postgres" ? postgresPool(env) : undefined;
  const store = createStore(createExecutor(env, pool));
  scopes.set(scopedEnv, { store, pool });
  try {
    return await work(scopedEnv);
  } finally {
    scopes.delete(scopedEnv);
    await store.close();
  }
}
