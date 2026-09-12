import { createHash, randomBytes } from "node:crypto";
import { createElement } from "react";
import { sql } from "drizzle-orm";
import SiteInvitationEmail from "../emails/site-invitation";
import { createDb } from "../db";
import { HttpError } from "../http";
import { normalizeEmail } from "../lib/email";
import type { Env } from "../types";
import { sendTemplateEmail } from "./email-template";
import { requireSiteManage, safeSite } from "./access";
import { appOrigin } from "./services";

const INVITATION_TTL = 7 * 24 * 60 * 60 * 1000;
const RESEND_COOLDOWN = 60 * 1000;

type InvitationRow = {
  id: string;
  siteId: string;
  emailNormalized: string;
  tokenHash: string;
  createdByUserId: string;
  createdAt: number;
  expiresAt: number;
  acceptedAt: number | null;
  acceptedByUserId: string | null;
  revokedAt: number | null;
  lastSentAt: number | null;
  sendStatus: "pending" | "sent" | "failed" | "unknown";
  providerMessageId: string | null;
  siteName: string;
  siteOrigin: string;
  inviterName: string;
};

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function invitationToken() {
  return Buffer.from(randomBytes(32)).toString("base64url");
}

function recipientHint(email: string) {
  const [local, domain] = email.split("@");
  return `${local.slice(0, 1)}${local.length > 1 ? "***" : ""}@${domain}`;
}

function invitationStatus(row: InvitationRow, now = Date.now()) {
  if (row.revokedAt !== null) return "revoked" as const;
  if (row.acceptedAt !== null) return "accepted" as const;
  if (row.expiresAt <= now) return "expired" as const;
  return "pending" as const;
}

async function invitationByToken(env: Env, token: string) {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return undefined;
  const [row] = await createDb(env).all<InvitationRow>(
    sql`select i.id,i.site_id as "siteId",i.email_normalized as "emailNormalized",i.token_hash as "tokenHash",
      i.created_by_user_id as "createdByUserId",i.created_at as "createdAt",i.expires_at as "expiresAt",
      i.accepted_at as "acceptedAt",i.accepted_by_user_id as "acceptedByUserId",i.revoked_at as "revokedAt",
      i.last_sent_at as "lastSentAt",i.send_status as "sendStatus",i.provider_message_id as "providerMessageId",
      s.name as "siteName",s.origin as "siteOrigin",u.name as "inviterName"
    from site_invitations i join sites s on s.id=i.site_id
    join workspaces w on w.id=s.workspace_id and w.owner_user_id=i.created_by_user_id
    join "user" u on u.id=i.created_by_user_id
    where i.token_hash=${hashToken(token)} limit 1`,
  );
  return row;
}

export type InvitationActor = {
  id: string;
  email: string;
  emailVerified: boolean;
};

export async function invitationPreview(
  env: Env,
  token: string,
  actor?: InvitationActor | null,
) {
  const row = await invitationByToken(env, token);
  if (!row)
    return {
      available: false as const,
      status: "unavailable" as const,
      signedIn: !!actor,
    };
  const status = invitationStatus(row);
  if (status === "expired" || status === "revoked")
    return {
      available: false as const,
      status: "unavailable" as const,
      signedIn: !!actor,
    };
  if (status === "accepted") {
    const [membership] = actor
      ? await createDb(env).all<{ siteId: string }>(
          sql`select site_id as "siteId" from site_memberships
            where site_id=${row.siteId} and user_id=${actor.id} limit 1`,
        )
      : [];
    if (row.acceptedByUserId !== actor?.id || !membership)
      return {
        available: false as const,
        status: "unavailable" as const,
        signedIn: !!actor,
      };
  }
  return {
    available: true as const,
    status,
    siteName: row.siteName,
    siteOrigin: row.siteOrigin,
    inviterName: row.inviterName,
    expiresAt: row.expiresAt,
    recipientHint: recipientHint(row.emailNormalized),
    signedIn: !!actor,
    actorEmail: actor?.email,
    emailMatches: actor
      ? normalizeEmail(actor.email) === row.emailNormalized
      : false,
    emailVerified: actor?.emailVerified ?? false,
  };
}

export async function requireInvitationRegistration(
  env: Env,
  token: string,
  emailInput: string,
) {
  const row = await invitationByToken(env, token);
  if (
    !row ||
    invitationStatus(row) !== "pending" ||
    normalizeEmail(emailInput) !== row.emailNormalized
  )
    throw new HttpError(404, "Invitation is no longer available");
  const [existing] = await createDb(env).all<{ id: string }>(
    sql`select id from "user" where lower(email)=${row.emailNormalized} limit 1`,
  );
  if (existing) throw new HttpError(409, "Sign in to continue");
  return row.emailNormalized;
}

export async function listSitePeople(
  env: Env,
  actorUserId: string,
  siteId: string,
) {
  const { db, site } = await requireSiteManage(env, actorUserId, siteId);
  const [owner] = await db.all<{ id: string; name: string; email: string }>(
    sql`select u.id,u.name,u.email from sites s join workspaces w on w.id=s.workspace_id
      join "user" u on u.id=w.owner_user_id where s.id=${siteId}`,
  );
  const members = await db.all<{
    userId: string;
    name: string;
    email: string;
    role: "viewer";
    createdAt: number;
  }>(sql`select m.user_id as "userId",u.name,u.email,m.role,m.created_at as "createdAt"
    from site_memberships m join "user" u on u.id=m.user_id
    where m.site_id=${siteId} order by m.created_at,u.email`);
  const invitations = await db.all<{
    id: string;
    email: string;
    createdAt: number;
    expiresAt: number;
    revokedAt: number | null;
    lastSentAt: number | null;
    sendStatus: InvitationRow["sendStatus"];
  }>(sql`select id,email_normalized as email,created_at as "createdAt",expires_at as "expiresAt",
    revoked_at as "revokedAt",last_sent_at as "lastSentAt",send_status as "sendStatus"
    from site_invitations where site_id=${siteId} and accepted_at is null
    order by created_at desc limit 100`);
  const now = Date.now();
  return {
    site: safeSite(site, "owner"),
    owner,
    members,
    invitations: invitations.map((invitation) => ({
      ...invitation,
      status:
        invitation.revokedAt !== null
          ? ("revoked" as const)
          : invitation.expiresAt <= now
            ? ("expired" as const)
            : ("pending" as const),
    })),
    emailConfigured: !!env.EMAIL && !!env.EMAIL_FROM?.trim(),
  };
}

async function invitationRateLimits(
  env: Env,
  actorUserId: string,
  siteId: string,
  email: string,
  now: number,
) {
  const db = createDb(env);
  const hour = Math.floor(now / 3_600_000);
  const day = Math.floor(now / 86_400_000);
  if (
    (await db.incrementRateLimit(
      `invite:owner:${actorUserId}:${hour}`,
      (hour + 1) * 3_600_000,
    )) > 30
  )
    throw new HttpError(429, "Too many invitations. Try again later.");
  if (
    (await db.incrementRateLimit(
      `invite:recipient:${siteId}:${hashToken(email)}:${day}`,
      (day + 1) * 86_400_000,
    )) > 5
  )
    throw new HttpError(429, "Too many invitations for this recipient today.");
}

export async function sendSiteInvitation(
  request: Request,
  env: Env,
  actorUserId: string,
  siteId: string,
  emailInput: string,
) {
  const { db, site } = await requireSiteManage(env, actorUserId, siteId);
  const email = normalizeEmail(emailInput);
  const [owner] = await db.all<{ name: string; email: string }>(
    sql`select u.name,u.email from workspaces w join "user" u on u.id=w.owner_user_id
      where w.id=${site.workspaceId}`,
  );
  if (!owner) throw new HttpError(404, "Website not found");
  if (normalizeEmail(owner.email) === email)
    throw new HttpError(400, "The account owner already has access.");
  const [member] = await db.all<{ id: string }>(
    sql`select u.id from "user" u join site_memberships m on m.user_id=u.id
      where m.site_id=${siteId} and lower(u.email)=${email} limit 1`,
  );
  if (member) return { status: "already_has_access" as const };

  const now = Date.now();
  const [recent] = await db.all<{ lastSentAt: number }>(
    sql`select last_sent_at as "lastSentAt" from site_invitations
      where site_id=${siteId} and email_normalized=${email} and accepted_at is null and revoked_at is null
      and last_sent_at>${now - RESEND_COOLDOWN} limit 1`,
  );
  if (recent) throw new HttpError(429, "Wait 60 seconds before sending again.");
  await invitationRateLimits(env, actorUserId, siteId, email, now);

  const token = invitationToken();
  const tokenHash = hashToken(token);
  const expiresAt = now + INVITATION_TTL;
  const id = crypto.randomUUID();
  const [invitation] = await db.all<{
    id: string;
  }>(sql`insert into site_invitations(
      id,site_id,email_normalized,token_hash,created_by_user_id,created_at,expires_at,last_sent_at,send_status
    ) values(${id},${siteId},${email},${tokenHash},${actorUserId},${now},${expiresAt},${now},'pending')
    on conflict(site_id,email_normalized) where accepted_at is null and revoked_at is null do update set
      token_hash=excluded.token_hash,created_by_user_id=excluded.created_by_user_id,created_at=excluded.created_at,
      expires_at=excluded.expires_at,last_sent_at=excluded.last_sent_at,send_status='pending',provider_message_id=null
    returning id`);
  const acceptUrl = `${appOrigin(request, env)}/invite/${token}`;
  try {
    const result = await sendTemplateEmail(env, {
      to: email,
      subject: `${owner.name} invited you to view ${site.name}`,
      template: createElement(SiteInvitationEmail, {
        inviterName: owner.name,
        siteName: site.name,
        siteOrigin: site.origin,
        acceptUrl,
        expiresLabel: new Intl.DateTimeFormat("en", {
          dateStyle: "long",
          timeZone: "UTC",
        }).format(expiresAt),
      }),
    });
    await db.run(
      sql`update site_invitations set send_status='sent',provider_message_id=${result.messageId}
        where id=${invitation.id} and token_hash=${tokenHash}`,
    );
    return { status: "sent" as const, invitationId: invitation.id };
  } catch (error) {
    const configured = !!env.EMAIL && !!env.EMAIL_FROM?.trim();
    await db.run(
      sql`update site_invitations set send_status=${configured ? "unknown" : "failed"}
        where id=${invitation.id} and token_hash=${tokenHash}`,
    );
    throw new HttpError(
      503,
      configured
        ? "The provider did not confirm delivery. Check the invitation status before resending."
        : "Email sending is not configured.",
    );
  }
}

export async function revokeSiteInvitation(
  env: Env,
  actorUserId: string,
  siteId: string,
  invitationId: string,
) {
  const { db } = await requireSiteManage(env, actorUserId, siteId);
  const rows = await db.all<{ id: string }>(
    sql`update site_invitations set revoked_at=${Date.now()}
      where id=${invitationId} and site_id=${siteId} and accepted_at is null and revoked_at is null returning id`,
  );
  if (!rows.length) throw new HttpError(404, "Invitation not found");
  return { status: "revoked" as const };
}

export async function resendSiteInvitation(
  request: Request,
  env: Env,
  actorUserId: string,
  siteId: string,
  invitationId: string,
) {
  const { db } = await requireSiteManage(env, actorUserId, siteId);
  const [invitation] = await db.all<{ email: string }>(
    sql`select email_normalized as email from site_invitations
      where id=${invitationId} and site_id=${siteId} and accepted_at is null and revoked_at is null limit 1`,
  );
  if (!invitation) throw new HttpError(404, "Invitation not found");
  return sendSiteInvitation(
    request,
    env,
    actorUserId,
    siteId,
    invitation.email,
  );
}

export async function removeSiteMember(
  env: Env,
  actorUserId: string,
  siteId: string,
  memberUserId: string,
) {
  const { db } = await requireSiteManage(env, actorUserId, siteId);
  const [member] = await db.all<{ email: string }>(
    sql`select u.email from site_memberships m join "user" u on u.id=m.user_id
      where m.site_id=${siteId} and m.user_id=${memberUserId} limit 1`,
  );
  if (!member) throw new HttpError(404, "Viewer not found");
  const now = Date.now();
  await db.atomic([
    sql`delete from site_memberships where site_id=${siteId} and user_id=${memberUserId}`,
    sql`update site_invitations set revoked_at=${now} where site_id=${siteId}
      and email_normalized=${normalizeEmail(member.email)} and accepted_at is null and revoked_at is null`,
  ]);
  return { status: "removed" as const };
}

export async function acceptSiteInvitation(
  env: Env,
  actor: InvitationActor,
  token: string,
) {
  const row = await invitationByToken(env, token);
  if (!row) throw new HttpError(404, "Invitation is no longer available");
  if (normalizeEmail(actor.email) !== row.emailNormalized)
    throw new HttpError(403, "Sign in with the invited email address");
  if (!actor.emailVerified)
    throw new HttpError(403, "Verify your email address before accepting");
  const db = createDb(env);
  if (row.acceptedAt !== null) {
    if (row.acceptedByUserId !== actor.id)
      throw new HttpError(404, "Invitation is no longer available");
    const [membership] = await db.all<{ siteId: string }>(
      sql`select site_id as "siteId" from site_memberships where site_id=${row.siteId} and user_id=${actor.id}`,
    );
    if (!membership)
      throw new HttpError(410, "Access from this invitation was removed");
    const site = await db.findSite(row.siteId);
    if (!site) throw new HttpError(404, "Invitation is no longer available");
    return { status: "accepted" as const, site: safeSite(site, "viewer") };
  }
  if (row.revokedAt !== null || row.expiresAt <= Date.now())
    throw new HttpError(410, "Invitation is no longer available");
  const now = Date.now();
  await db.atomic([
    sql`insert into site_memberships(site_id,user_id,role,created_at,created_by_user_id)
      select i.site_id,${actor.id},'viewer',${now},i.created_by_user_id from site_invitations i
      join sites s on s.id=i.site_id join workspaces w on w.id=s.workspace_id and w.owner_user_id=i.created_by_user_id
      where i.id=${row.id} and i.token_hash=${hashToken(token)} and i.accepted_at is null and i.revoked_at is null and i.expires_at>${now}
      on conflict(site_id,user_id) do nothing`,
    sql`update site_invitations set accepted_at=${now},accepted_by_user_id=${actor.id}
      where id=${row.id} and token_hash=${hashToken(token)} and accepted_at is null and revoked_at is null and expires_at>${now}`,
  ]);
  const [accepted] = await db.all<{ siteId: string }>(
    sql`select i.site_id as "siteId" from site_invitations i join site_memberships m on m.site_id=i.site_id and m.user_id=${actor.id}
      where i.id=${row.id} and i.accepted_by_user_id=${actor.id} and i.accepted_at is not null limit 1`,
  );
  if (!accepted) throw new HttpError(410, "Invitation is no longer available");
  const site = await db.findSite(accepted.siteId);
  if (!site) throw new HttpError(404, "Invitation is no longer available");
  return { status: "accepted" as const, site: safeSite(site, "viewer") };
}
