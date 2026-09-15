import type { PaymentProvider } from "../lib/payment-providers";
import type { ReportActor } from "./access";
import {
  attributionColumns,
  reconcilePaymentAttribution,
  type AttributionModel,
} from "./payment-attribution";
import { revenueFilters, type RevenueFilters } from "../lib/revenue-filters";
import { sql } from "drizzle-orm";
import type { PaymentMode } from "./payments";
import { requireSiteView } from "./access";
import { segmentFilter, trafficSource } from "./report-filter";
import { reportPeriod, unknownValue } from "../lib/report-filters";
import type { Env } from "../types";
export type RevenueTotal = {
  currency: string;
  amount: number;
  refunds: number;
  net: number;
  payments: number;
  customers: number;
};
export type RevenuePayment = {
  externalId: string;
  provider: PaymentProvider;
  mode: PaymentMode;
  currency: string;
  amount: number;
  refundedAmount: number;
  paidAt: number;
  visitorId: string | null;
  source: string | null;
  campaign: string | null;
  medium: string | null;
  adProvider: "google" | "meta" | null;
  adAccountId: string | null;
  adCampaignId: string | null;
  adGroupId: string | null;
  adId: string | null;
  adTouchId: string | null;
  adTouchedAt: number | null;
  landingPage: string | null;
  attributionModel: AttributionModel | null;
  attributionLookbackDays: number | null;
  attributionFinalizedAt: number | null;
  attributionStatus: "pending" | "finalized" | "backfill_required";
  attributionReason:
    "missing_identity" | "no_matching_pageview" | "backfill_required" | null;
};
export async function siteRevenue(
  env: Env,
  actorUserId: ReportActor,
  siteId: string,
  input: RevenueFilters,
) {
  const { db, site, safeSite } = await requireSiteView(
    env,
    actorUserId,
    siteId,
    "revenue",
  );
  const filters = { ...revenueFilters(input), timezone: site.timezone };
  const period = reportPeriod(filters);
  if (typeof actorUserId === "string")
    await reconcilePaymentAttribution(env, { siteId });
  const base = (start: number, end: number) =>
    revenueFrom(siteId, filters, start, end);
  const current = base(period.start, period.end);
  const totals = (where: ReturnType<typeof base>) =>
    db.all<RevenueTotal>(
      sql`select p.currency,sum(p.amount) as amount,sum(p.refunded_amount) as refunds,sum(p.amount-p.refunded_amount) as net,count(*) as payments,count(distinct p.visitor_id) as customers ${where} group by p.currency order by p.currency`,
    );
  const source = sql`case when events.id is null then null else ${trafficSource} end`;
  const breakdown = (column: ReturnType<typeof sql>) =>
    db.all<RevenueTotal & { label: string | null }>(
      sql`select ${column} as label,p.currency,sum(p.amount) as amount,sum(p.refunded_amount) as refunds,sum(p.amount-p.refunded_amount) as net,count(*) as payments,count(distinct p.visitor_id) as customers ${current} group by ${column},p.currency order by net desc,p.currency,label limit 100`,
    );
  const [
    summary,
    comparison,
    sources,
    campaigns,
    landingPages,
    rows,
    count,
    attribution,
    adCampaigns,
  ] = await Promise.all([
    totals(current),
    filters.compare
      ? totals(base(period.previousStart, period.start))
      : Promise.resolve(null),
    breakdown(source),
    breakdown(sql`events.utm_campaign`),
    breakdown(sql`events.path`),
    db.all<RevenuePayment>(
      sql`select p.external_id as "externalId",p.provider,p.mode,p.currency,p.amount,p.refunded_amount as "refundedAmount",p.paid_at as "paidAt",p.visitor_id as "visitorId",${source} as source,events.utm_campaign as campaign,events.path as "landingPage",${attributionColumns} ${current} order by p.paid_at desc,p.provider,p.external_id limit 50 offset ${filters.page * 50}`,
    ),
    db.all<{ total: number }>(sql`select count(*) as total ${current}`),
    db.all<{
      currency: string;
      model: AttributionModel | null;
      lookbackDays: number | null;
      status: string;
      reason: string | null;
      payments: number;
      net: number;
    }>(sql`select p.currency,events.model,events.lookback_days as "lookbackDays",
        case when events.site_id is null then 'backfill_required' when events.finalized_at is null then 'pending' else 'finalized' end as status,
        case when events.id is not null then null when events.site_id is null then 'backfill_required' when events.visitor_id is null then 'missing_identity' else 'no_matching_pageview' end as reason,
        count(*) as payments,sum(p.amount-p.refunded_amount) as net ${current} group by 1,2,3,4,5 order by 1,2,3,4,5`),
    db.all<{
      provider: "google" | "meta";
      accountId: string | null;
      campaignId: string;
      currency: string;
      payments: number;
      net: number;
    }>(
      sql`select events.ad_provider as provider,events.ad_account_id as "accountId",events.ad_campaign_id as "campaignId",p.currency,count(*) as payments,sum(p.amount-p.refunded_amount) as net ${current} and events.ad_campaign_id is not null group by 1,2,3,4 order by net desc,provider,"accountId","campaignId",p.currency limit 50`,
    ),
  ]);
  return {
    site: safeSite,
    filters,
    ...period,
    summary,
    comparison,
    sources,
    campaigns,
    landingPages,
    payments: rows,
    total: count[0].total,
    attribution,
    adCampaigns,
  };
}

export function revenueFrom(
  siteId: string,
  filters: RevenueFilters,
  start: number,
  end: number,
) {
  return sql`from payments p left join payment_attributions events on events.site_id=p.site_id and events.provider=p.provider and events.mode=p.mode and events.external_id=p.external_id where p.site_id=${siteId} and p.mode=${filters.mode} and p.paid_at>=${start} and p.paid_at<${end} and ${segmentFilter({ ...filters, source: undefined })}
    and ${filters.visitorId ? sql`p.visitor_id=${filters.visitorId}` : sql`1=1`}
    and ${filters.source === undefined ? sql`1=1` : filters.source === unknownValue ? sql`events.id is null` : sql`events.id is not null and ${trafficSource}=${filters.source}`}`;
}
