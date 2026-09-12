import { validateTimezone } from "../lib/report-timezone";
import type { Goal, Funnel } from "../db/store";
import { records } from "../db/store";
import {
  goals as goalTable,
  funnels as funnelTable,
} from "../db/analytics-schema";
import { sql, type SQL } from "drizzle-orm";
import { createDb } from "../db";
import {
  validateSiteDetails,
  validateTrackingRules,
} from "../lib/site-settings";
import { validateOperationsSettings } from "../lib/operations";
import { validateFunnel } from "../lib/funnels";
import { validateGoal } from "../server/goals";
import { siteOperations } from "../server/operations";
import { encryptSecret, paymentSettings } from "../server/payments";
import {
  grants,
  siteGrantSql,
  credentialColumns,
  type Credential,
} from "./auth";
import {
  conditionalUpdate,
  expectedRevision,
  mutate,
  type MutationContext,
} from "./mutations";
import {
  ApiError,
  choice,
  cursorCodec,
  hash,
  integer,
  invalid,
  page,
  secret,
  str,
  type Input,
  type Result,
} from "./contracts";

export function insert(table: string, values: Record<string, unknown>): SQL {
  return sql`insert into ${sql.identifier(table)} (${sql.join(
    Object.keys(values).map((k) => sql.identifier(k)),
    sql`,`,
  )}) values (${sql.join(
    Object.values(values).map((v) => sql`${v}`),
    sql`,`,
  )})`;
}
export const siteData = (site: {
  id: string;
  name: string;
  origin: string;
  createdAt: number;
  revision: string;
  timezone: string;
}) => ({
  id: site.id,
  name: site.name,
  origin: site.origin,
  createdAt: site.createdAt,
  revision: site.revision,
  timezone: site.timezone,
});
export async function management(
  ctx: MutationContext,
  origin: string,
): Promise<Result> {
  const { env, principal: p, operation: op, input: q, siteId } = ctx,
    db = createDb(env);
  const limit = integer(q.limit, 50, 100);
  const cursor = cursorCodec(env, [p.id, op, siteId], q);
  if (op === "list_sites") {
    const rows = await db.all<{
      id: string;
      name: string;
      origin: string;
      createdAt: number;
      revision: string;
      timezone: string;
    }>(sql`select id,name,origin,timezone,created_at as "createdAt",revision from sites where owner_id=${p.ownerId}
      and ${
        p.allSites
          ? sql`1=1`
          : p.siteIds.length
            ? siteGrantSql(db.provider, sql`id`, p.siteIds)
            : sql`1=0`
      }
      and ${
        q.search === undefined
          ? sql`1=1`
          : sql`lower(name) like ${
              "%" +
              str(q, "search", 120)
                .toLowerCase()
                .replace(/[\\%_]/g, "\\$&") +
              "%"
            } escape '\\'`
      }
      and created_at<=${cursor.asOf} and ${cursor.last ? sql`id>${cursor.last[0]}` : sql`1=1`} order by id limit ${limit + 1}`);
    return page(rows.map(siteData), limit, (row) => cursor.next([row.id]));
  }
  if (op === "list_api_keys") {
    const rows = await db.all<Credential>(
      sql`select ${credentialColumns} from api_credentials where owner_id=${p.ownerId} and ${cursor.last ? sql`id>${cursor.last[0]}` : sql`1=1`} order by id limit ${limit + 1}`,
    );
    return page(
      rows.map((row) => ({
        ...row,
        ownerId: undefined,
        scopes: JSON.parse(row.scopes),
        siteIds: JSON.parse(row.siteIds),
        allSites: !!row.allSites,
      })),
      limit,
      (row) => cursor.next([row.id]),
    );
  }
  if (op === "create_api_key")
    return mutate(ctx, async () => {
      const name = str(q, "name", 120).trim(),
        access = await grants(env, p.ownerId, q);
      const expiresAt = Number(q.expiresAt),
        now = Date.now();
      if (
        !Number.isSafeInteger(expiresAt) ||
        expiresAt <= now ||
        expiresAt > now + 366 * 86400000
      )
        invalid(
          "expiresAt must be a future epoch millisecond timestamp within 366 days",
        );
      const token = secret("yaap_key_"),
        id = crypto.randomUUID();
      return {
        resourceId: id,
        statements: [
          insert("api_credentials", {
            id,
            owner_id: p.ownerId,
            name,
            token_hash: hash(token),
            hint: token.slice(-8),
            scopes: JSON.stringify(access.scopes),
            site_ids: JSON.stringify(access.siteIds),
            all_sites: Number(access.allSites),
            created_at: now,
            expires_at: expiresAt,
            kind: "api",
          }),
        ],
        result: {
          status: 201,
          data: {
            id,
            name,
            token,
            hint: token.slice(-8),
            ...access,
            createdAt: now,
            expiresAt,
          },
        },
      };
    });
  if (op === "revoke_api_key")
    return mutate(ctx, async () => {
      const id = str(q, "keyId");
      const [row] = await db.all<{ id: string }>(
        sql`select id from api_credentials where id=${id} and owner_id=${p.ownerId}`,
      );
      if (!row) throw new ApiError(404, "not_found", "Credential not found");
      return {
        resourceId: id,
        statements: [
          sql`update api_credentials set revoked_at=coalesce(revoked_at,${Date.now()}) where id=${id} and owner_id=${p.ownerId}`,
        ],
        result: { data: { id, revoked: true } },
      };
    });
  if (op === "list_audit_log") {
    const rows = await db.all<{
      id: string;
      siteId: string | null;
      fields: string;
      createdAt: number;
    }>(sql`select id,actor_id as "actorId",site_id as "siteId",operation,resource_id as "resourceId",fields,created_at as "createdAt" from api_audit where owner_id=${p.ownerId}
      and ${
        p.allSites
          ? sql`1=1`
          : p.siteIds.length
            ? siteGrantSql(db.provider, sql`site_id`, p.siteIds)
            : sql`1=0`
      }
      and ${q.siteId ? sql`site_id=${q.siteId}` : sql`1=1`} and created_at<=${cursor.asOf}
      and ${cursor.last ? sql`(created_at<${cursor.last[0]} or (created_at=${cursor.last[0]} and id<${cursor.last[1]}))` : sql`1=1`} order by created_at desc,id desc limit ${limit + 1}`);
    return page(
      rows.map((row) => ({ ...row, fields: JSON.parse(row.fields) })),
      limit,
      (row) => cursor.next([row.createdAt, row.id]),
    );
  }
  if (op === "create_site")
    return mutate(ctx, async () => {
      const workspace = await db.workspaceForOwner(p.ownerId);
      if (!workspace)
        throw new ApiError(
          403,
          "owner_required",
          "An account owner is required",
        );
      const details = {
          ...validateSiteDetails(q),
          timezone: validateTimezone(q.timezone ?? "UTC"),
        },
        id = crypto.randomUUID(),
        revision = crypto.randomUUID(),
        now = Date.now();
      const statements = [
        insert("sites", {
          id,
          owner_id: p.ownerId,
          workspace_id: workspace.id,
          ...details,
          created_at: now,
          revision,
        }),
      ];
      if (!p.allSites && p.kind !== "session") {
        // Append in SQL to avoid losing another concurrent create's site grant.
        const addition =
          db.provider === "postgres"
            ? sql`(site_ids::jsonb || ${JSON.stringify([id])}::jsonb)::text`
            : sql`json_insert(site_ids,'$[#]',${id})`;
        statements.push(
          sql`update api_credentials set site_ids=${addition} where id=${p.id} and owner_id=${p.ownerId}`,
        );
      }
      return {
        resourceId: id,
        statements,
        result: {
          status: 201,
          etag: revision,
          data: {
            id,
            ...details,
            revision,
            createdAt: now,
            timezone: details.timezone,
            installationUrl: `${origin}/api/v1/sites/${id}/installation`,
          },
        },
      };
    });
  const site = await db.findSite(siteId!, p.ownerId);
  if (!site) throw new ApiError(404, "not_found", "Website not found");
  const tracking = () => ({
    ...site.trackingRules,
    excludeBots: site.excludeBots,
    revision: site.revision,
  });
  const retention = () => ({
    eventRetentionDays: site.eventRetentionDays,
    paymentRetentionDays: site.paymentRetentionDays,
    lastCleanupAt: site.lastCleanupAt,
    revision: site.revision,
  });
  if (op === "get_site") return { data: siteData(site), etag: site.revision };
  if (op === "get_tracking_rules")
    return { data: tracking(), etag: site.revision };
  if (op === "get_retention") return { data: retention(), etag: site.revision };
  if (op === "get_installation") {
    const mode = choice(q.mode, ["full", "anonymous", "paused"], "full");
    const escape = (s: string) =>
      s
        .replaceAll("&", "&amp;")
        .replaceAll('"', "&quot;")
        .replaceAll("<", "&lt;");
    return {
      data: {
        siteId: site.id,
        mode,
        trackerUrl: `${origin}/script.js`,
        snippet: `<script defer src="${escape(origin)}/script.js" data-site-id="${escape(site.id)}"${mode !== "full" ? ' data-identifiers="false"' : ""}${mode === "paused" ? ' data-tracking="paused"' : ""}></script>`,
        eventExample: 'window.osAnalytics?.track("signup", { plan: "pro" });',
        paymentEndpoint: `${origin}/payments/${site.id}`,
        deploymentRequired: true,
      },
    };
  }
  if (op === "get_ingestion_status") {
    const { site: _, ...data } = await siteOperations(env, p.ownerId, site.id);
    return { data };
  }
  if (["update_site", "update_tracking_rules", "update_retention"].includes(op))
    return mutate(ctx, async () => {
      expectedRevision(ctx, site.revision);
      let values: Input, data: Input;
      if (op === "update_site") {
        values = {
          ...validateSiteDetails({ ...site, ...q }),
          timezone: validateTimezone(q.timezone ?? site.timezone),
        };
        data = { ...siteData(site), ...values };
      } else if (op === "update_tracking_rules") {
        const rules = validateTrackingRules({ ...site.trackingRules, ...q }),
          excludeBots = q.excludeBots ?? site.excludeBots;
        if (typeof excludeBots !== "boolean")
          invalid("excludeBots must be boolean");
        values = {
          tracking_rules: JSON.stringify(rules),
          exclude_bots: Number(excludeBots),
        };
        data = { ...rules, excludeBots };
      } else {
        const policy = validateOperationsSettings({ ...site, ...q });
        values = {
          event_retention_days: policy.eventRetentionDays,
          payment_retention_days: policy.paymentRetentionDays,
        };
        data = {
          eventRetentionDays: policy.eventRetentionDays,
          paymentRetentionDays: policy.paymentRetentionDays,
          lastCleanupAt: site.lastCleanupAt,
        };
      }
      const change = conditionalUpdate(
        "sites",
        sql`id=${site.id} and owner_id=${p.ownerId}`,
        site.revision,
        values,
      );
      return {
        resourceId: site.id,
        statements: change.statements,
        result: {
          etag: change.next,
          data: { ...data, revision: change.next },
          ...(op === "update_retention"
            ? {
                meta: {
                  consequence:
                    "Expired history will be deleted by subsequent cleanup runs; changing the policy does not restore deleted history.",
                },
              }
            : {}),
        },
      };
    });
  const isGoal = op.includes("goal"),
    isFunnel = op.includes("funnel");
  if (isGoal || isFunnel) {
    const table = isGoal ? "goals" : "funnels",
      resourceId = q[isGoal ? "goalId" : "funnelId"];
    const read = (where: SQL, suffix: SQL) =>
      isGoal
        ? records(db, goalTable, "goals").find(where, suffix)
        : records(db, funnelTable, "funnels").find(where, suffix);
    if (op.startsWith("list_")) {
      const archived = choice(q.archived, ["false", "true", "all"], "false");
      const rows = await read(
        sql`site_id=${site.id} and ${archived === "all" ? sql`1=1` : sql`archived=${Number(archived === "true")}`} and created_at<=${cursor.asOf} and ${cursor.last ? sql`id>${cursor.last[0]}` : sql`1=1`}`,
        sql`order by id limit ${limit + 1}`,
      );
      return page<Goal | Funnel>(rows, limit, (row) => cursor.next([row.id]));
    }
    const current = resourceId
      ? (
          await read(sql`site_id=${site.id} and id=${resourceId}`, sql`limit 1`)
        )[0]
      : undefined;
    if (!op.startsWith("create_") && !current)
      throw new ApiError(
        404,
        "not_found",
        `${isGoal ? "Goal" : "Funnel"} not found`,
      );
    if (op.startsWith("get_"))
      return { data: current, etag: current!.revision };
    return mutate(ctx, async () => {
      if (current) expectedRevision(ctx, current.revision);
      const merged = { ...current, ...q };
      if (q.archived !== undefined && typeof q.archived !== "boolean")
        invalid("archived must be boolean");
      const normalized = isGoal ? validateGoal(merged) : validateFunnel(merged);
      const values: Input = isGoal
        ? {
            name: normalized.name,
            icon: normalized.icon,
            event_name: (normalized as ReturnType<typeof validateGoal>)
              .eventName,
            path: (normalized as ReturnType<typeof validateGoal>).path,
            conditions: JSON.stringify(
              (normalized as ReturnType<typeof validateGoal>).conditions,
            ),
            definition_key: (normalized as ReturnType<typeof validateGoal>)
              .definitionKey,
          }
        : {
            name: normalized.name,
            icon: normalized.icon,
            scope: (normalized as ReturnType<typeof validateFunnel>).scope,
            window_hours: (normalized as ReturnType<typeof validateFunnel>)
              .windowHours,
            steps: JSON.stringify(
              (normalized as ReturnType<typeof validateFunnel>).steps,
            ),
            updated_at: Date.now(),
          };
      if (q.archived !== undefined) values.archived = Number(q.archived);
      const id = current?.id ?? crypto.randomUUID(),
        now = Date.now();
      const change = current
        ? conditionalUpdate(
            table,
            sql`site_id=${site.id} and id=${id}`,
            current.revision,
            values,
          )
        : { next: crypto.randomUUID(), statements: [] as SQL[] };
      if (!current)
        change.statements.push(
          insert(table, {
            ...values,
            id,
            site_id: site.id,
            created_at: now,
            revision: change.next,
          }),
        );
      return {
        resourceId: id,
        statements: change.statements,
        result: {
          status: current ? 200 : 201,
          etag: change.next,
          data: {
            ...current,
            ...normalized,
            id,
            siteId: site.id,
            createdAt: current?.createdAt ?? now,
            archived: q.archived ?? current?.archived ?? false,
            revision: change.next,
            ...(!isGoal ? { updatedAt: now } : {}),
          },
        },
      };
    });
  }
  if (
    op.includes("payment_integration") ||
    op.includes("stripe") ||
    op.includes("payment_ingestion_key")
  ) {
    const current = await db.paymentIntegration(site.id),
      revision = current?.revision ?? "initial";
    if (op === "get_payment_integration")
      return {
        etag: revision,
        data: {
          ...(await paymentSettings(env, p.ownerId, site.id)),
          revision,
          webhooks: {
            test: `${origin}/payments/stripe/${site.id}/test`,
            live: `${origin}/payments/stripe/${site.id}/live`,
          },
        },
      };
    return mutate(ctx, async () => {
      expectedRevision(ctx, revision);
      const now = Date.now(),
        values: Input = { updated_at: now };
      let token: string | undefined;
      if (op === "set_stripe" || op === "disconnect_stripe") {
        const mode = choice(q.mode, ["test", "live"]);
        if (
          op === "set_stripe" &&
          !/^whsec_[a-zA-Z0-9]{16,256}$/.test(str(q, "secret", 262))
        )
          invalid("Invalid Stripe webhook signing secret");
        values[`stripe_${mode}_secret`] =
          op === "set_stripe"
            ? await encryptSecret(env, site.id, mode, q.secret as string)
            : null;
      } else {
        token =
          op === "rotate_payment_ingestion_key" ? secret("osa_") : undefined;
        values.api_key_hash = token ? hash(token) : null;
        values.api_key_hint = token ? token.slice(-8) : null;
      }
      const change = current
        ? conditionalUpdate(
            "payment_integrations",
            sql`site_id=${site.id}`,
            revision,
            values,
          )
        : { next: crypto.randomUUID(), statements: [] as SQL[] };
      if (!current)
        change.statements.push(
          insert("payment_integrations", {
            site_id: site.id,
            ...values,
            revision: change.next,
          }),
        );
      return {
        resourceId: site.id,
        statements: change.statements,
        result: {
          etag: change.next,
          data: {
            updated: true,
            revision: change.next,
            ...(token ? { token } : {}),
            ...(op.startsWith("disconnect") || op.startsWith("revoke")
              ? { disconnected: true }
              : {}),
          },
        },
      };
    });
  }
  throw new ApiError(404, "not_found", "Operation not found");
}
