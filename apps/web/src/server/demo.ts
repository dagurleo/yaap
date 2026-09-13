import { sql } from "drizzle-orm";
import { createDb } from "../db";
import type { Env } from "../types";
import { reconcilePaymentAttribution } from "./payment-attribution";
const HOUR = 3_600_000;
/** Bounded, retry-safe sample traffic for the configured synthetic demo only. */
export async function refreshDemo(env: Env, now = Date.now()) {
  if (!env.YAAP_DEMO_SITE_ID) return;
  const db = createDb(env);
  const siteId = env.YAAP_DEMO_SITE_ID;
  const site = await db.findSite(siteId);
  if (!site || site.origin !== "https://atlas-demo.example") return;
  const [share] = await db.all<{ enabled: number }>(
    sql`select enabled from site_public_shares where site_id=${siteId}`,
  );
  if (!share?.enabled) return;
  // Backfill the last 24 completed hours after interruptions. Stable IDs make retries harmless.
  const end = Math.floor(now / HOUR) * HOUR;
  for (let hour = end - 24 * HOUR; hour < end; hour += HOUR) {
    const rows = [];
    for (let i = 0; i < 6 + (Math.floor(hour / HOUR) % 7); i++) {
      const session = `demo-session-${hour}-${i}`;
      const visitor = `demo-visitor-${Math.floor(hour / HOUR) % 90}-${i}`;
      const source = [null, "google", "newsletter", "github"][i % 4];
      const steps =
        i % 3 === 0
          ? [
              ["pageview", "/"],
              ["pageview", "/pricing"],
              ["signup", "/signup"],
              ["purchase", "/thank-you"],
            ]
          : [
              ["pageview", i % 2 ? "/blog" : "/"],
              ["pageview", "/features"],
            ];
      for (const [step, [name, path]] of steps.entries()) {
        const at = hour + i * 180_000 + step * 30_000;
        const id = `${session}-${step}`;
        rows.push(
          sql`(${siteId},${id},${name},${path},${at},${visitor},${session},2,${["US", "JP", "GB", "DE"][i % 4]},${i % 2 ? "Safari" : "Chrome"},${i % 2 ? "iOS" : "macOS"},${i % 2 ? "Mobile" : "Desktop"},${source},${source === "newsletter" ? "weekly-digest" : null},${name === "pageview" ? "{}" : '{"plan":"pro","sample":true}'})`,
        );
        if (name === "purchase")
          await db.run(
            sql`insert into payments (site_id,provider,mode,external_id,amount,refunded_amount,currency,paid_at,visitor_id,created_at,updated_at) values (${siteId},'api','live',${id},2900,${i === 0 ? 500 : 0},'USD',${at},${visitor},${at},${at}) on conflict(site_id,provider,mode,external_id) do nothing`,
          );
      }
    }
    for (let offset = 0; offset < rows.length; offset += 6)
      await db.run(
        sql`insert into events (site_id,id,name,path,received_at,visitor_id,session_id,tracking_version,country,browser,os,device,utm_source,utm_campaign,properties) values ${sql.join(rows.slice(offset, offset + 6), sql`, `)} on conflict(site_id,id) do nothing`,
      );
  }
  await reconcilePaymentAttribution(env, { siteId });
}
