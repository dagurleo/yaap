import { Buffer } from "node:buffer";
import { createHmac, timingSafeEqual } from "node:crypto";
import { Webhook } from "standardwebhooks";
import { HttpError, isRecord } from "../http";
import { visitorUuid } from "./identity";
import type { PaymentInput, PaymentMode } from "./payments";
import type { WebhookProvider } from "../lib/payment-providers";

function identity(metadata: Record<string, unknown>) {
  // Missing/invalid metadata never loses a legitimate payment; it remains unattributed.
  const identityEnabled =
    (metadata.os_analytics_identity_enabled === undefined
      ? metadata.os_analytics_consent === "true"
      : metadata.os_analytics_identity_enabled === "true" ||
        metadata.os_analytics_identity_enabled === true) &&
    typeof metadata.os_analytics_visitor_id === "string" &&
    visitorUuid.test(metadata.os_analytics_visitor_id);
  return {
    visitorId: identityEnabled
      ? (metadata.os_analytics_visitor_id as string)
      : null,
    identityEnabled,
  };
}
function stripe(
  request: Request,
  raw: Uint8Array,
  secret: string,
  mode: PaymentMode,
): PaymentInput | null {
  const parts = (request.headers.get("stripe-signature") ?? "").split(",");
  const times = parts.filter((p) => p.startsWith("t="));
  const timestamp = times.length === 1 ? times[0].slice(2) : "";
  if (
    !/^\d+$/.test(timestamp) ||
    Math.abs(Date.now() / 1000 - Number(timestamp)) > 300
  )
    throw new HttpError(400, "Invalid webhook signature");
  const expected = createHmac("sha256", secret)
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
    event = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(raw));
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
    return null;
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
    return null;
  return {
    id: charge.id as string,
    mode,
    amount: charge.amount_captured as number,
    refundedAmount: charge.amount_refunded as number,
    currency: charge.currency as string,
    paidAt: typeof charge.created === "number" ? charge.created * 1000 : NaN,
    ...identity(isRecord(charge.metadata) ? charge.metadata : {}),
  };
}
function polar(
  request: Request,
  raw: Uint8Array,
  secret: string,
  mode: PaymentMode,
): PaymentInput | null {
  let event: unknown;
  try {
    // Polar treats the displayed secret as raw UTF-8, including any prefix.
    event = new Webhook(Buffer.from(secret, "utf8").toString("base64")).verify(
      new TextDecoder("utf-8", { fatal: true }).decode(raw),
      Object.fromEntries(request.headers),
    );
  } catch {
    throw new HttpError(400, "Invalid webhook signature or JSON");
  }
  if (!isRecord(event) || typeof event.type !== "string")
    throw new HttpError(400, "Invalid webhook event");
  if (!["order.paid", "order.refunded"].includes(event.type)) return null;
  const order = event.data;
  if (!isRecord(order) || typeof order.paid !== "boolean")
    throw new HttpError(400, "Invalid order");
  if (!order.paid || order.total_amount === 0) return null;
  if (
    !Number.isSafeInteger(order.refunded_amount) ||
    !Number.isSafeInteger(order.refunded_tax_amount) ||
    (order.refunded_amount as number) < 0 ||
    (order.refunded_tax_amount as number) < 0
  )
    throw new HttpError(400, "Invalid order refund");
  return {
    id: order.id as string,
    mode,
    amount: order.total_amount as number,
    refundedAmount:
      (order.refunded_amount as number) + (order.refunded_tax_amount as number),
    currency: order.currency as string,
    // Order creation is stable across paid/refunded snapshots; modified_at is not.
    paidAt:
      typeof order.created_at === "string" ? Date.parse(order.created_at) : NaN,
    ...identity(isRecord(order.metadata) ? order.metadata : {}),
  };
}
export const paymentWebhookAdapters: Record<
  WebhookProvider,
  (
    request: Request,
    raw: Uint8Array,
    secret: string,
    mode: PaymentMode,
  ) => PaymentInput | null
> = { stripe, polar };
