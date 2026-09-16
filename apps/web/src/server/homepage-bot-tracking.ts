import { withDatabase } from "../db";
import { excludedByTrackingRules } from "../lib/site-settings";
import type { Env } from "../types";
import { detectRequestBot, recordBotRequest } from "./bot-traffic";
import { billingConfig } from "./billing/config";
import { canHostedWorkspaceCollect } from "./billing/usage";
import { createDb } from "../db";

/** This installation's homepage only; never observe customer dashboards or APIs. */
export function trackHomepageBot(
  request: Request,
  response: Response,
  env: Env,
  context: Pick<ExecutionContext, "waitUntil">,
) {
  const siteId = env.YAAP_SELF_TRACKING_SITE_ID?.trim();
  if (!siteId || !["GET", "HEAD"].includes(request.method)) return;
  const url = new URL(request.url);
  if (url.pathname !== "/") return;
  const detected = detectRequestBot(request);
  if (!detected) return;
  // A new database scope outlives the HTTP handler's closed connection scope.
  // Internal collection needs no token or recursive fetch to this same Worker.
  context.waitUntil(
    withDatabase(env, async (scoped) => {
      const site = await createDb(scoped).findSite(siteId);
      if (
        !site ||
        site.origin !== url.origin ||
        excludedByTrackingRules(url.origin, url.pathname, site.trackingRules)
      )
        return;
      if (
        billingConfig(scoped).mode === "hosted" &&
        !(await canHostedWorkspaceCollect(scoped, site.workspaceId, Date.now()))
      )
        return;
      await recordBotRequest(scoped, {
        siteId,
        id: `self:${crypto.randomUUID()}`,
        path: "/",
        ...detected,
        source: "server",
        statusCode: response.status,
      });
    }).catch(() => {
      console.error("homepage_bot_tracking_failed");
    }),
  );
}
