import {
  conversionFilters,
  type ConversionFilters,
} from "../../lib/conversion-filters";
import { siteConversions } from "../../server/conversion-report";
import type { EventProperties } from "../../lib/event-properties";
import type { TrackingRules } from "../../lib/site-settings";
import { eventFilters, type EventFilters } from "../../lib/event-filters";
import { siteEventExplorer } from "../../server/event-explorer";
import { saveTrackingRules, saveSiteDetails } from "../../server/site-settings";
import {
  siteOperations,
  saveOperationsSettings,
} from "../../server/operations";
import type { OperationsSettings } from "../../lib/operations";
import { siteRevenue } from "../../server/revenue";
import { revenueFilters, type RevenueFilters } from "../../lib/revenue-filters";
import {
  paymentSettings,
  changePaymentSettings,
  type IntegrationChange,
} from "../../server/payments";
import { siteFunnels, saveFunnel, archiveFunnel } from "../../server/funnels";
import type { FunnelInput } from "../../lib/funnels";
import { reportFilters, type ReportFilters } from "../../lib/report-filters";
import {
  siteVisitors,
  visitorJourney,
  validateVisitorFilters,
  type VisitorFilters,
  type JourneyCursor,
} from "../../server/visitors";
import { saveGoal, setGoalArchived } from "../../server/goals";
import { siteOverview } from "../../server/overview";
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { redirect } from "@tanstack/react-router";
import {
  getAccess,
  requireUser,
  listSites,
  addSite,
  siteEvents,
  siteLive,
  appOrigin,
} from "../../server/services";
import { billingOverview } from "../../server/billing/service";
import {
  createHostedCheckout,
  createHostedPortalSession,
  reconcileHostedBilling,
} from "../../server/billing/provider-service";
import { isBillingPlanKey, type BillingPlanKey } from "../../lib/billing-plans";
import { HttpError } from "../../http";
import type { Env } from "../../types";
import {
  acceptSiteInvitation,
  invitationPreview,
  listSitePeople,
  removeSiteMember,
  resendSiteInvitation,
  revokeSiteInvitation,
  sendSiteInvitation,
} from "../../server/sharing";
async function actor(env: Env) {
  try {
    return await requireUser(getRequest(), env);
  } catch (error) {
    if (error instanceof HttpError && error.status === 401)
      throw redirect({ to: "/login" });
    throw error;
  }
}
export const accessFn = createServerFn({ method: "GET" }).handler(
  ({ context }) => getAccess(getRequest(), context.env),
);
export const sitesFn = createServerFn({ method: "GET" }).handler(
  async ({ context }) => listSites(context.env, await actor(context.env)),
);
export const billingFn = createServerFn({ method: "GET" }).handler(
  async ({ context }) => billingOverview(context.env, await actor(context.env)),
);
export const checkoutFn = createServerFn({ method: "POST" })
  .validator((data: { planKey: BillingPlanKey; operationKey: string }) => {
    if (!data || !isBillingPlanKey(data.planKey))
      throw new Error("Choose a valid plan");
    if (
      typeof data.operationKey !== "string" ||
      !data.operationKey.trim() ||
      data.operationKey.length > 128
    )
      throw new Error("Invalid checkout request");
    return { ...data, operationKey: data.operationKey.trim() };
  })
  .handler(async ({ data, context }) =>
    createHostedCheckout(
      context.env,
      await actor(context.env),
      appOrigin(getRequest(), context.env),
      data,
    ),
  );
export const reconcileBillingFn = createServerFn({ method: "POST" }).handler(
  async ({ context }) =>
    reconcileHostedBilling(context.env, await actor(context.env)),
);
export const billingPortalFn = createServerFn({ method: "POST" }).handler(
  async ({ context }) =>
    createHostedPortalSession(
      context.env,
      await actor(context.env),
      appOrigin(getRequest(), context.env),
    ),
);
export const addSiteFn = createServerFn({ method: "POST" })
  .validator((data: { name: string; origin: string; timezone?: string }) => {
    if (
      !data ||
      typeof data.name !== "string" ||
      typeof data.origin !== "string"
    )
      throw new Error("Enter a website name and origin");
    return data;
  })
  .handler(async ({ data, context }) =>
    addSite(context.env, await actor(context.env), data),
  );
export const eventsFn = createServerFn({ method: "GET" })
  .validator((data: { siteId: string }) => {
    siteInput(data);
    return data;
  })
  .handler(async ({ data, context }) =>
    siteEvents(context.env, await actor(context.env), data.siteId),
  );

export const eventExplorerFn = createServerFn({ method: "GET" })
  .validator((data: EventFilters & { siteId: string }) => ({
    ...eventFilters(data),
    siteId: siteInput(data).siteId,
  }))
  .handler(async ({ data, context }) =>
    siteEventExplorer(context.env, await actor(context.env), data.siteId, data),
  );

export const overviewFn = createServerFn({ method: "GET" })
  .validator((data: ReportFilters & { siteId: string }) => {
    siteInput(data);
    return { siteId: data.siteId, ...reportFilters(data) };
  })
  .handler(async ({ data, context }) =>
    siteOverview(
      context.env,
      await actor(context.env),
      data.siteId,
      data,
      false,
    ),
  );

export const addGoalFn = createServerFn({ method: "POST" })
  .validator(
    (data: {
      siteId: string;
      id?: string;
      name: string;
      eventName: string;
      icon?: string;
      path?: string | null;
      conditions?: EventProperties;
    }) => {
      siteInput(data);
      return data;
    },
  )
  .handler(async ({ data, context }) =>
    saveGoal(context.env, await actor(context.env), data.siteId, data, data.id),
  );

export const archiveGoalFn = createServerFn({ method: "POST" })
  .validator((data: { siteId: string; goalId: string; archived: boolean }) => {
    if (
      !data ||
      typeof data.siteId !== "string" ||
      !data.siteId ||
      data.siteId.length > 128 ||
      typeof data.goalId !== "string" ||
      !data.goalId ||
      data.goalId.length > 128 ||
      typeof data.archived !== "boolean"
    )
      throw new Error("Invalid goal");
    return data;
  })
  .handler(async ({ data, context }) =>
    setGoalArchived(
      context.env,
      await actor(context.env),
      data.siteId,
      data.goalId,
      data.archived,
    ),
  );

export const visitorsFn = createServerFn({ method: "GET" })
  .validator((data: VisitorFilters & { siteId: string }) => {
    siteInput(data);
    return { ...data, ...validateVisitorFilters(data) };
  })
  .handler(async ({ data, context }) =>
    siteVisitors(context.env, await actor(context.env), data.siteId, data),
  );
export const journeyFn = createServerFn({ method: "GET" })
  .validator(
    (data: {
      siteId: string;
      visitorId: string;
      asOf: number;
      cursor?: JourneyCursor;
    }) => {
      siteInput(data);
      return data;
    },
  )
  .handler(async ({ data, context }) =>
    visitorJourney(
      context.env,
      await actor(context.env),
      data.siteId,
      data.visitorId,
      data.asOf,
      data.cursor,
    ),
  );

export const liveFn = createServerFn({ method: "GET" })
  .validator((data: ReportFilters & { siteId: string }) => {
    siteInput(data);
    return { siteId: data.siteId, ...reportFilters(data) };
  })
  .handler(async ({ data, context }) =>
    siteLive(context.env, await actor(context.env), data.siteId, data),
  );

export const funnelsFn = createServerFn({ method: "GET" })
  .validator((data: ReportFilters & { siteId: string; funnelId?: string }) => {
    if (
      !data ||
      typeof data.siteId !== "string" ||
      !data.siteId ||
      data.siteId.length > 128 ||
      (data.funnelId !== undefined &&
        (typeof data.funnelId !== "string" || data.funnelId.length > 128))
    )
      throw new Error("Invalid funnel report");
    return {
      siteId: data.siteId,
      funnelId: data.funnelId,
      ...reportFilters(data),
    };
  })
  .handler(async ({ data, context }) =>
    siteFunnels(
      context.env,
      await actor(context.env),
      data.siteId,
      data,
      data.funnelId,
    ),
  );
export const saveFunnelFn = createServerFn({ method: "POST" })
  .validator((data: { siteId: string; id?: string; funnel: FunnelInput }) => {
    siteInput(data);
    return data;
  })
  .handler(async ({ data, context }) =>
    saveFunnel(
      context.env,
      await actor(context.env),
      data.siteId,
      data.funnel,
      data.id,
    ),
  );
export const archiveFunnelFn = createServerFn({ method: "POST" })
  .validator((data: { siteId: string; id: string; archived: boolean }) => {
    if (
      !data ||
      typeof data.siteId !== "string" ||
      !data.siteId ||
      data.siteId.length > 128 ||
      typeof data.id !== "string" ||
      !data.id ||
      data.id.length > 128
    )
      throw new Error("Invalid funnel");
    return data;
  })
  .handler(async ({ data, context }) =>
    archiveFunnel(
      context.env,
      await actor(context.env),
      data.siteId,
      data.id,
      data.archived,
    ),
  );

function siteInput<T extends { siteId: string }>(data: T): T {
  if (
    !data ||
    typeof data.siteId !== "string" ||
    !data.siteId ||
    data.siteId.length > 128
  )
    throw new Error("Invalid website");
  return data;
}
export const revenueFn = createServerFn({ method: "GET" })
  .validator((data: RevenueFilters & { siteId: string }) => ({
    ...revenueFilters(data),
    siteId: siteInput(data).siteId,
  }))
  .handler(async ({ data, context }) =>
    siteRevenue(context.env, await actor(context.env), data.siteId, data),
  );
export const paymentSettingsFn = createServerFn({ method: "GET" })
  .validator(siteInput<{ siteId: string }>)
  .handler(async ({ data, context }) =>
    paymentSettings(context.env, await actor(context.env), data.siteId),
  );
export const changePaymentSettingsFn = createServerFn({ method: "POST" })
  .validator(siteInput<{ siteId: string; change: IntegrationChange }>)
  .handler(async ({ data, context }) =>
    changePaymentSettings(
      context.env,
      await actor(context.env),
      data.siteId,
      data.change,
    ),
  );

export const operationsFn = createServerFn({ method: "GET" })
  .validator(siteInput<{ siteId: string }>)
  .handler(async ({ data, context }) =>
    siteOperations(context.env, await actor(context.env), data.siteId),
  );
export const saveOperationsFn = createServerFn({ method: "POST" })
  .validator(siteInput<{ siteId: string; settings: OperationsSettings }>)
  .handler(async ({ data, context }) =>
    saveOperationsSettings(
      context.env,
      await actor(context.env),
      data.siteId,
      data.settings,
    ),
  );

export const saveSiteDetailsFn = createServerFn({ method: "POST" })
  .validator(
    siteInput<{
      siteId: string;
      name: string;
      origin: string;
      timezone?: string;
    }>,
  )
  .handler(async ({ data, context }) =>
    saveSiteDetails(context.env, await actor(context.env), data.siteId, data),
  );

export const saveTrackingRulesFn = createServerFn({ method: "POST" })
  .validator(
    siteInput<{ siteId: string; rules: TrackingRules; excludeBots: boolean }>,
  )
  .handler(async ({ data, context }) =>
    saveTrackingRules(
      context.env,
      await actor(context.env),
      data.siteId,
      data.rules,
      data.excludeBots,
    ),
  );

export const conversionsFn = createServerFn({ method: "GET" })
  .validator((data: ConversionFilters & { siteId: string }) => ({
    ...conversionFilters(data),
    siteId: siteInput(data).siteId,
  }))
  .handler(async ({ data, context }) =>
    siteConversions(context.env, await actor(context.env), data.siteId, data),
  );

export const peopleFn = createServerFn({ method: "GET" })
  .validator(siteInput<{ siteId: string }>)
  .handler(async ({ data, context }) =>
    listSitePeople(context.env, await actor(context.env), data.siteId),
  );

export const inviteViewerFn = createServerFn({ method: "POST" })
  .validator((data: { siteId: string; email: string }) => {
    siteInput(data);
    if (typeof data.email !== "string" || data.email.length > 254)
      throw new Error("Enter a valid email address");
    return data;
  })
  .handler(async ({ data, context }) =>
    sendSiteInvitation(
      getRequest(),
      context.env,
      await actor(context.env),
      data.siteId,
      data.email,
    ),
  );

export const resendInvitationFn = createServerFn({ method: "POST" })
  .validator((data: { siteId: string; invitationId: string }) => {
    siteInput(data);
    if (!data.invitationId || data.invitationId.length > 128)
      throw new Error("Invalid invitation");
    return data;
  })
  .handler(async ({ data, context }) =>
    resendSiteInvitation(
      getRequest(),
      context.env,
      await actor(context.env),
      data.siteId,
      data.invitationId,
    ),
  );

export const revokeInvitationFn = createServerFn({ method: "POST" })
  .validator((data: { siteId: string; invitationId: string }) => {
    siteInput(data);
    if (!data.invitationId || data.invitationId.length > 128)
      throw new Error("Invalid invitation");
    return data;
  })
  .handler(async ({ data, context }) =>
    revokeSiteInvitation(
      context.env,
      await actor(context.env),
      data.siteId,
      data.invitationId,
    ),
  );

export const removeViewerFn = createServerFn({ method: "POST" })
  .validator((data: { siteId: string; userId: string }) => {
    siteInput(data);
    if (!data.userId || data.userId.length > 128)
      throw new Error("Invalid viewer");
    return data;
  })
  .handler(async ({ data, context }) =>
    removeSiteMember(
      context.env,
      await actor(context.env),
      data.siteId,
      data.userId,
    ),
  );

export const invitationPreviewFn = createServerFn({ method: "GET" })
  .validator((data: { token: string }) => {
    if (!data?.token || data.token.length > 128)
      throw new Error("Invalid invitation");
    return data;
  })
  .handler(async ({ data, context }) => {
    const access = await getAccess(getRequest(), context.env);
    return invitationPreview(context.env, data.token, access.user);
  });

export const acceptInvitationFn = createServerFn({ method: "POST" })
  .validator((data: { token: string }) => {
    if (!data?.token || data.token.length > 128)
      throw new Error("Invalid invitation");
    return data;
  })
  .handler(async ({ data, context }) => {
    const access = await getAccess(getRequest(), context.env);
    if (!access.user) throw redirect({ to: "/login" });
    return acceptSiteInvitation(context.env, access.user, data.token);
  });
