import { withDatabase } from "./db";
import handler from "@tanstack/react-start/server-entry";
import { route } from "./api";
import { consume } from "./ingest";
import { refreshRollups } from "./server/rollups";
import { cleanup } from "./server/operations";
import { HttpError, json } from "./http";
import type { Env, EventQueueMessage } from "./types";
import { billingConfig } from "./server/billing/config";
import { repairBillingOutbox } from "./server/billing/usage";
import { repairBillingProviderState } from "./server/billing/provider-service";
import { repairPolarWebhookReceipts } from "./server/billing/webhooks";
import { repairBillingNotifications } from "./server/billing/notifications";
import {
  agentDiscovery,
  discoveryOrigin,
  publicResponseHeaders,
} from "./server/agent-discovery";
import {
  publicMarkdown,
  publicPagePath,
  wantsMarkdown,
} from "./server/public-markdown";

const BILLING_REPAIR_CRON = "* * * * *";

declare module "@tanstack/react-start" {
  interface Register {
    server: { requestContext: { env: Env } };
  }
}
export default {
  async fetch(request, bindings) {
    let response: Response;
    let origin = new URL(request.url).origin;
    try {
      origin = discoveryOrigin(request, bindings.BETTER_AUTH_URL);
      const discovery = await agentDiscovery(request, origin);
      if (discovery) response = discovery;
      else {
        billingConfig(bindings);
        response = await withDatabase(bindings, async (env) => {
          const url = new URL(request.url);
          // Preserve bookmarked report URLs and their filters during the move.
          if (
            (request.method === "GET" || request.method === "HEAD") &&
            /^\/sites\/[^/]+(?:\/(?:overview|visitors|funnels|revenue|events|settings))?\/?$/.test(
              url.pathname,
            )
          ) {
            url.pathname = url.pathname.replace(/^\/sites\//, "/app/");
            return Response.redirect(url.toString(), 308);
          }
          const apiResponse = await route(request, env);
          if (apiResponse) return apiResponse;
          if (
            ["GET", "HEAD"].includes(request.method) &&
            wantsMarkdown(request)
          ) {
            const pageUrl = new URL(request.url);
            pageUrl.pathname = publicPagePath(pageUrl.pathname)!;
            const headers = new Headers(request.headers);
            // TanStack's document renderer requires an HTML Accept header.
            headers.set("Accept", "text/html");
            const html = await handler.fetch(
              new Request(pageUrl, { method: "GET", headers }),
              { context: { env } },
            );
            const markdown = await publicMarkdown(
              html,
              new URL(pageUrl.pathname, origin),
            );
            return request.method === "HEAD"
              ? new Response(null, markdown)
              : markdown;
          }
          return handler.fetch(request, { context: { env } });
        });
      }
    } catch (error) {
      if (error instanceof HttpError) {
        response = json({ error: error.message }, error.status);
      } else {
        console.error(
          "request_failed",
          error instanceof Error ? error.message : "Unknown error",
        );
        response = json(
          { error: "Request failed. Check configuration and migrations." },
          500,
        );
      }
    }
    // Apply defaults to errors and redirects too, preserving endpoint privacy policies.
    const safe = new Response(response.body, response);
    safe.headers.set("Cache-Control", "private, no-store");
    safe.headers.set("X-Content-Type-Options", "nosniff");
    if (new URL(request.url).pathname.startsWith("/invite/"))
      safe.headers.set("Referrer-Policy", "no-referrer");
    else if (!safe.headers.has("Referrer-Policy"))
      safe.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
    safe.headers.set("X-Frame-Options", "DENY");
    publicResponseHeaders(safe, request, origin);
    return safe;
  },
  queue: (batch, env) => {
    billingConfig(env);
    return withDatabase(env, (scoped) => consume(batch, scoped));
  },
  async scheduled(controller, env) {
    billingConfig(env);
    await withDatabase(env, async (scoped) => {
      await repairBillingOutbox(scoped);
      await repairPolarWebhookReceipts(scoped);
      await repairBillingProviderState(scoped);
      await repairBillingNotifications(scoped);
      if (controller.cron === BILLING_REPAIR_CRON) return;
      await cleanup(scoped);
      await refreshRollups(scoped);
    });
  },
} satisfies ExportedHandler<Env, EventQueueMessage>;
