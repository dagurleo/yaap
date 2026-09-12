import { createElement } from "react";
import { sql } from "drizzle-orm";
import BillingNoticeEmail from "../../emails/billing-notice";
import { createDb } from "../../db";
import type { Env } from "../../types";
import { sendTemplateEmail } from "../email-template";
import { billingConfig } from "./config";
import { TRIAL_GRACE_MS } from "./trial";

const TRIAL_ENDING_NOTICE_MS = 3 * 24 * 60 * 60 * 1000;
const PROCESSING_LEASE_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 8;

type BillingNotificationKind =
  | "usage_80"
  | "usage_100"
  | "usage_ceiling"
  | "trial_ending_owner"
  | "trial_ended_owner"
  | "trial_ended_operator"
  | "trial_grace_ended_owner";

type NotificationJob = {
  id: string;
  workspaceId: string;
  periodId: string | null;
  kind: string;
  entitlementRevision: string;
  attempts: number;
  ownerName: string;
  ownerEmail: string;
  trialEndsAt: number | null;
  periodAllowance: number | null;
  periodCeiling: number | null;
  periodPersisted: number | null;
  periodReserved: number | null;
};

type EmailContent = {
  to: string;
  subject: string;
  preview: string;
  eyebrow: string;
  title: string;
  body: string;
  detail?: string;
  actionLabel?: string | null;
};

const events = new Intl.NumberFormat("en-US");
const date = new Intl.DateTimeFormat("en", {
  dateStyle: "long",
  timeZone: "UTC",
});

function boundedError(error: unknown) {
  return (error instanceof Error ? error.message : "Unknown email error").slice(
    0,
    500,
  );
}

function nextAttemptAt(attempts: number, now: number) {
  return (
    now + Math.min(12 * 60 * 60 * 1000, 60_000 * 2 ** Math.min(attempts, 9))
  );
}

function billingUrl(env: Env) {
  const origin = env.BETTER_AUTH_URL?.trim();
  if (!origin || new URL(origin).origin !== origin)
    throw new Error(
      "Billing email delivery requires BETTER_AUTH_URL to be an absolute origin.",
    );
  return `${origin}/app/billing`;
}

function usageDetail(job: NotificationJob) {
  const used = (job.periodPersisted ?? 0) + (job.periodReserved ?? 0);
  return `${events.format(used)} events used · ${events.format(job.periodAllowance ?? 0)} included · collection pauses at ${events.format(job.periodCeiling ?? 0)}`;
}

function emailContent(job: NotificationJob, env: Env): EmailContent {
  const owner = job.ownerName.trim() || "there";
  switch (job.kind as BillingNotificationKind) {
    case "usage_80":
      return {
        to: job.ownerEmail,
        subject: "You’ve used 80% of your Yaap events",
        preview: "Your account is approaching its included event limit",
        eyebrow: "Usage notice",
        title: "You’ve used 80% of your events",
        body: `Hi ${owner}, your analytics are still collecting normally. Review your usage now so you can move to a larger plan before collection is interrupted.`,
        detail: usageDetail(job),
        actionLabel: "Review usage",
      };
    case "usage_100":
      return {
        to: job.ownerEmail,
        subject: "You’ve used all events included in your Yaap plan",
        preview: "Collection is still active during your event buffer",
        eyebrow: "Usage notice",
        title: "Your included events are used",
        body: `Hi ${owner}, Yaap is still recording events during your 10% buffer. Upgrade before that buffer is exhausted to avoid a pause.`,
        detail: usageDetail(job),
        actionLabel: "Choose a larger plan",
      };
    case "usage_ceiling":
      return {
        to: job.ownerEmail,
        subject: "Yaap analytics collection is paused",
        preview: "Upgrade to resume analytics collection",
        eyebrow: "Action required",
        title: "Analytics collection is paused",
        body: `Hi ${owner}, your account has used its included events and the full 10% buffer. Upgrade to unlock collection again.`,
        detail: usageDetail(job),
        actionLabel: "Upgrade and resume",
      };
    case "trial_ending_owner":
      return {
        to: job.ownerEmail,
        subject: "Your Yaap trial ends in 3 days",
        preview: "Choose a plan to keep analytics collection active",
        eyebrow: "Trial notice",
        title: "Your trial ends soon",
        body: `Hi ${owner}, your Yaap trial ends on ${date.format(job.trialEndsAt!)}. Choose a plan to keep collecting without interruption.`,
        detail:
          "If you need more time, collection continues for three grace days after the trial ends.",
        actionLabel: "Choose a plan",
      };
    case "trial_ended_owner":
      return {
        to: job.ownerEmail,
        subject: "Your Yaap trial ended — collection is still active",
        preview: "You have three grace days to choose a plan",
        eyebrow: "Trial notice",
        title: "Your three-day grace period has started",
        body: `Hi ${owner}, your trial has ended, but Yaap will keep recording analytics until ${date.format(job.trialEndsAt! + TRIAL_GRACE_MS)}. Choose a plan before then to avoid a pause.`,
        actionLabel: "Choose a plan",
      };
    case "trial_ended_operator":
      return {
        to: env.BILLING_ALERT_EMAIL?.trim() ?? "",
        subject: `Yaap trial ended: ${job.ownerEmail}`,
        preview: "A hosted account entered its trial grace period",
        eyebrow: "Billing operations",
        title: "A hosted trial ended",
        body: `${job.ownerName} (${job.ownerEmail}) entered the three-day trial grace period on ${date.format(job.trialEndsAt!)}.`,
        detail: `Workspace: ${job.workspaceId}`,
        actionLabel: null,
      };
    case "trial_grace_ended_owner":
      return {
        to: job.ownerEmail,
        subject: "Your Yaap trial grace period ended",
        preview: "Upgrade to unlock analytics collection",
        eyebrow: "Action required",
        title: "Analytics collection is paused",
        body: `Hi ${owner}, your trial grace period has ended. Choosing a plan will unlock analytics collection again.`,
        actionLabel: "Upgrade and resume",
      };
    default:
      throw new Error(`Unknown billing notification kind: ${job.kind}`);
  }
}

async function enqueue(
  env: Env,
  input: {
    workspaceId: string;
    periodId: string;
    kind: BillingNotificationKind;
    revision: string;
    now: number;
  },
) {
  const dedupeKey = `${input.workspaceId}:${input.revision}:${input.kind}`;
  await createDb(env).run(
    sql`insert into billing_notification_jobs(id,workspace_id,period_id,kind,entitlement_revision,dedupe_key,state,attempts,next_attempt_at,created_at,updated_at)
      values(${dedupeKey},${input.workspaceId},${input.periodId},${input.kind},${input.revision},${dedupeKey},'pending',0,${input.now},${input.now},${input.now})
      on conflict(dedupe_key) do nothing`,
  );
}

/** Discover time-based trial notices. Usage notices are inserted by DB triggers. */
export async function enqueueTrialNotifications(env: Env, now = Date.now()) {
  const config = billingConfig(env);
  if (config.mode === "self_hosted") return 0;
  const rows = await createDb(env).all<{
    workspaceId: string;
    trialEndsAt: number;
  }>(
    sql`select a.workspace_id as "workspaceId",a.trial_ends_at as "trialEndsAt"
      from billing_accounts a
      where a.environment=${config.environment} and a.trial_ends_at is not null
      and not exists(select 1 from billing_subscriptions s where s.workspace_id=a.workspace_id and s.environment=a.environment)
      and (
        (a.trial_ends_at>${now} and a.trial_ends_at<=${now + TRIAL_ENDING_NOTICE_MS}
          and not exists(select 1 from billing_notification_jobs j where j.workspace_id=a.workspace_id and j.kind='trial_ending_owner'))
        or (a.trial_ends_at<=${now} and a.trial_ends_at+${TRIAL_GRACE_MS}>${now}
          and not exists(select 1 from billing_notification_jobs j where j.workspace_id=a.workspace_id and j.kind='trial_ended_owner'))
        or (a.trial_ends_at+${TRIAL_GRACE_MS}<=${now}
          and not exists(select 1 from billing_notification_jobs j where j.workspace_id=a.workspace_id and j.kind='trial_grace_ended_owner'))
        or (${env.BILLING_ALERT_EMAIL?.trim() ? 1 : 0}=1 and a.trial_ends_at<=${now}
          and not exists(select 1 from billing_notification_jobs j where j.workspace_id=a.workspace_id and j.kind='trial_ended_operator'))
      )
      order by a.trial_ends_at,a.workspace_id limit 100`,
  );
  let attempted = 0;
  for (const row of rows) {
    const periodId = `trial:${config.environment}:${row.workspaceId}`;
    const revision = `trial:${config.environment}:${row.trialEndsAt}`;
    if (
      row.trialEndsAt > now &&
      row.trialEndsAt <= now + TRIAL_ENDING_NOTICE_MS
    ) {
      await enqueue(env, {
        workspaceId: row.workspaceId,
        periodId,
        kind: "trial_ending_owner",
        revision,
        now,
      });
      attempted++;
    } else if (row.trialEndsAt + TRIAL_GRACE_MS > now) {
      await enqueue(env, {
        workspaceId: row.workspaceId,
        periodId,
        kind: "trial_ended_owner",
        revision,
        now,
      });
      attempted++;
    } else {
      await enqueue(env, {
        workspaceId: row.workspaceId,
        periodId,
        kind: "trial_grace_ended_owner",
        revision,
        now,
      });
      attempted++;
    }
    if (row.trialEndsAt <= now && env.BILLING_ALERT_EMAIL?.trim()) {
      await enqueue(env, {
        workspaceId: row.workspaceId,
        periodId,
        kind: "trial_ended_operator",
        revision,
        now,
      });
      attempted++;
    }
  }
  return attempted;
}

async function claimJob(env: Env, id: string, now: number) {
  return (
    await createDb(env).all<{ id: string }>(
      sql`update billing_notification_jobs set state='processing',attempts=attempts+1,updated_at=${now}
        where id=${id} and attempts<${MAX_ATTEMPTS}
        and ((state in ('pending','failed') and next_attempt_at<=${now}) or (state='processing' and updated_at<=${now - PROCESSING_LEASE_MS}))
        returning id`,
    )
  )[0];
}

/** Deliver a bounded batch. Failed or abandoned claims become retryable. */
export async function deliverBillingNotifications(
  env: Env,
  limit = 25,
  now = Date.now(),
) {
  const config = billingConfig(env);
  if (config.mode === "self_hosted") return { sent: 0, failed: 0 };
  const db = createDb(env);
  const candidates = await db.all<{ id: string }>(
    sql`select id from billing_notification_jobs
      where attempts<${MAX_ATTEMPTS}
      and ((state in ('pending','failed') and next_attempt_at<=${now}) or (state='processing' and updated_at<=${now - PROCESSING_LEASE_MS}))
      order by next_attempt_at,id limit ${Math.max(1, Math.min(limit, 100))}`,
  );
  let sent = 0;
  let failed = 0;
  for (const candidate of candidates) {
    if (!(await claimJob(env, candidate.id, now))) continue;
    const [job] = await db.all<NotificationJob>(
      sql`select j.id,j.workspace_id as "workspaceId",j.period_id as "periodId",j.kind,j.entitlement_revision as "entitlementRevision",j.attempts,
        u.name as "ownerName",u.email as "ownerEmail",a.trial_ends_at as "trialEndsAt",
        p.allowance as "periodAllowance",p.admission_ceiling as "periodCeiling",p.persisted_count as "periodPersisted",p.reserved_count as "periodReserved"
        from billing_notification_jobs j
        join workspaces w on w.id=j.workspace_id
        join "user" u on u.id=w.owner_user_id
        join billing_accounts a on a.workspace_id=j.workspace_id and a.environment=${config.environment}
        left join billing_usage_periods p on p.id=j.period_id and p.workspace_id=j.workspace_id
        where j.id=${candidate.id} and j.state='processing' limit 1`,
    );
    try {
      if (!job) throw new Error("Billing notification subject is unavailable");
      const content = emailContent(job, env);
      const result = await sendTemplateEmail(env, {
        to: content.to,
        subject: content.subject,
        template: createElement(BillingNoticeEmail, {
          preview: content.preview,
          eyebrow: content.eyebrow,
          title: content.title,
          body: content.body,
          detail: content.detail,
          billingUrl: billingUrl(env),
          actionLabel: content.actionLabel,
        }),
      });
      await db.run(
        sql`update billing_notification_jobs set state='sent',provider_message_id=${result.messageId},bounded_error=null,updated_at=${Date.now()} where id=${candidate.id} and state='processing'`,
      );
      sent++;
    } catch (error) {
      const attempts = job?.attempts ?? MAX_ATTEMPTS;
      await db.run(
        sql`update billing_notification_jobs set state='failed',next_attempt_at=${nextAttemptAt(attempts, now)},bounded_error=${boundedError(error)},updated_at=${Date.now()} where id=${candidate.id} and state='processing'`,
      );
      failed++;
    }
  }
  return { sent, failed };
}

export async function repairBillingNotifications(env: Env) {
  await enqueueTrialNotifications(env);
  return deliverBillingNotifications(env);
}
