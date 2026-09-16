export interface AnalyticsEvent {
  adAttribution?: import("./lib/ad-attribution").AdAttribution;
  properties?: import("./lib/event-properties").EventProperties;
  version: 1 | 2;
  id: string;
  siteId: string;
  name: string;
  path: string;
  receivedAt: number;
  visitorId?: string | null;
  sessionId?: string | null;
  referrerHost?: string | null;
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
  country?: string | null;
  region?: string | null;
  city?: string | null;
  browser?: string | null;
  os?: string | null;
  device?: string | null;
}

export interface BillingReceiptMessage {
  kind: "billing_receipt";
  receiptId: string;
}

export type EventQueueMessage = AnalyticsEvent | BillingReceiptMessage;

export interface Env {
  /** Optional site for server-side bot tracking on this installation’s homepage. */
  YAAP_SELF_TRACKING_SITE_ID?: string;
  /** Synthetic site used by /demo; never configure a customer site here. */
  YAAP_DEMO_SITE_ID?: string;
  DB?: D1Database;
  DATABASE_PROVIDER?: "d1" | "postgres";
  HYPERDRIVE?: Hyperdrive;
  /** Local development only; deployed Workers use HYPERDRIVE. */
  DATABASE_URL?: string;
  EVENTS: Queue<EventQueueMessage>;
  EVENTS_DLQ: Queue<EventQueueMessage>;
  ASSETS: Fetcher;
  BETTER_AUTH_SECRET: string;
  BOOTSTRAP_SECRET: string;
  BETTER_AUTH_URL?: string;
  EMAIL?: SendEmail;
  EMAIL_FROM?: string;
  EMAIL_REPLY_TO?: string;
  /** Receives operational billing notices such as trial expirations. */
  BILLING_ALERT_EMAIL?: string;
  YAAP_HOSTING_MODE?: "self_hosted" | "hosted";
  POLAR_ENVIRONMENT?: "sandbox" | "production";
  POLAR_ACCESS_TOKEN?: string;
  POLAR_WEBHOOK_SECRET?: string;
  /** JSON object mapping each internal billing plan key to a Polar product UUID. */
  POLAR_PRODUCT_IDS?: string;
}
