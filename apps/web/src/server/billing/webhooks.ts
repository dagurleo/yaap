import {
  validateEvent,
  WebhookVerificationError,
} from "@polar-sh/sdk/webhooks";
import { sql } from "drizzle-orm";
import { createDb } from "../../db";
import { HttpError, isRecord, json, readBody } from "../../http";
import type { Env } from "../../types";
import { billingConfig } from "./config";
import { createBillingProvider, type BillingProvider } from "./polar";
import { reconcileWorkspace } from "./provider-service";

type ReceiptRow = {
  eventId: string;
  subjectId: string | null;
  state: "pending" | "processing" | "complete" | "failed";
  attempts: number;
};

function value(object: unknown, key: string) {
  return isRecord(object) ? object[key] : undefined;
}

function externalSubject(event: unknown) {
  const data = value(event, "data");
  const direct = value(data, "externalCustomerId") ?? value(data, "externalId");
  if (typeof direct === "string" && direct) return direct;
  const customer = value(data, "customer");
  const nested = value(customer, "externalId");
  return typeof nested === "string" && nested ? nested : null;
}

function boundedError(error: unknown) {
  return (error instanceof Error ? error.message : "Unknown webhook error")
    .replace(/[\r\n]+/g, " ")
    .slice(0, 500);
}

export async function processPolarWebhookReceipt(
  env: Env,
  eventId: string,
  injectedProvider?: BillingProvider,
) {
  const config = billingConfig(env);
  if (config.mode !== "hosted") return "ignored" as const;
  const db = createDb(env);
  const [receipt] = await db.all<ReceiptRow>(
    sql`select event_id as "eventId",subject_id as "subjectId",state,attempts from billing_webhook_receipts
      where environment=${config.environment} and event_id=${eventId} limit 1`,
  );
  if (!receipt || receipt.state === "complete") return "complete" as const;
  const now = Date.now();
  await db.run(
    sql`update billing_webhook_receipts set state='processing',attempts=attempts+1,retry_at=${now + 60_000},bounded_error=null
      where environment=${config.environment} and event_id=${eventId} and state in ('pending','failed','processing')`,
  );
  try {
    if (receipt.subjectId)
      await reconcileWorkspace(
        env,
        receipt.subjectId,
        injectedProvider ?? createBillingProvider(config),
      );
    await db.run(
      sql`update billing_webhook_receipts set state='complete',completed_at=${Date.now()},bounded_error=null
        where environment=${config.environment} and event_id=${eventId}`,
    );
    return "complete" as const;
  } catch (error) {
    const attempts = receipt.attempts + 1;
    const retryAt =
      now + Math.min(60 * 60_000, 2 ** Math.min(attempts, 6) * 15_000);
    await db.run(
      sql`update billing_webhook_receipts set state='failed',retry_at=${retryAt},bounded_error=${boundedError(error)}
        where environment=${config.environment} and event_id=${eventId}`,
    );
    return "failed" as const;
  }
}

export async function polarWebhook(
  request: Request,
  env: Env,
  injectedProvider?: BillingProvider,
) {
  const config = billingConfig(env);
  if (config.mode !== "hosted")
    throw new HttpError(404, "Hosted billing is not enabled");
  if (request.method !== "POST") throw new HttpError(405, "Method not allowed");
  const eventId = request.headers.get("webhook-id")?.trim();
  if (!eventId || eventId.length > 200)
    throw new HttpError(400, "Invalid webhook ID");
  const bytes = await readBody(request, 65_536);
  let event: ReturnType<typeof validateEvent>;
  try {
    event = validateEvent(
      new TextDecoder("utf-8", { fatal: true }).decode(bytes),
      Object.fromEntries(request.headers),
      config.webhookSecret,
    );
  } catch (error) {
    if (error instanceof WebhookVerificationError)
      throw new HttpError(403, "Invalid webhook signature");
    throw new HttpError(400, "Invalid webhook payload");
  }
  const eventType = event.type;
  const subjectId = externalSubject(event);
  const db = createDb(env);
  const now = Date.now();
  await db.run(
    sql`insert into billing_webhook_receipts(environment,event_id,event_type,subject_id,received_at,state,attempts,retry_at)
      values(${config.environment},${eventId},${eventType},${subjectId},${now},'pending',0,${now})
      on conflict(environment,event_id) do nothing`,
  );
  const state = await processPolarWebhookReceipt(
    env,
    eventId,
    injectedProvider,
  );
  return json({ accepted: true, state }, 202);
}

export async function repairPolarWebhookReceipts(
  env: Env,
  injectedProvider?: BillingProvider,
  limit = 10,
) {
  const config = billingConfig(env);
  if (config.mode !== "hosted") return 0;
  const now = Date.now();
  const rows = await createDb(env).all<{ eventId: string }>(
    sql`select event_id as "eventId" from billing_webhook_receipts
      where environment=${config.environment} and state!='complete' and retry_at<=${now}
      order by retry_at,event_id limit ${limit}`,
  );
  for (const row of rows)
    await processPolarWebhookReceipt(env, row.eventId, injectedProvider);
  return rows.length;
}
