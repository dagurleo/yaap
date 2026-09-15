/** Shared provider catalog; verification and normalization stay server-side. */
export const paymentProviders = {
  stripe: {
    label: "Stripe",
    events: ["charge.succeeded", "charge.captured", "charge.refunded"],
    secretFields: { test: "stripeTestSecret", live: "stripeLiveSecret" },
    secretPlaceholder: "whsec_…",
  },
  polar: {
    label: "Polar",
    events: ["order.paid", "order.refunded"],
    secretFields: { test: "polarTestSecret", live: "polarLiveSecret" },
    secretPlaceholder: "Polar webhook signing secret",
  },
} as const;
export type WebhookProvider = keyof typeof paymentProviders;
export const paymentProviderIds = ["api", "stripe", "polar"] as const;
export type PaymentProvider = (typeof paymentProviderIds)[number];
export function isWebhookProvider(value: string): value is WebhookProvider {
  return Object.hasOwn(paymentProviders, value);
}
export function validWebhookSecret(provider: WebhookProvider, secret: unknown) {
  return (
    typeof secret === "string" &&
    (provider === "stripe"
      ? /^whsec_[a-zA-Z0-9]{16,256}$/.test(secret)
      : /^[\x21-\x7e]{16,256}$/.test(secret))
  );
}
