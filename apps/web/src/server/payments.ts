import { ownedSite } from "./access";
import {
  attributionPolicy,
  reconcilePaymentAttribution,
  type AttributionModel,
} from "./payment-attribution";
import type { Integration } from "../db/store";
import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { createDb } from "../db";
import { HttpError, isRecord, json, readBody, readJson } from "../http";
import { hashIdentity, visitorUuid } from "./identity";
import type { Env } from "../types";

export type PaymentMode = "test" | "live";
export type PaymentInput = {
  id: string;
  amount: number;
  currency: string;
  paidAt: number;
  mode: PaymentMode;
  refundedAmount?: number;
  visitorId?: string | null;
  identityEnabled?: boolean;
  /** Legacy identity switch, not a consent record. */
  consent?: boolean;
};
export type IntegrationChange =
  | { action: "rotateKey" | "revokeKey" }
  | { action: "attribution"; model: AttributionModel; lookbackDays: number }
  | { action: "reconcileAttribution" }
  | { action: "stripe"; mode: PaymentMode; secret: string | null };
const digest = (value: string) =>
  Buffer.from(createHash("sha256").update(value).digest());

async function secretKey(env: Env) {
  return crypto.subtle.importKey(
    "raw",
    digest(`os-analytics:payment-secrets:v1:${env.BETTER_AUTH_SECRET}`),
    "AES-GCM",
    false,
    ["encrypt", "decrypt"],
  );
}
export async function encryptSecret(
  env: Env,
  siteId: string,
  mode: PaymentMode,
  secret: string,
) {
  const iv = Buffer.from(randomBytes(12));
  const encrypted = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv,
      additionalData: new TextEncoder().encode(`${siteId}:${mode}`),
    },
    await secretKey(env),
    new TextEncoder().encode(secret),
  );
  return `${iv.toString("base64url")}.${Buffer.from(encrypted).toString("base64url")}`;
}
async function decryptSecret(
  env: Env,
  siteId: string,
  mode: PaymentMode,
  value: string,
) {
  const [iv, body] = value.split(".");
  return new TextDecoder().decode(
    await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: Buffer.from(iv, "base64url"),
        additionalData: new TextEncoder().encode(`${siteId}:${mode}`),
      },
      await secretKey(env),
      Buffer.from(body, "base64url"),
    ),
  );
}
export async function paymentSettings(
  env: Env,
  ownerId: string,
  siteId: string,
) {
  const { db } = await ownedSite(env, ownerId, siteId);
  const row = await db.paymentIntegration(siteId);
  return {
    attributionModel: row?.attributionModel ?? "first_touch",
    attributionLookbackDays: row?.attributionLookbackDays ?? 30,
    apiKeyHint: row?.apiKeyHint ?? null,
    stripeTest: !!row?.stripeTestSecret,
    stripeLive: !!row?.stripeLiveSecret,
  };
}
export async function changePaymentSettings(
  env: Env,
  ownerId: string,
  siteId: string,
  input: IntegrationChange,
) {
  const { db } = await ownedSite(env, ownerId, siteId);
  if (
    !input ||
    ![
      "rotateKey",
      "revokeKey",
      "stripe",
      "attribution",
      "reconcileAttribution",
    ].includes(input.action)
  )
    throw new HttpError(400, "Invalid integration change");
  let key: string | null = null;
  let change: Partial<Integration>;
  if (input.action === "reconcileAttribution") {
    const reconciliation = await reconcilePaymentAttribution(env, { siteId });
    return {
      key: null,
      reconciliation,
      ...(await paymentSettings(env, ownerId, siteId)),
    };
  }
  if (input.action === "attribution") {
    change = attributionPolicy(input);
  } else if (input.action === "stripe") {
    if (
      !["test", "live"].includes(input.mode) ||
      (input.secret !== null &&
        (typeof input.secret !== "string" ||
          !/^whsec_[a-zA-Z0-9]{16,256}$/.test(input.secret)))
    )
      throw new HttpError(400, "Invalid Stripe signing secret");
    change = {
      [input.mode === "test" ? "stripeTestSecret" : "stripeLiveSecret"]:
        input.secret === null
          ? null
          : await encryptSecret(env, siteId, input.mode, input.secret),
    };
  } else {
    key =
      input.action === "rotateKey"
        ? `osa_${Buffer.from(randomBytes(32)).toString("base64url")}`
        : null;
    change = {
      apiKeyHash: key ? digest(key).toString("hex") : null,
      apiKeyHint: key ? key.slice(-8) : null,
    };
  }
  await db.savePaymentIntegration(siteId, change);
  return { key, ...(await paymentSettings(env, ownerId, siteId)) };
}
function validatePayment(
  input: unknown,
): Required<Omit<PaymentInput, "consent">> {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new HttpError(400, "Invalid payment");
  const p = input as PaymentInput;
  if (typeof p.id !== "string" || !/^[a-zA-Z0-9_.:-]{1,128}$/.test(p.id))
    throw new HttpError(400, "Invalid payment ID");
  if (
    !Number.isSafeInteger(p.amount) ||
    p.amount <= 0 ||
    p.amount > 999999999999
  )
    throw new HttpError(400, "Invalid amount in minor units");
  const refundedAmount = p.refundedAmount ?? 0;
  if (
    !Number.isSafeInteger(refundedAmount) ||
    refundedAmount < 0 ||
    refundedAmount > p.amount
  )
    throw new HttpError(400, "Invalid refund amount");
  if (typeof p.currency !== "string" || !/^[a-zA-Z]{3}$/.test(p.currency))
    throw new HttpError(400, "Invalid currency");
  if (
    !Number.isSafeInteger(p.paidAt) ||
    p.paidAt < 946684800000 ||
    p.paidAt > Date.now() + 300000
  )
    throw new HttpError(400, "Invalid payment timestamp");
  if (p.mode !== "test" && p.mode !== "live")
    throw new HttpError(400, "Choose test or live mode");
  if (
    p.visitorId != null &&
    (typeof p.visitorId !== "string" ||
      !visitorUuid.test(p.visitorId) ||
      (p.identityEnabled === undefined
        ? p.consent !== true
        : p.identityEnabled !== true))
  )
    throw new HttpError(400, "Invalid visitor identifier");
  return {
    ...p,
    currency: p.currency.toUpperCase(),
    refundedAmount,
    visitorId: p.visitorId ?? null,
    identityEnabled:
      p.identityEnabled === undefined
        ? p.consent === true
        : p.identityEnabled === true,
  };
}
export async function recordPayment(
  env: Env,
  siteId: string,
  provider: "api" | "stripe",
  input: unknown,
) {
  const p = validatePayment(input);
  const site = await createDb(env).findSite(siteId);
  if (
    site?.paymentRetentionDays &&
    p.paidAt < Date.now() - site.paymentRetentionDays * 86400000
  )
    throw new HttpError(410, "Payment is outside retention");
  const visitorId = p.visitorId
    ? hashIdentity(env.BETTER_AUTH_SECRET, siteId, "visitor", p.visitorId)
    : null;
  const now = Date.now();
  // One atomic upsert handles concurrent deliveries and cumulative refunds without double counting.
  const saved = await createDb(env).savePayment({
    siteId,
    provider,
    mode: p.mode,
    externalId: p.id,
    amount: p.amount,
    refundedAmount: p.refundedAmount,
    currency: p.currency,
    paidAt: p.paidAt,
    visitorId,
    createdAt: now,
    updatedAt: now,
  });
  if (!saved)
    throw new HttpError(409, "Payment ID conflicts with an existing payment");
  await reconcilePaymentAttribution(env, {
    siteId,
    provider,
    mode: p.mode,
    externalId: p.id,
  });
  return { accepted: true, id: saved.externalId, mode: saved.mode };
}
export async function ingestPayment(
  request: Request,
  env: Env,
  siteId: string,
) {
  const token = request.headers
    .get("authorization")
    ?.match(/^Bearer (osa_[a-zA-Z0-9_-]{43})$/)?.[1];
  const settings = await createDb(env).paymentIntegration(siteId);
  if (
    !token ||
    !settings?.apiKeyHash ||
    !timingSafeEqual(digest(token), Buffer.from(settings.apiKeyHash, "hex"))
  )
    throw new HttpError(401, "Invalid payment API key");
  return json(
    await recordPayment(env, siteId, "api", await readJson(request)),
    202,
  );
}
export async function stripeWebhook(
  request: Request,
  env: Env,
  siteId: string,
  mode: string,
) {
  if (mode !== "test" && mode !== "live")
    throw new HttpError(404, "Webhook not found");
  const settings = await createDb(env).paymentIntegration(siteId);
  const encrypted =
    mode === "test" ? settings?.stripeTestSecret : settings?.stripeLiveSecret;
  if (!encrypted) throw new HttpError(404, "Webhook not configured");
  const raw = Buffer.from(await readBody(request, 65536));
  const parts = (request.headers.get("stripe-signature") ?? "").split(",");
  const times = parts.filter((p) => p.startsWith("t="));
  const timestamp = times.length === 1 ? times[0].slice(2) : "";
  if (
    !/^\d+$/.test(timestamp) ||
    Math.abs(Date.now() / 1000 - Number(timestamp)) > 300
  )
    throw new HttpError(400, "Invalid webhook signature");
  const expected = createHmac(
    "sha256",
    await decryptSecret(env, siteId, mode, encrypted),
  )
    .update(timestamp + ".")
    .update(raw)
    .digest();
  if (
    !parts.some(
      (p) =>
        /^v1=[a-f0-9]{64}$/.test(p) &&
        timingSafeEqual(expected, Buffer.from(p.slice(3), "hex")),
    )
  )
    throw new HttpError(400, "Invalid webhook signature");
  let event: unknown;
  try {
    event = JSON.parse(raw.toString("utf8"));
  } catch {
    throw new HttpError(400, "Invalid webhook JSON");
  }
  if (
    !isRecord(event) ||
    event.object !== "event" ||
    typeof event.id !== "string" ||
    typeof event.type !== "string" ||
    event.livemode !== (mode === "live")
  )
    throw new HttpError(400, "Invalid webhook event or mode");
  if (
    !["charge.succeeded", "charge.captured", "charge.refunded"].includes(
      event.type,
    )
  )
    return json({ ignored: true });
  const charge = isRecord(event.data) ? event.data.object : undefined;
  if (
    !isRecord(charge) ||
    charge.object !== "charge" ||
    charge.livemode !== event.livemode
  )
    throw new HttpError(400, "Invalid charge");
  if (
    charge.paid !== true ||
    charge.captured !== true ||
    charge.status !== "succeeded" ||
    charge.amount_captured === 0
  )
    return json({ ignored: true });
  const metadata = isRecord(charge.metadata) ? charge.metadata : {};
  // Missing/invalid metadata never loses a legitimate payment; it remains unattributed.
  const identityEnabled =
    (metadata.os_analytics_identity_enabled === undefined
      ? metadata.os_analytics_consent === "true"
      : metadata.os_analytics_identity_enabled === "true") &&
    typeof metadata.os_analytics_visitor_id === "string" &&
    visitorUuid.test(metadata.os_analytics_visitor_id);
  try {
    return json(
      await recordPayment(env, siteId, "stripe", {
        id: charge.id,
        mode,
        amount: charge.amount_captured,
        refundedAmount: charge.amount_refunded,
        currency: charge.currency,
        paidAt:
          typeof charge.created === "number" ? charge.created * 1000 : NaN,
        visitorId: identityEnabled ? metadata.os_analytics_visitor_id : null,
        identityEnabled,
      }),
    );
  } catch (error) {
    if (error instanceof HttpError && error.status === 410)
      return json({ ignored: "retention" });
    throw error;
  }
}
