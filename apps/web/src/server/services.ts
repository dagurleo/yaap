import { validateTimezone } from "../lib/report-timezone";
import { validateSiteDetails } from "../lib/site-settings";
import { liveActivity } from "./session-metrics";
import { reportFilters, type ReportFilters } from "../lib/report-filters";
import { createDb } from "../db";
import { createAuth } from "../auth";
import { HttpError } from "../http";
import type { Env } from "../types";
import { listAccessibleSites, requireSiteView } from "./access";
import { billingConfig } from "./billing/config";
import { activateHostedTrialForVerifiedOwner } from "./billing/trial";

export function appOrigin(request: Request, env: Env) {
  const origin = env.BETTER_AUTH_URL || new URL(request.url).origin;
  if (new URL(origin).origin !== origin)
    throw new Error("Invalid BETTER_AUTH_URL");
  return origin;
}

export async function hostedRegistrationAvailable(env: Env) {
  return (
    billingConfig(env).mode === "hosted" &&
    (await createDb(env).ownershipInitialized())
  );
}

export async function getAccess(request: Request, env: Env) {
  const db = createDb(env);
  const setupRequired = !(await db.ownershipInitialized());
  const session = await createAuth(env, appOrigin(request, env)).api.getSession(
    { headers: request.headers },
  );
  return {
    setupRequired,
    user: session
      ? {
          id: session.user.id,
          name: session.user.name,
          email: session.user.email,
          emailVerified: session.user.emailVerified,
          ownsAccount: !!(await db.workspaceForOwner(session.user.id)),
        }
      : null,
    registrationAvailable:
      billingConfig(env).mode === "hosted" && !setupRequired,
    origin: appOrigin(request, env),
  };
}

export async function provisionHostedAccount(
  env: Env,
  user: { id: string; emailVerified: boolean },
) {
  if (billingConfig(env).mode !== "hosted")
    throw new HttpError(404, "Account registration is not available");
  if (!user.emailVerified)
    throw new HttpError(403, "Verify your email before creating an account");
  const db = createDb(env);
  if (!(await db.ownershipInitialized()))
    throw new HttpError(409, "Installation setup is required");
  const existing = await db.workspaceForOwner(user.id);
  const workspace = existing ?? (await db.createWorkspace(user.id));
  if (!workspace) throw new HttpError(503, "Account could not be provisioned");
  await activateHostedTrialForVerifiedOwner(env, user.id);
  return { workspaceId: workspace.id, created: !existing };
}
export async function requireUser(request: Request, env: Env) {
  const session = await createAuth(env, appOrigin(request, env)).api.getSession(
    { headers: request.headers },
  );
  if (!session) throw new HttpError(401, "Sign in to continue");
  return session.user.id;
}
export async function requireOwner(request: Request, env: Env) {
  const userId = await requireUser(request, env);
  if (!(await createDb(env).workspaceForOwner(userId)))
    throw new HttpError(403, "An account owner is required");
  return userId;
}
export async function listSites(env: Env, actorUserId: string) {
  return listAccessibleSites(env, actorUserId);
}
export async function addSite(
  env: Env,
  actorUserId: string,
  body: Record<string, unknown>,
) {
  const db = createDb(env);
  const workspace = await db.workspaceForOwner(actorUserId);
  if (!workspace) throw new HttpError(403, "An account owner is required");

  const { name, origin } = validateSiteDetails(body);
  const site = {
    id: crypto.randomUUID(),
    ownerId: actorUserId,
    workspaceId: workspace.id,
    name,
    origin,
    createdAt: Date.now(),
    timezone: validateTimezone(body.timezone ?? "UTC"),
  };
  await db.createSite(site);
  return site;
}
export async function siteEvents(
  env: Env,
  actorUserId: string,
  siteId: string,
) {
  const { db, site, safeSite } = await requireSiteView(
    env,
    actorUserId,
    siteId,
  );
  return { site: safeSite, ...(await db.siteEvents(site.id)) };
}

export async function siteLive(
  env: Env,
  actorUserId: string,
  siteId: string,
  input: ReportFilters,
) {
  const filters = reportFilters(input);
  const { db } = await requireSiteView(env, actorUserId, siteId);
  return liveActivity(db, siteId, filters);
}
