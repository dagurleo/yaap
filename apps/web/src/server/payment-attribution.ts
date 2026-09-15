import { sql, type SQL } from "drizzle-orm";
import { createDb } from "../db";
import { HttpError } from "../http";
import type { Env } from "../types";

export const ATTRIBUTION_GRACE_MS = 72 * 3600000;
export type AttributionModel = "first_touch" | "last_non_direct";
export function attributionPolicy(input: {
  model?: unknown;
  lookbackDays?: unknown;
}) {
  if (
    !["first_touch", "last_non_direct"].includes(input.model as string) ||
    !Number.isInteger(input.lookbackDays) ||
    (input.lookbackDays as number) < 1 ||
    (input.lookbackDays as number) > 365
  )
    throw new HttpError(
      400,
      "Choose an attribution model and a lookback of 1–365 days",
    );
  return {
    attributionModel: input.model as AttributionModel,
    attributionLookbackDays: input.lookbackDays as number,
  };
}
const snapshotFields = [
  "id",
  "received_at",
  "tracking_version",
  "path",
  "utm_source",
  "utm_campaign",
  "utm_medium",
  "ad_provider",
  "ad_account_id",
  "ad_campaign_id",
  "ad_group_id",
  "ad_id",
  "ad_touch_id",
  "ad_touched_at",
  "ad_consent_policy",
  "referrer_host",
  "country",
  "region",
  "city",
  "browser",
  "os",
  "device",
] as const;
type Key = {
  site_id: string;
  provider: string;
  mode: string;
  external_id: string;
};
type Candidate = Key & {
  model: AttributionModel;
  visitor_id: string | null;
} & Record<(typeof snapshotFields)[number], string | number | null>;
const keyMatch = (key: Key) =>
  sql`site_id=${key.site_id} and provider=${key.provider} and mode=${key.mode} and external_id=${key.external_id}`;
type Scope = {
  siteId?: string;
  provider?: string;
  mode?: string;
  externalId?: string;
};

/** Bounded, idempotent repair/backfill. Immutable after finalization; no raw-event FK. */
export async function reconcilePaymentAttribution(
  env: Env,
  scope: Scope = {},
  now = Date.now(),
) {
  const db = createDb(env);
  const where = (alias: string) =>
    sql.join(
      [
        scope.siteId
          ? sql`${sql.identifier(alias)}.site_id=${scope.siteId}`
          : sql`1=1`,
        scope.provider
          ? sql`${sql.identifier(alias)}.provider=${scope.provider}`
          : sql`1=1`,
        scope.mode
          ? sql`${sql.identifier(alias)}.mode=${scope.mode}`
          : sql`1=1`,
        scope.externalId
          ? sql`${sql.identifier(alias)}.external_id=${scope.externalId}`
          : sql`1=1`,
      ],
      sql` and `,
    );
  // Payment acceptance can be retried if interrupted before this insert. Reports and cron repair omissions.
  await db.run(sql`insert into payment_attributions(site_id,provider,mode,external_id,model,lookback_days,visitor_id,created_at,checked_at,finalize_after)
    select p.site_id,p.provider,p.mode,p.external_id,coalesce(i.attribution_model,'first_touch'),coalesce(i.attribution_lookback_days,30),p.visitor_id,${now},0,${now + ATTRIBUTION_GRACE_MS}
    from payments p left join payment_integrations i on i.site_id=p.site_id
    where ${where("p")} and not exists(select 1 from payment_attributions a where a.site_id=p.site_id and a.provider=p.provider and a.mode=p.mode and a.external_id=p.external_id)
    order by p.created_at,p.site_id,p.provider,p.mode,p.external_id limit 200
    on conflict(site_id,provider,mode,external_id) do nothing`);
  const candidates = await db.all<Candidate>(sql`with work as materialized (
    select a.*,p.visitor_id as payment_visitor_id,p.paid_at from payment_attributions a join payments p
      on p.site_id=a.site_id and p.provider=a.provider and p.mode=a.mode and p.external_id=a.external_id
    where a.finalized_at is null and ${where("a")} order by a.checked_at,a.site_id,a.provider,a.mode,a.external_id limit 200
  ) select w.site_id,w.provider,w.mode,w.external_id,w.model,w.payment_visitor_id as visitor_id,
    ${sql.join(
      snapshotFields.map((f) => sql`e.${sql.identifier(f)}`),
      sql`,`,
    )}
    from work w left join events e on e.site_id=w.site_id and e.id=(
      select v.id from events v where v.site_id=w.site_id and v.visitor_id=w.payment_visitor_id and v.name='pageview'
        and v.received_at>=w.paid_at-w.lookback_days*86400000 and v.received_at<=w.paid_at
      order by case when w.model='last_non_direct' and (v.utm_source is not null or v.referrer_host is not null or v.ad_campaign_id is not null) then 1 else 0 end desc,
        case when w.model='first_touch' then v.received_at end asc,case when w.model='first_touch' then v.id end asc,
        v.received_at desc,v.id desc limit 1
    )`);
  for (let start = 0; start < candidates.length; start += 25) {
    const writes: SQL[] = [];
    for (const row of candidates.slice(start, start + 25)) {
      if (row.id !== null) {
        const rank =
          row.utm_source !== null ||
          row.referrer_host !== null ||
          row.ad_campaign_id !== null
            ? 1
            : 0;
        const oldRank = sql`case when utm_source is not null or referrer_host is not null or ad_campaign_id is not null then 1 else 0 end`;
        const earlier = sql`(received_at>${row.received_at} or (received_at=${row.received_at} and id>${row.id}))`;
        const later = sql`(received_at<${row.received_at} or (received_at=${row.received_at} and id<${row.id}))`;
        const better =
          row.model === "first_touch"
            ? earlier
            : sql`(${oldRank}<${rank} or (${oldRank}=${rank} and ${later}))`;
        // Preserve the best saved candidate even if retention removed it, or a stale concurrent read returns an older candidate.
        writes.push(sql`update payment_attributions set ${sql.join(
          snapshotFields.map((f) => sql`${sql.identifier(f)}=${row[f]}`),
          sql`,`,
        )}
          where ${keyMatch(row)} and finalized_at is null and (id is null or ${better})`);
      }
      writes.push(sql`update payment_attributions set visitor_id=coalesce(visitor_id,${row.visitor_id}),
        checked_at=${now},finalized_at=case when finalize_after<=${now} then cast(${now} as bigint) else null end
        where ${keyMatch(row)} and finalized_at is null`);
    }
    await db.atomic(writes);
  }
  return { processed: candidates.length };
}

/** Used with the attribution snapshot aliased as events, preserving report dimension semantics. */
export const attributionColumns = sql`events.utm_medium as "medium",events.ad_provider as "adProvider",events.ad_account_id as "adAccountId",events.ad_campaign_id as "adCampaignId",events.ad_group_id as "adGroupId",events.ad_id as "adId",events.ad_touch_id as "adTouchId",events.ad_touched_at as "adTouchedAt",events.model as "attributionModel",events.lookback_days as "attributionLookbackDays",events.finalized_at as "attributionFinalizedAt",
  case when events.site_id is null then 'backfill_required' when events.finalized_at is null then 'pending' else 'finalized' end as "attributionStatus",
  case when events.id is not null then null when events.site_id is null then 'backfill_required' when events.visitor_id is null then 'missing_identity' else 'no_matching_pageview' end as "attributionReason"`;
