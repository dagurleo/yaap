import { sql } from "drizzle-orm";
import { createDb } from "../../db";
import type { Env } from "../../types";
import { billingConfig } from "./config";

export const TRIAL_POLICY_VERSION = 2 as const;
export const TRIAL_DURATION_MS = 14 * 24 * 60 * 60 * 1000;
export const TRIAL_GRACE_MS = 3 * 24 * 60 * 60 * 1000;
export const TRIAL_EVENT_ALLOWANCE = 100_000;
export const TRIAL_ADMISSION_CEILING = 110_000;

export async function activateHostedTrialForVerifiedOwner(
  env: Env,
  userId: string,
  now = Date.now(),
) {
  const config = billingConfig(env);
  if (config.mode === "self_hosted") return null;
  const db = createDb(env);
  const [owner] = await db.all<{ workspaceId: string }>(
    sql`select w.id as "workspaceId" from workspaces w join "user" u on u.id=w.owner_user_id
      where w.owner_user_id=${userId} and u.email_verified=1 limit 1`,
  );
  if (!owner) return null;
  const endsAt = now + TRIAL_DURATION_MS;
  const periodId = `trial:${config.environment}:${owner.workspaceId}`;
  await db.atomic([
    sql`insert into billing_accounts(workspace_id,environment,trial_starts_at,trial_ends_at,lifecycle_policy_version,created_at,updated_at)
      values(${owner.workspaceId},${config.environment},${now},${endsAt},${TRIAL_POLICY_VERSION},${now},${now})
      on conflict(workspace_id) do update set trial_starts_at=excluded.trial_starts_at,trial_ends_at=excluded.trial_ends_at,updated_at=excluded.updated_at
      where billing_accounts.environment=excluded.environment and billing_accounts.trial_starts_at is null`,
    sql`update billing_accounts set lifecycle_policy_version=${TRIAL_POLICY_VERSION},updated_at=${now}
      where workspace_id=${owner.workspaceId} and environment=${config.environment} and trial_starts_at is not null
      and lifecycle_policy_version<${TRIAL_POLICY_VERSION}
      and not exists(select 1 from billing_subscriptions where workspace_id=${owner.workspaceId} and environment=${config.environment})`,
    sql`insert into billing_usage_periods(id,workspace_id,source,source_id,plan_key,plan_version,starts_at,ends_at,allowance,admission_ceiling,persisted_count,reserved_count,created_at,updated_at)
      select ${periodId},workspace_id,'trial',workspace_id,null,lifecycle_policy_version,trial_starts_at,trial_ends_at+${TRIAL_GRACE_MS},${TRIAL_EVENT_ALLOWANCE},${TRIAL_ADMISSION_CEILING},0,0,created_at,updated_at
      from billing_accounts where workspace_id=${owner.workspaceId} and environment=${config.environment} and trial_starts_at is not null
      on conflict(id) do update set ends_at=excluded.ends_at,admission_ceiling=excluded.admission_ceiling,plan_version=excluded.plan_version,updated_at=${now}
      where billing_usage_periods.source='trial' and (billing_usage_periods.ends_at!=excluded.ends_at or billing_usage_periods.admission_ceiling!=excluded.admission_ceiling or billing_usage_periods.plan_version!=excluded.plan_version)
      and not exists(select 1 from billing_subscriptions where workspace_id=${owner.workspaceId} and environment=${config.environment})`,
  ]);
  const [trial] = await db.all<{
    startsAt: number;
    endsAt: number;
  }>(
    sql`select trial_starts_at as "startsAt",trial_ends_at as "endsAt" from billing_accounts
      where workspace_id=${owner.workspaceId} and environment=${config.environment} limit 1`,
  );
  if (!trial)
    throw new Error("Hosted billing environment does not match the account");
  return {
    workspaceId: owner.workspaceId,
    periodId,
    ...trial,
    collectionEndsAt: trial.endsAt + TRIAL_GRACE_MS,
  };
}
