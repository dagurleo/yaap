import {
  ingestBotRequest,
  siteBotTraffic,
  changeBotToken,
} from "./server/bot-traffic";
import { botFilters } from "./lib/bot-traffic";
import { isWebhookProvider } from "./lib/payment-providers";
import { conversionFilters } from "./lib/conversion-filters";
import { siteConversions } from "./server/conversion-report";
import { oauth } from "./public-api/oauth";
import { publicApi } from "./public-api/http";
import { mcp } from "./public-api/mcp";
import { siteOperations, saveOperationsSettings } from "./server/operations";
import { siteEventExplorer } from "./server/event-explorer";
import { eventFilters } from "./lib/event-filters";
import type { OperationsSettings } from "./lib/operations";
import { siteRevenue } from "./server/revenue";
import { revenueFilters } from "./lib/revenue-filters";
import {
  ingestPayment,
  paymentWebhook,
  paymentSettings,
  changePaymentSettings,
  type IntegrationChange,
} from "./server/payments";
import { siteFunnels, saveFunnel, archiveFunnel } from "./server/funnels";
import type { FunnelInput } from "./lib/funnels";
import { reportFilters } from "./lib/report-filters";
import {
  siteVisitors,
  visitorJourney,
  type VisitorFilters,
} from "./server/visitors";
import { saveGoal, setGoalArchived } from "./server/goals";
import { siteOverview } from "./server/overview";
import {
  appOrigin,
  addSite,
  listSites,
  siteEvents,
  siteLive,
} from "./server/services";
import { createHash, timingSafeEqual } from "node:crypto";
import { sql } from "drizzle-orm";
import { createAuth } from "./auth";
import { createDb } from "./db";
import {
  decodePathParam,
  HttpError,
  json,
  readJson,
  requiredString,
} from "./http";
import { ingest } from "./ingest";
import { limitRequest } from "./rate-limit";
import type { Env } from "./types";
import {
  acceptSiteInvitation,
  invitationPreview,
  listSitePeople,
  removeSiteMember,
  requireInvitationRegistration,
  resendSiteInvitation,
  revokeSiteInvitation,
  sendSiteInvitation,
} from "./server/sharing";
import { billingOverview } from "./server/billing/service";
import {
  createHostedCheckout,
  createHostedPortalSession,
  reconcileHostedBilling,
} from "./server/billing/provider-service";
import { polarWebhook } from "./server/billing/webhooks";
import { billingConfig } from "./server/billing/config";
import { normalizeEmail } from "./lib/email";
import { provisionHostedAccount } from "./server/services";

function sameOrigin(request: Request, origin: string) {
  if (request.headers.get("origin") !== origin)
    throw new HttpError(403, "Origin not allowed");
}

export async function route(
  request: Request,
  env: Env,
): Promise<Response | null> {
  const url = new URL(request.url);
  if (
    url.pathname.startsWith("/oauth/") ||
    url.pathname.startsWith("/.well-known/oauth-")
  )
    return oauth(request, env);
  if (url.pathname === "/api/v1" || url.pathname.startsWith("/api/v1/"))
    return publicApi(request, env);
  if (url.pathname === "/mcp") return mcp(request, env);
  const db = createDb(env);
  const origin = appOrigin(request, env);
  const method = request.method;

  // Provider callbacks authenticate with their signature, not a user session.
  // Match this exact route before the general authenticated /api boundary.
  if (url.pathname === "/api/billing/webhooks/polar")
    return polarWebhook(request, env);

  if (url.pathname === "/health" && method === "GET") {
    await db.ownershipInitialized();
    return json({ status: "ok", version: "0.0.1", database: db.provider });
  }

  if (url.pathname === "/api/setup" && method === "GET") {
    const initialized = await db.ownershipInitialized();
    return json({ setupRequired: !initialized });
  }
  if (url.pathname === "/api/setup" && method === "POST") {
    sameOrigin(request, origin);
    await limitRequest(request, env, "setup", 5);
    const body = await readJson(request);
    const candidate = requiredString(body, "setupSecret", 256);
    if (!env.BOOTSTRAP_SECRET || env.BOOTSTRAP_SECRET.length < 32)
      throw new HttpError(503, "Owner setup is not configured");
    const digest = (value: string) =>
      createHash("sha256").update(value).digest();
    if (!timingSafeEqual(digest(candidate), digest(env.BOOTSTRAP_SECRET)))
      throw new HttpError(403, "Invalid setup secret");
    if (await db.ownershipInitialized())
      throw new HttpError(409, "Owner already exists");
    const claimKey = "setup:owner-claim";
    if ((await db.incrementRateLimit(claimKey, Number.MAX_SAFE_INTEGER)) > 1)
      throw new HttpError(409, "Owner setup is already in progress");
    const signup = new Request(new URL("/api/auth/sign-up/email", origin), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: origin,
        "cf-connecting-ip":
          request.headers.get("cf-connecting-ip") ?? "127.0.0.1",
      },
      body: JSON.stringify({
        name: requiredString(body, "name", 120),
        email: requiredString(body, "email", 254),
        password: requiredString(body, "password", 128),
      }),
    });
    const response = await createAuth(env, origin, { kind: "owner" }).handler(
      signup,
    );
    if (!response.ok) {
      await db.run(sql`delete from request_limits where key=${claimKey}`);
      return response;
    }
    if (!(await db.ownershipInitialized())) {
      await db.run(sql`delete from request_limits where key=${claimKey}`);
      throw new HttpError(503, "Owner account could not be provisioned");
    }
    return response;
  }

  if (url.pathname === "/api/registration" && method === "POST") {
    sameOrigin(request, origin);
    await limitRequest(request, env, "hosted-registration", 8);
    if (billingConfig(env).mode !== "hosted")
      throw new HttpError(404, "Account registration is not available");
    if (!(await db.ownershipInitialized()))
      throw new HttpError(409, "Installation setup is required");
    const body = await readJson(request);
    let email: string;
    try {
      email = normalizeEmail(requiredString(body, "email", 254));
    } catch {
      throw new HttpError(400, "Invalid email");
    }
    const [existingIdentity] = await db.all<{
      id: string;
      emailVerified: boolean | number;
    }>(
      sql`select id,email_verified as "emailVerified" from "user" where lower(email)=${email} limit 1`,
    );
    const signup = new Request(new URL("/api/auth/sign-up/email", origin), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: origin,
        "cf-connecting-ip":
          request.headers.get("cf-connecting-ip") ?? "127.0.0.1",
      },
      body: JSON.stringify({
        name: requiredString(body, "name", 120),
        email,
        password: requiredString(body, "password", 128),
        callbackURL: "/check-email",
      }),
    });
    const response = await createAuth(env, origin, { kind: "hosted" }).handler(
      signup,
    );
    if (response.ok && existingIdentity) {
      if (!existingIdentity.emailVerified)
        await db.createWorkspace(existingIdentity.id);
      const resend = new Request(
        new URL("/api/auth/send-verification-email", origin),
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Origin: origin,
            "cf-connecting-ip":
              request.headers.get("cf-connecting-ip") ?? "127.0.0.1",
          },
          body: JSON.stringify({ email, callbackURL: "/check-email" }),
        },
      );
      await createAuth(env, origin).handler(resend);
    }
    if (response.ok)
      return json({ message: "Check your email to continue." }, 202);

    // A retry after an ambiguous email failure must be able to resend without
    // revealing whether the identity already existed.
    if ([403, 409, 422].includes(response.status)) {
      const resend = new Request(
        new URL("/api/auth/send-verification-email", origin),
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Origin: origin,
            "cf-connecting-ip":
              request.headers.get("cf-connecting-ip") ?? "127.0.0.1",
          },
          body: JSON.stringify({ email, callbackURL: "/check-email" }),
        },
      );
      await createAuth(env, origin).handler(resend);
      return json({ message: "Check your email to continue." }, 202);
    }
    return response;
  }

  const invitationRegistration = url.pathname.match(
    /^\/api\/invitations\/([^/]+)\/register$/,
  );
  if (invitationRegistration && method === "POST") {
    sameOrigin(request, origin);
    await limitRequest(request, env, "invitation-registration", 10);
    const token = decodePathParam(invitationRegistration[1]);
    const body = await readJson(request);
    const email = await requireInvitationRegistration(
      env,
      token,
      requiredString(body, "email", 254),
    );
    const signup = new Request(new URL("/api/auth/sign-up/email", origin), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: origin,
        "cf-connecting-ip":
          request.headers.get("cf-connecting-ip") ?? "127.0.0.1",
      },
      body: JSON.stringify({
        name: requiredString(body, "name", 120),
        email,
        password: requiredString(body, "password", 128),
      }),
    });
    return createAuth(env, origin, { kind: "invitation", email }).handler(
      signup,
    );
  }
  const invitationLink = url.pathname.match(/^\/api\/invitations\/([^/]+)$/);
  if (invitationLink && method === "GET") {
    const session = await createAuth(env, origin).api.getSession({
      headers: request.headers,
    });
    return json(
      await invitationPreview(
        env,
        decodePathParam(invitationLink[1]),
        session?.user,
      ),
    );
  }

  if (url.pathname.startsWith("/api/auth/")) {
    // Only the secret-protected setup handler can enable registration.
    return createAuth(env, origin).handler(request);
  }

  if (url.pathname === "/bot-traffic") {
    if (method !== "POST") throw new HttpError(405, "Method not allowed");
    await limitRequest(request, env, "bot-traffic", 600);
    return ingestBotRequest(request, env);
  }

  if (url.pathname === "/ingest") {
    if (method === "OPTIONS") {
      // No credentials. POST independently validates the site's allowed origin.
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST",
          "Access-Control-Allow-Headers": "Content-Type",
          "Access-Control-Max-Age": "600",
        },
      });
    }
    if (method !== "POST") throw new HttpError(405, "Method not allowed");
    await limitRequest(request, env, "ingest", 120);
    return ingest(request, env);
  }

  const paymentIngestMatch = url.pathname.match(/^\/payments\/([^/]+)$/);
  const webhookMatch = url.pathname.match(
    /^\/payments\/([^/]+)\/([^/]+)\/(test|live)$/,
  );
  if (paymentIngestMatch || webhookMatch) {
    if (method !== "POST") throw new HttpError(405, "Method not allowed");
    await limitRequest(request, env, "payments", 120);
    if (webhookMatch && !isWebhookProvider(webhookMatch[1]))
      throw new HttpError(404, "Webhook not found");
    return webhookMatch && isWebhookProvider(webhookMatch[1])
      ? paymentWebhook(
          request,
          env,
          webhookMatch[2],
          webhookMatch[1],
          webhookMatch[3],
        )
      : ingestPayment(request, env, paymentIngestMatch![1]);
  }

  if (url.pathname.startsWith("/api/")) {
    const session = await createAuth(env, origin).api.getSession({
      headers: request.headers,
    });
    if (!session) throw new HttpError(401, "Sign in to continue");
    if (!["GET", "HEAD"].includes(method)) sameOrigin(request, origin);

    const invitationAccept = url.pathname.match(
      /^\/api\/invitations\/([^/]+)\/accept$/,
    );
    if (invitationAccept && method === "POST")
      return json(
        await acceptSiteInvitation(
          env,
          session.user,
          decodePathParam(invitationAccept[1]),
        ),
      );

    if (url.pathname === "/api/account" && method === "POST")
      return json(await provisionHostedAccount(env, session.user), 201);

    if (url.pathname === "/api/sites" && method === "GET") {
      return json(await listSites(env, session.user.id));
    }
    if (url.pathname === "/api/sites" && method === "POST") {
      const site = await addSite(env, session.user.id, await readJson(request));
      return json(site, 201);
    }
    if (url.pathname === "/api/billing" && method === "GET")
      return json(await billingOverview(env, session.user.id));
    if (url.pathname === "/api/billing/checkout" && method === "POST") {
      const body = await readJson(request);
      return json(
        await createHostedCheckout(env, session.user.id, origin, {
          planKey: body.planKey,
          operationKey: body.operationKey,
        }),
        201,
      );
    }
    if (url.pathname === "/api/billing/reconcile" && method === "POST")
      return json(await reconcileHostedBilling(env, session.user.id));
    if (url.pathname === "/api/billing/portal" && method === "POST")
      return json(
        await createHostedPortalSession(env, session.user.id, origin),
        201,
      );
    const peopleMatch = url.pathname.match(/^\/api\/sites\/([^/]+)\/people$/);
    if (peopleMatch && method === "GET")
      return json(await listSitePeople(env, session.user.id, peopleMatch[1]));
    const invitationsMatch = url.pathname.match(
      /^\/api\/sites\/([^/]+)\/invitations$/,
    );
    if (invitationsMatch && method === "POST")
      return json(
        await sendSiteInvitation(
          request,
          env,
          session.user.id,
          invitationsMatch[1],
          requiredString(await readJson(request), "email", 254),
        ),
        201,
      );
    const invitationMutation = url.pathname.match(
      /^\/api\/sites\/([^/]+)\/invitations\/([^/]+)\/(resend|revoke)$/,
    );
    if (invitationMutation && method === "POST")
      return json(
        invitationMutation[3] === "resend"
          ? await resendSiteInvitation(
              request,
              env,
              session.user.id,
              invitationMutation[1],
              invitationMutation[2],
            )
          : await revokeSiteInvitation(
              env,
              session.user.id,
              invitationMutation[1],
              invitationMutation[2],
            ),
      );
    const memberMatch = url.pathname.match(
      /^\/api\/sites\/([^/]+)\/members\/([^/]+)$/,
    );
    if (memberMatch && method === "DELETE")
      return json(
        await removeSiteMember(
          env,
          session.user.id,
          memberMatch[1],
          memberMatch[2],
        ),
      );
    const botMatch = url.pathname.match(/^\/api\/sites\/([^/]+)\/bot-traffic$/);
    if (botMatch && method === "GET")
      return json(
        await siteBotTraffic(
          env,
          session.user.id,
          botMatch[1],
          botFilters(Object.fromEntries(url.searchParams)),
        ),
      );
    const botTokenMatch = url.pathname.match(
      /^\/api\/sites\/([^/]+)\/bot-token$/,
    );
    if (botTokenMatch && method === "POST") {
      sameOrigin(request, origin);
      const body = await readJson(request);
      if (body.action !== "rotate" && body.action !== "revoke")
        throw new HttpError(400, "Invalid token action");
      return json(
        await changeBotToken(
          env,
          session.user.id,
          botTokenMatch[1],
          body.action,
        ),
      );
    }
    const operationsMatch = url.pathname.match(
      /^\/api\/sites\/([^/]+)\/operations$/,
    );
    if (operationsMatch && method === "GET")
      return json(
        await siteOperations(env, session.user.id, operationsMatch[1]),
      );
    if (operationsMatch && method === "PATCH")
      return json(
        await saveOperationsSettings(
          env,
          session.user.id,
          operationsMatch[1],
          (await readJson(request)) as OperationsSettings,
        ),
      );
    const revenueMatch = url.pathname.match(/^\/api\/sites\/([^/]+)\/revenue$/);
    if (revenueMatch && method === "GET")
      return json(
        await siteRevenue(
          env,
          session.user.id,
          revenueMatch[1],
          revenueFilters(Object.fromEntries(url.searchParams)),
        ),
      );
    const paymentSettingsMatch = url.pathname.match(
      /^\/api\/sites\/([^/]+)\/payment-settings$/,
    );
    if (paymentSettingsMatch && method === "GET")
      return json(
        await paymentSettings(env, session.user.id, paymentSettingsMatch[1]),
      );
    if (paymentSettingsMatch && method === "POST")
      return json(
        await changePaymentSettings(
          env,
          session.user.id,
          paymentSettingsMatch[1],
          (await readJson(request)) as IntegrationChange,
        ),
      );
    const goalsMatch = url.pathname.match(/^\/api\/sites\/([^/]+)\/goals$/);
    if (goalsMatch && method === "POST")
      return json(
        await saveGoal(
          env,
          session.user.id,
          goalsMatch[1],
          await readJson(request),
        ),
        201,
      );
    const goalMatch = url.pathname.match(
      /^\/api\/sites\/([^/]+)\/goals\/([^/]+)$/,
    );
    if (goalMatch && method === "PATCH") {
      const body = await readJson(request);
      return json(
        body.name !== undefined
          ? await saveGoal(
              env,
              session.user.id,
              goalMatch[1],
              body,
              goalMatch[2],
            )
          : await setGoalArchived(
              env,
              session.user.id,
              goalMatch[1],
              goalMatch[2],
              body.archived as boolean,
            ),
      );
    }
    const funnelsMatch = url.pathname.match(/^\/api\/sites\/([^/]+)\/funnels$/);
    if (funnelsMatch && method === "GET")
      return json(
        await siteFunnels(
          env,
          session.user.id,
          funnelsMatch[1],
          reportFilters(Object.fromEntries(url.searchParams)),
          url.searchParams.get("funnelId") ?? undefined,
        ),
      );
    if (funnelsMatch && method === "POST")
      return json(
        await saveFunnel(
          env,
          session.user.id,
          funnelsMatch[1],
          (await readJson(request, 16_384)) as FunnelInput,
        ),
        201,
      );
    const funnelMatch = url.pathname.match(
      /^\/api\/sites\/([^/]+)\/funnels\/([^/]+)$/,
    );
    if (funnelMatch && method === "PATCH") {
      const body = await readJson(request, 16_384);
      if (Object.keys(body).length === 1 && "archived" in body)
        return json(
          await archiveFunnel(
            env,
            session.user.id,
            funnelMatch[1],
            funnelMatch[2],
            body.archived as boolean,
          ),
        );
      return json(
        await saveFunnel(
          env,
          session.user.id,
          funnelMatch[1],
          body as FunnelInput,
          funnelMatch[2],
        ),
      );
    }
    const visitorsMatch = url.pathname.match(
      /^\/api\/sites\/([^/]+)\/visitors$/,
    );
    if (visitorsMatch && method === "GET")
      return json(
        await siteVisitors(env, session.user.id, visitorsMatch[1], {
          ...reportFilters(Object.fromEntries(url.searchParams)),
          cohort: (url.searchParams.get("cohort") ??
            "all") as VisitorFilters["cohort"],
          goalId: url.searchParams.get("goalId") ?? "",
          page: Number(url.searchParams.get("page") ?? 0),
        }),
      );
    const journeyMatch = url.pathname.match(
      /^\/api\/sites\/([^/]+)\/visitors\/([^/]+)$/,
    );
    if (journeyMatch && method === "GET")
      return json(
        await visitorJourney(
          env,
          session.user.id,
          journeyMatch[1],
          decodePathParam(journeyMatch[2]),
          Number(url.searchParams.get("asOf") ?? Date.now()),
          url.searchParams.has("beforeAt") || url.searchParams.has("beforeId")
            ? {
                at: Number(url.searchParams.get("beforeAt")),
                id: url.searchParams.get("beforeId") ?? "",
              }
            : undefined,
        ),
      );
    const conversionsMatch = url.pathname.match(
      /^\/api\/sites\/([^/]+)\/conversions$/,
    );
    if (conversionsMatch && method === "GET")
      return json(
        await siteConversions(
          env,
          session.user.id,
          conversionsMatch[1],
          conversionFilters(Object.fromEntries(url.searchParams)),
        ),
      );
    const liveMatch = url.pathname.match(/^\/api\/sites\/([^/]+)\/live$/);
    if (liveMatch && method === "GET")
      return json(
        await siteLive(
          env,
          session.user.id,
          liveMatch[1],
          reportFilters(Object.fromEntries(url.searchParams)),
        ),
      );
    const overviewMatch = url.pathname.match(
      /^\/api\/sites\/([^/]+)\/overview$/,
    );
    if (overviewMatch && method === "GET") {
      return json(
        await siteOverview(
          env,
          session.user.id,
          overviewMatch[1],
          reportFilters(Object.fromEntries(url.searchParams)),
        ),
      );
    }
    const match = url.pathname.match(/^\/api\/sites\/([^/]+)\/events$/);
    const explorerMatch = url.pathname.match(
      /^\/api\/sites\/([^/]+)\/event-explorer$/,
    );
    if (explorerMatch && method === "GET")
      return json(
        await siteEventExplorer(
          env,
          session.user.id,
          explorerMatch[1],
          eventFilters(Object.fromEntries(url.searchParams)),
        ),
      );
    if (match && method === "GET") {
      return json(await siteEvents(env, session.user.id, match[1]));
    }
    throw new HttpError(404, "Endpoint not found");
  }
  return null;
}
