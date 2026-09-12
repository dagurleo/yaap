import { getTableColumns, sql, type SQL } from "drizzle-orm";
import type { SQLiteTable } from "drizzle-orm/sqlite-core";
import * as schema from "./analytics-schema";
import type { AnalyticsEvent } from "../types";
import { expressions, type Executor } from "./executor";

// Schemas supply column codecs only. SQL execution belongs to the selected driver.
// Service methods return decoded application records, never driver result objects.
export function records<T extends SQLiteTable>(
  executor: Executor,
  table: T,
  name: string,
) {
  const columns = getTableColumns(table);
  type Row = T["$inferSelect"];
  type Input = T["$inferInsert"];
  const fields = sql.join(
    Object.entries(columns).map(
      ([key, column]) =>
        sql`${sql.identifier(column.name)} as ${sql.identifier(key)}`,
    ),
    sql`, `,
  );
  const decode = (rows: Record<string, unknown>[]) =>
    rows.map(
      (row) =>
        Object.fromEntries(
          Object.entries(row).map(([key, value]) => [
            key,
            value === null ? null : columns[key].mapFromDriverValue(value),
          ]),
        ) as Row,
    );
  const values = (input: Partial<Input>) =>
    Object.entries(input)
      .filter(([key, value]) => key in columns && value !== undefined)
      .map(([key, value]) => ({
        column: sql.identifier(columns[key].name),
        value: value === null ? null : columns[key].mapToDriverValue(value),
      }));
  return {
    async find(where: SQL = sql`1=1`, suffix: SQL = sql``): Promise<Row[]> {
      return decode(
        await executor.all(
          sql`select ${fields} from ${sql.identifier(name)} where ${where} ${suffix}`,
        ),
      );
    },
    async insert(input: Input, conflict: SQL = sql``): Promise<Row[]> {
      const pairs = values(input);
      return decode(
        await executor.all(
          sql`insert into ${sql.identifier(name)} (${sql.join(
            pairs.map((p) => p.column),
            sql`,`,
          )}) values (${sql.join(
            pairs.map((p) => sql`${p.value}`),
            sql`,`,
          )}) ${conflict} returning ${fields}`,
        ),
      );
    },
    async update(input: Partial<Input>, where: SQL): Promise<Row[]> {
      const pairs = values(input);
      return decode(
        await executor.all(
          sql`update ${sql.identifier(name)} set ${sql.join(
            pairs.map((p) => sql`${p.column}=${p.value}`),
            sql`,`,
          )} where ${where} returning ${fields}`,
        ),
      );
    },
  };
}
export type Site = typeof schema.sites.$inferSelect;
export type Workspace = typeof schema.workspaces.$inferSelect;
export type Goal = typeof schema.goals.$inferSelect;
export type Funnel = typeof schema.funnels.$inferSelect;
export type Integration = typeof schema.paymentIntegrations.$inferSelect;
export type Payment = typeof schema.payments.$inferInsert;
export type Presence = typeof schema.visitorPresence.$inferInsert;
export type IngestionCounter =
  | "queued"
  | "stored"
  | "duplicates"
  | "bots"
  | "enqueueFailures"
  | "writeFailures"
  | "expired";

export function createStore(executor: Executor) {
  const sites = records(executor, schema.sites, "sites");
  const goals = records(executor, schema.goals, "goals");
  const funnels = records(executor, schema.funnels, "funnels");
  const events = records(executor, schema.events, "events");
  const integrations = records(
    executor,
    schema.paymentIntegrations,
    "payment_integrations",
  );
  const buckets = records(
    executor,
    schema.ingestionBuckets,
    "ingestion_buckets",
  );
  const expr = expressions(executor.provider);
  return {
    ...executor,
    expr,
    async ownerExists() {
      return (
        (await executor.all(sql`select id from "user" limit 1`)).length > 0
      );
    },
    async ownershipInitialized() {
      return (
        (await executor.all(sql`select id from workspaces limit 1`)).length > 0
      );
    },
    async workspaceForOwner(ownerUserId: string) {
      return (
        await executor.all<Workspace>(
          sql`select id,owner_user_id as "ownerUserId",created_at as "createdAt",updated_at as "updatedAt" from workspaces where owner_user_id=${ownerUserId} limit 1`,
        )
      )[0];
    },
    async createWorkspace(ownerUserId: string, now = Date.now()) {
      const workspace = {
        id: crypto.randomUUID(),
        ownerUserId,
        createdAt: now,
        updatedAt: now,
      };
      await records(executor, schema.workspaces, "workspaces").insert(
        workspace,
        sql`on conflict(owner_user_id) do nothing`,
      );
      return (
        await executor.all<Workspace>(
          sql`select id,owner_user_id as "ownerUserId",created_at as "createdAt",updated_at as "updatedAt" from workspaces where owner_user_id=${ownerUserId} limit 1`,
        )
      )[0];
    },
    async findSite(id: string, ownerId?: string) {
      return (
        await sites.find(
          sql`id=${id} ${ownerId === undefined ? sql`` : sql`and owner_id=${ownerId}`}`,
          sql`limit 1`,
        )
      )[0];
    },
    listSites(ownerId: string) {
      return sites.find(sql`owner_id=${ownerId}`);
    },
    async createSite(input: typeof schema.sites.$inferInsert) {
      await sites.insert(input);
    },
    async updateSite(
      id: string,
      input: Partial<typeof schema.sites.$inferInsert>,
      ownerId?: string,
    ) {
      return (
        await sites.update(
          { ...input, revision: crypto.randomUUID() },
          sql`id=${id} ${ownerId === undefined ? sql`` : sql`and owner_id=${ownerId}`}`,
        )
      )[0];
    },
    async siteEvents(siteId: string) {
      const rows = await events.find(
        sql`site_id=${siteId}`,
        sql`order by received_at desc limit 20`,
      );
      const [count] = await executor.all<{ total: number }>(
        sql`select count(*) as total from events where site_id=${siteId}`,
      );
      return { events: rows, total: count.total };
    },
    async insertEvent(event: AnalyticsEvent, billingReceiptId?: string) {
      const inserted = await events.insert(
        {
          ...event,
          billingReceiptId,
          trackingVersion: event.version,
          visitorId: event.version === 2 ? (event.visitorId ?? null) : null,
          sessionId: event.version === 2 ? (event.sessionId ?? null) : null,
          referrerHost:
            event.version === 2 ? (event.referrerHost ?? null) : null,
          utmSource: event.version === 2 ? (event.utmSource ?? null) : null,
          utmMedium: event.version === 2 ? (event.utmMedium ?? null) : null,
          utmCampaign: event.version === 2 ? (event.utmCampaign ?? null) : null,
        },
        sql`on conflict(site_id,id) do nothing`,
      );
      return inserted.length > 0;
    },
    async touchPresence(presence: Presence) {
      await records(
        executor,
        schema.visitorPresence,
        "visitor_presence",
      ).insert(
        presence,
        sql`on conflict(site_id,visitor_id) do update set session_id=excluded.session_id,path=excluded.path,received_at=excluded.received_at,country=excluded.country,source=excluded.source where visitor_presence.received_at<=excluded.received_at`,
      );
    },
    async incrementRateLimit(key: string, expiresAt: number) {
      const [row] = await executor.all<{ count: number }>(
        sql`insert into request_limits(key,count,expires_at) values(${key},1,${expiresAt}) on conflict(key) do update set count=request_limits.count+1 returning count`,
      );
      return row.count;
    },
    async recordIngestion(siteId: string, kind: IngestionCounter, now: number) {
      const column = sql.identifier(schema.ingestionBuckets[kind].name),
        hour = Math.floor(now / 3600000) * 3600000;
      const freshnessColumn =
        kind === "queued"
          ? "last_queued_at"
          : kind === "stored"
            ? "last_stored_at"
            : null;
      await executor.run(sql`insert into ingestion_buckets(site_id,hour,${column}${freshnessColumn ? sql`,${sql.identifier(freshnessColumn)}` : sql``})
        values(${siteId},${hour},1${freshnessColumn ? sql`,${now}` : sql``}) on conflict(site_id,hour) do update set ${column}=ingestion_buckets.${column}+1
        ${freshnessColumn ? sql`,${sql.identifier(freshnessColumn)}=${now}` : sql``}`);
    },
    ingestionHours(siteId: string, start: number) {
      return buckets.find(
        sql`site_id=${siteId} and hour>=${start}`,
        sql`order by hour`,
      );
    },
    retentionSites() {
      return sites.find(
        sql`event_retention_days>0 or payment_retention_days>0`,
      );
    },
    listGoals(siteId: string) {
      return goals.find(sql`site_id=${siteId}`, sql`order by name`);
    },
    async createGoal(input: typeof schema.goals.$inferInsert) {
      return (await goals.insert(input, sql`on conflict do nothing`))[0];
    },
    async updateGoal(
      siteId: string,
      id: string,
      values: Partial<typeof schema.goals.$inferInsert>,
    ) {
      return (
        await goals.update(
          { ...values, revision: crypto.randomUUID() },
          sql`site_id=${siteId} and id=${id}`,
        )
      )[0];
    },
    async archiveGoal(siteId: string, id: string, archived: boolean) {
      return (
        await goals.update(
          { archived, revision: crypto.randomUUID() },
          sql`site_id=${siteId} and id=${id}`,
        )
      )[0];
    },
    listFunnels(siteId: string) {
      return funnels.find(sql`site_id=${siteId}`, sql`order by created_at,id`);
    },
    async createFunnel(input: typeof schema.funnels.$inferInsert) {
      return (await funnels.insert(input))[0];
    },
    async updateFunnel(
      siteId: string,
      id: string,
      input: Partial<typeof schema.funnels.$inferInsert>,
    ) {
      return (
        await funnels.update(
          { ...input, revision: crypto.randomUUID() },
          sql`site_id=${siteId} and id=${id}`,
        )
      )[0];
    },
    async paymentIntegration(siteId: string) {
      return (await integrations.find(sql`site_id=${siteId}`))[0];
    },
    async savePaymentIntegration(siteId: string, change: Partial<Integration>) {
      const values = {
        ...change,
        revision: crypto.randomUUID(),
        updatedAt: Date.now(),
      };
      const columns = getTableColumns(schema.paymentIntegrations);
      const updates = sql.join(
        Object.keys(values).map(
          (key) =>
            sql`${sql.identifier(columns[key as keyof typeof columns].name)}=excluded.${sql.identifier(columns[key as keyof typeof columns].name)}`,
        ),
        sql`,`,
      );
      await integrations.insert(
        { siteId, ...values },
        sql`on conflict(site_id) do update set ${updates}`,
      );
    },
    async savePayment(input: Payment) {
      return (
        await records(executor, schema.payments, "payments").insert(
          input,
          sql`on conflict(site_id,provider,mode,external_id) do update set
        refunded_amount=${expr.greatest(sql`payments.refunded_amount`, sql`excluded.refunded_amount`)},
        amount=${input.provider === "stripe" ? expr.greatest(sql`payments.amount`, sql`excluded.amount`) : sql`excluded.amount`},
        visitor_id=coalesce(payments.visitor_id,excluded.visitor_id),updated_at=excluded.updated_at
        where payments.currency=excluded.currency and payments.paid_at=excluded.paid_at
        and (payments.visitor_id is null or excluded.visitor_id is null or payments.visitor_id=excluded.visitor_id)
        ${input.provider === "api" ? sql`and payments.amount=excluded.amount` : sql``}`,
        )
      )[0];
    },
  };
}
export type Store = ReturnType<typeof createStore>;
