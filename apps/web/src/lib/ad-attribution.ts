import { HttpError } from "../http";

/** Reporting-only context. Raw click IDs and customer matching data are not accepted. */
export interface AdAttribution {
  version: 1;
  provider: "google" | "meta";
  accountId: string | null;
  campaignId: string;
  groupId: string | null;
  adId: string | null;
  touchId: string;
  touchedAt: number;
  storage: "granted";
  consentPolicy: string;
}
const keys = [
  "version",
  "provider",
  "accountId",
  "campaignId",
  "groupId",
  "adId",
  "touchId",
  "touchedAt",
  "storage",
  "consentPolicy",
];
const platformId = (v: unknown) =>
  typeof v === "string" && /^\d{1,32}$/.test(v);
export function adAttribution(
  value: unknown,
  event: {
    version: number;
    visitorId?: string | null;
    sessionId?: string | null;
    receivedAt: number;
  },
): AdAttribution | undefined {
  if (value === undefined || value === null) return;
  const fail = () => {
    throw new HttpError(400, "Invalid advertising attribution");
  };
  if (typeof value !== "object" || Array.isArray(value)) return fail();
  const v = value as Record<string, unknown>;
  if (
    event.version !== 2 ||
    !event.visitorId ||
    !event.sessionId ||
    Object.keys(v).length !== keys.length ||
    Object.keys(v).some((key) => !keys.includes(key)) ||
    v.version !== 1 ||
    !["google", "meta"].includes(v.provider as string) ||
    !platformId(v.campaignId) ||
    ![v.accountId, v.groupId, v.adId].every(
      (id) => id === null || platformId(id),
    ) ||
    typeof v.touchId !== "string" ||
    !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(
      v.touchId,
    ) ||
    !Number.isSafeInteger(v.touchedAt) ||
    !Number.isSafeInteger(event.receivedAt) ||
    (v.touchedAt as number) > event.receivedAt + 300000 ||
    // Client retention is 30 minutes; allow five minutes of transit/clock skew.
    (v.touchedAt as number) < event.receivedAt - 35 * 60 * 1000 ||
    v.storage !== "granted" ||
    typeof v.consentPolicy !== "string" ||
    !/^[a-zA-Z0-9_.-]{1,64}$/.test(v.consentPolicy)
  )
    return fail();
  return {
    version: 1,
    provider: v.provider as AdAttribution["provider"],
    accountId: v.accountId as string | null,
    campaignId: v.campaignId as string,
    groupId: v.groupId as string | null,
    adId: v.adId as string | null,
    touchId: (v.touchId as string).toLowerCase(),
    touchedAt: v.touchedAt as number,
    storage: "granted",
    consentPolicy: v.consentPolicy,
  };
}

export function adAttributionColumns(value: AdAttribution | undefined) {
  return {
    adProvider: value?.provider ?? null,
    adAccountId: value?.accountId ?? null,
    adCampaignId: value?.campaignId ?? null,
    adGroupId: value?.groupId ?? null,
    adId: value?.adId ?? null,
    adTouchId: value?.touchId ?? null,
    adTouchedAt: value?.touchedAt ?? null,
    adConsentPolicy: value?.consentPolicy ?? null,
  };
}
