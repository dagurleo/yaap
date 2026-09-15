import { sql, type SQL } from "drizzle-orm";
import { createDb } from "../db";
import type { Env } from "../types";
import type { Principal } from "./auth";
import {
  ApiError,
  canonical,
  crypt,
  hash,
  str,
  type Input,
  type Result,
} from "./contracts";

export type MutationContext = {
  env: Env;
  principal: Principal;
  operation: string;
  siteId?: string;
  input: Input;
  idempotencyKey?: string;
  ifMatch?: string;
};
export function expectedRevision(ctx: MutationContext, current: string) {
  if (!ctx.ifMatch)
    throw new ApiError(
      428,
      "precondition_required",
      "Read the resource and supply its ETag in If-Match (revision in MCP)",
    );
  if (ctx.ifMatch !== `"${current}"`)
    throw new ApiError(
      412,
      "revision_conflict",
      "Resource changed; read it again before editing",
    );
}
export function guard(id: string, test: SQL) {
  return sql`insert into api_write_guards(id,valid) values(${id},case when ${test} then 1 else 0 end)`;
}
export async function mutate(
  ctx: MutationContext,
  build: () => Promise<{
    statements: SQL[];
    result: Result;
    resourceId?: string;
  }>,
): Promise<Result> {
  const { env, principal: p, operation, siteId, input } = ctx,
    db = createDb(env);
  const create = /^(create_|rotate_|set_stripe|set_polar)/.test(operation);
  if (create && !ctx.idempotencyKey)
    throw new ApiError(
      400,
      "idempotency_required",
      "Supply Idempotency-Key (idempotencyKey in MCP)",
    );
  if (ctx.idempotencyKey !== undefined)
    str({ key: ctx.idempotencyKey }, "key", 128);
  const id = ctx.idempotencyKey
    ? hash(canonical([p.id, operation, siteId, ctx.idempotencyKey]))
    : crypto.randomUUID();
  const fingerprint = hash(canonical([input, ctx.ifMatch]));
  async function replay() {
    const [row] = await db.all<{ fingerprint: string; response: string }>(
      sql`select fingerprint,response from api_idempotency where id=${id} and expires_at>${Date.now()}`,
    );
    if (!row) return null;
    if (row.fingerprint !== fingerprint)
      throw new ApiError(
        409,
        "idempotency_conflict",
        "This idempotency key was used with different input",
      );
    return JSON.parse(await crypt(env, id, row.response, true)) as Result;
  }
  const previous = await replay();
  if (previous) return previous;
  const built = await build();
  const now = Date.now(),
    guardId = crypto.randomUUID();
  const response = await crypt(env, id, JSON.stringify(built.result));
  const statements: SQL[] = [
    sql`delete from api_idempotency where id=${id} and expires_at<=${now}`,
    sql`insert into api_idempotency(id,fingerprint,response,expires_at) values(${id},${fingerprint},${response},${now + 86400000})`,
  ];
  if (p.kind !== "session")
    statements.push(
      guard(
        guardId,
        sql`exists(select 1 from api_credentials where id=${p.id} and revoked_at is null and expires_at>${now})`,
      ),
    );
  statements.push(
    ...built.statements,
    sql`insert into api_audit(id,owner_id,actor_id,site_id,operation,resource_id,fields,created_at) values(${crypto.randomUUID()},${p.ownerId},${p.id},${siteId ?? (operation === "create_site" ? built.resourceId : null)},${operation},${built.resourceId ?? null},${JSON.stringify(Object.keys(input).filter((k) => !["secret", "token"].includes(k)))},${now})`,
    sql`delete from api_write_guards where id=${guardId}`,
  );
  try {
    await db.atomic(statements);
  } catch (error) {
    const existing = await replay();
    if (existing) return existing;
    if (
      error instanceof Error &&
      /api_write_valid|CHECK constraint/.test(error.message)
    )
      throw new ApiError(
        412,
        "revision_conflict",
        "Resource or access changed; read it again",
      );
    if (error instanceof Error && /unique|duplicate key/i.test(error.message))
      throw new ApiError(
        409,
        "conflict",
        "A resource with this definition already exists",
      );
    throw error;
  }
  return built.result;
}
export function conditionalUpdate(
  table: string,
  where: SQL,
  revision: string,
  values: Record<string, unknown>,
) {
  const next = crypto.randomUUID(),
    id = crypto.randomUUID();
  const statements = [
    sql`update ${sql.identifier(table)} set ${sql.join(
      Object.entries({ ...values, revision: next }).map(
        ([k, v]) => sql`${sql.identifier(k)}=${v}`,
      ),
      sql`,`,
    )} where ${where} and revision=${revision}`,
    guard(
      id,
      sql`exists(select 1 from ${sql.identifier(table)} where ${where} and revision=${next})`,
    ),
    sql`delete from api_write_guards where id=${id}`,
  ];
  return { next, statements };
}
