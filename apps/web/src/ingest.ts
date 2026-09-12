import {
  allowedTrackingOrigin,
  excludedByTrackingRules,
} from "./lib/site-settings";
import { isKnownBot, recordIngestion } from "./server/operations";
import { visitorMetadata } from "./visitor-metadata";
import { hashIdentity, visitorUuid } from "./server/identity";
import { createDb } from "./db";
import { sql } from "drizzle-orm";
import { HttpError, json, readJson, requiredString } from "./http";
import type { AnalyticsEvent, Env, EventQueueMessage } from "./types";
import { eventProperties } from "./lib/event-properties";
import { billingConfig } from "./server/billing/config";
import {
  admitHostedEvent,
  canHostedWorkspaceCollect,
  consumeHostedReceipt,
  isBillingReceiptMessage,
} from "./server/billing/usage";

export async function ingest(request: Request, env: Env) {
  const body = await readJson(request);
  if (body.version !== 1 && body.version !== 2)
    throw new HttpError(400, "Unsupported event version");
  const siteId = requiredString(body, "siteId", 64);
  const id = requiredString(body, "id", 64);
  const name = requiredString(body, "name", 64);
  const path = requiredString(body, "path", 1024);
  const properties = eventProperties(body.properties);
  if (!/^[a-zA-Z0-9_-]+$/.test(id) || !/^[a-zA-Z0-9_.-]+$/.test(name)) {
    throw new HttpError(400, "Invalid event ID or name");
  }
  if (!path.startsWith("/") || path.startsWith("//"))
    throw new HttpError(400, "Invalid path");
  const site = await createDb(env).findSite(siteId);
  // Origin checks limit browser misuse; a public site ID is never a secret.
  const requestOrigin = request.headers.get("origin");
  if (
    !site ||
    !allowedTrackingOrigin(requestOrigin, site.origin, site.trackingRules)
  )
    throw new HttpError(403, "Unknown site or origin");
  if (excludedByTrackingRules(requestOrigin, path, site.trackingRules)) {
    return json({ ignored: "exclusion" }, 202, {
      "Access-Control-Allow-Origin": requestOrigin,
      Vary: "Origin",
    });
  }
  if (site.excludeBots && isKnownBot(request)) {
    await recordIngestion(env, siteId, "bots");
    return json({ ignored: "bot" }, 202, {
      "Access-Control-Allow-Origin": requestOrigin,
      Vary: "Origin",
    });
  }
  const event: AnalyticsEvent = {
    version: body.version,
    id,
    siteId,
    name,
    path: path.split(/[?#]/)[0],
    receivedAt: Date.now(),
    properties,
    ...visitorMetadata(request),
  };
  if (body.version === 2) {
    if (body.visitorId != null || body.sessionId != null) {
      if (
        (body.identityEnabled === undefined
          ? body.consent !== true
          : body.identityEnabled !== true) ||
        typeof body.visitorId !== "string" ||
        typeof body.sessionId !== "string" ||
        !visitorUuid.test(body.visitorId) ||
        !visitorUuid.test(body.sessionId)
      )
        throw new HttpError(400, "Invalid visitor/session identifiers");
      const hash = (kind: string, id: string) =>
        hashIdentity(env.BETTER_AUTH_SECRET, siteId, kind, id);
      event.visitorId = hash("visitor", body.visitorId);
      event.sessionId = hash(
        "session",
        `${body.visitorId.toLowerCase()}:${body.sessionId}`,
      );
    }
    const campaign = (key: string) => {
      const value = body[key];
      if (value === undefined || value === null || value === "") return null;
      if (
        typeof value !== "string" ||
        value.length > 120 ||
        !/^[a-zA-Z0-9 _~.\-]+$/.test(value)
      )
        throw new HttpError(400, `Invalid ${key}`);
      return value.trim() || null;
    };
    event.utmSource = campaign("utmSource");
    event.utmMedium = campaign("utmMedium");
    event.utmCampaign = campaign("utmCampaign");
    event.referrerHost = null;
    if (body.referrer) {
      if (typeof body.referrer !== "string" || body.referrer.length > 2048)
        throw new HttpError(400, "Invalid referrer");
      let referrer: URL;
      try {
        referrer = new URL(body.referrer);
      } catch {
        throw new HttpError(400, "Invalid referrer");
      }
      if (
        !["http:", "https:"].includes(referrer.protocol) ||
        referrer.username ||
        referrer.password
      )
        throw new HttpError(400, "Invalid referrer");
      if (
        !allowedTrackingOrigin(referrer.origin, site.origin, {
          ...site.trackingRules,
          allowAllDomains: false,
        })
      )
        event.referrerHost = referrer.hostname;
    }
  }
  if (body.presence === true && (!event.visitorId || !event.sessionId))
    throw new HttpError(400, "Presence requires consented identity");
  const hosted = billingConfig(env).mode === "hosted";
  if (
    body.presence === true &&
    hosted &&
    !(await canHostedWorkspaceCollect(env, site.workspaceId, event.receivedAt))
  ) {
    return json(
      {
        accepted: false,
        reason: "collection_paused",
        retryable: false,
      },
      409,
      {
        "Access-Control-Allow-Origin": requestOrigin,
        Vary: "Origin",
      },
    );
  }
  if (event.visitorId && event.sessionId && body.visible === true) {
    const presence = {
      siteId,
      visitorId: event.visitorId,
      sessionId: event.sessionId,
      path: event.path,
      receivedAt: event.receivedAt,
      country: event.country ?? null,
      source: event.utmSource
        ? `Campaign · ${event.utmSource}`
        : event.referrerHost
          ? `Referral · ${event.referrerHost}`
          : "Direct / unknown",
    };
    await createDb(env).touchPresence(presence);
  }
  if (body.presence === true) {
    return json({ accepted: true, id }, 202, {
      "Access-Control-Allow-Origin": requestOrigin,
      Vary: "Origin",
    });
  }
  if (hosted) {
    const admission = await admitHostedEvent(
      env,
      event,
      site.workspaceId,
      site.name,
    );
    if (!admission.accepted) {
      return json(
        {
          accepted: false,
          reason: admission.reason,
          retryable: admission.retryable,
        },
        409,
        {
          "Access-Control-Allow-Origin": requestOrigin,
          Vary: "Origin",
        },
      );
    }
  } else {
    try {
      await env.EVENTS.send(event);
    } catch (error) {
      await recordIngestion(env, siteId, "enqueueFailures");
      throw error;
    }
  }
  await recordIngestion(env, siteId, "queued");
  return json({ accepted: true, id }, 202, {
    "Access-Control-Allow-Origin": requestOrigin,
    Vary: "Origin",
  });
}

export async function consume(
  batch: MessageBatch<EventQueueMessage>,
  env: Env,
) {
  const db = createDb(env);
  const hosted = billingConfig(env).mode === "hosted";
  for (const message of batch.messages) {
    const event = message.body;
    // Retried writes use the same (siteId, id) primary key, including replay.
    try {
      if (isBillingReceiptMessage(event)) {
        if (!hosted) throw new Error("Unexpected billing receipt");
        const result = await consumeHostedReceipt(env, event.receiptId);
        if (result !== "terminal") {
          const receipt = await db.all<{ siteId: string }>(
            sql`select site_id as "siteId" from billing_event_receipts where id=${event.receiptId} limit 1`,
          );
          if (receipt[0])
            await recordIngestion(
              env,
              receipt[0].siteId,
              result === "stored"
                ? "stored"
                : result === "expired"
                  ? "expired"
                  : "duplicates",
            );
        }
        message.ack();
        continue;
      }
      // Hosted writes require a durable admission receipt. Raw messages can only
      // be produced by self-hosted deployments or an old, incompatible producer.
      if (hosted) {
        console.error("hosted_raw_event_rejected", { messageId: message.id });
        await recordIngestion(env, event.siteId, "writeFailures");
        message.ack();
        continue;
      }
      if (event.version !== 1 && event.version !== 2)
        throw new Error("Unsupported queued event");
      event.properties = eventProperties(event.properties);
      const site = await db.findSite(event.siteId);
      if (
        site?.eventRetentionDays &&
        event.receivedAt < Date.now() - site.eventRetentionDays * 86400000
      ) {
        await recordIngestion(env, event.siteId, "expired");
        message.ack();
        continue;
      }
      const inserted = await db.insertEvent(event);
      await recordIngestion(
        env,
        event.siteId,
        inserted ? "stored" : "duplicates",
      );
      message.ack();
    } catch {
      console.error("event_write_failed", { messageId: message.id });
      if ("siteId" in event && event.siteId)
        await recordIngestion(env, event.siteId, "writeFailures");
      message.retry();
    }
  }
}
