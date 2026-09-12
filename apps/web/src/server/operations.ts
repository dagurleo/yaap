import { ownedSite } from "./access";
import { reconcilePaymentAttribution } from "./payment-attribution";
import { sql } from "drizzle-orm";
import { createDb } from "../db";
import {
  validateOperationsSettings,
  type OperationsSettings,
} from "../lib/operations";
import type { Env } from "../types";
const HOUR = 3600000,
  DAY = 24 * HOUR;
export const counterKeys = [
  "queued",
  "stored",
  "duplicates",
  "bots",
  "enqueueFailures",
  "writeFailures",
  "expired",
] as const;
export type IngestionCounter = (typeof counterKeys)[number];
export async function recordIngestion(
  env: Env,
  siteId: string,
  kind: IngestionCounter,
  now = Date.now(),
) {
  try {
    await createDb(env).recordIngestion(siteId, kind, now);
  } catch {
    console.error("ingestion_monitor_write_failed");
  }
}
export function isKnownBot(request: Request) {
  const cf = request.cf as
    { botManagement?: { verifiedBot?: boolean } } | undefined;
  if (cf?.botManagement?.verifiedBot === true) return true;
  return /bot\b|crawler|spider|slurp|headlesschrome|phantomjs|lighthouse|facebookexternalhit|preview|curl\/|wget\/|python-requests|python-urllib|go-http-client/i.test(
    request.headers.get("user-agent") ?? "",
  );
}

export async function siteOperations(
  env: Env,
  ownerId: string,
  siteId: string,
) {
  const { db, site } = await ownedSite(env, ownerId, siteId);
  const now = Date.now(),
    start = Math.floor(now / HOUR) * HOUR - 23 * HOUR;
  const rows = await db.ingestionHours(siteId, start);
  const counters = Object.fromEntries(
    counterKeys.map((key) => [
      key,
      rows.reduce((sum, row) => sum + row[key], 0),
    ]),
  ) as Record<IngestionCounter, number>;
  const [freshness] = await db.all<{
    lastQueuedAt: number | null;
    lastStoredAt: number | null;
  }>(
    sql`select max(last_queued_at) as "lastQueuedAt",max(last_stored_at) as "lastStoredAt" from ingestion_buckets where site_id=${siteId}`,
  );
  return {
    site,
    start,
    asOf: now,
    counters,
    ...freshness,
    hours: Array.from({ length: 24 }, (_, i) => {
      const hour = start + i * HOUR;
      const row = rows.find((r) => r.hour === hour);
      return {
        hour,
        ...(Object.fromEntries(
          counterKeys.map((k) => [k, row?.[k] ?? 0]),
        ) as Record<IngestionCounter, number>),
      };
    }),
  };
}
export async function saveOperationsSettings(
  env: Env,
  ownerId: string,
  siteId: string,
  input: OperationsSettings,
) {
  const settings = validateOperationsSettings(input);
  const { db } = await ownedSite(env, ownerId, siteId);
  const site = await db.updateSite(siteId, settings);
  return site;
}
export async function cleanup(env: Env, now = Date.now()) {
  const db = createDb(env);
  await reconcilePaymentAttribution(env, {}, now);
  // Bounded per-site batches avoid an unbounded cron. Large backlogs drain on subsequent runs.
  const configured = await db.retentionSites();
  for (const site of configured) {
    if (site.eventRetentionDays > 0)
      await db.run(
        sql`delete from events where site_id=${site.id} and id in (select id from events where site_id=${site.id} and received_at<${now - site.eventRetentionDays * DAY} and not exists (
          select 1 from payments p left join payment_attributions a on a.site_id=p.site_id and a.provider=p.provider and a.mode=p.mode and a.external_id=p.external_id
          where p.site_id=events.site_id and p.visitor_id=events.visitor_id and events.name='pageview' and events.received_at<=p.paid_at
            and (a.site_id is null or (a.finalized_at is null and events.received_at>=p.paid_at-a.lookback_days*86400000))
        ) order by received_at limit 5000)`,
      );
    if (site.paymentRetentionDays > 0)
      await db.run(
        sql`delete from payments where site_id=${site.id} and (provider,mode,external_id) in (select provider,mode,external_id from payments where site_id=${site.id} and paid_at<${now - site.paymentRetentionDays * DAY} order by paid_at limit 5000)`,
      );
    await db.updateSite(site.id, { lastCleanupAt: now });
  }
  await db.run(sql`delete from ingestion_buckets where hour<${now - 30 * DAY}`);
  await db.run(
    sql`delete from visitor_presence where received_at<${now - 60_000}`,
  );
  await db.run(sql`delete from request_limits where expires_at<${now}`);
  await db.run(sql`delete from api_idempotency where expires_at<${now}`);
  await db.run(sql`delete from oauth_codes where expires_at<${now}`);
  await db.run(sql`delete from oauth_refresh_used where expires_at<${now}`);
}
