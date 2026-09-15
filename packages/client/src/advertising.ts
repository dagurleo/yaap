import type { AdvertisingConsent } from "./types.js";

const statuses = ["granted", "denied", "unknown"];
export function advertisingConsent(
  value: AdvertisingConsent,
): AdvertisingConsent {
  if (
    !value ||
    ![value.storage, value.userData, value.personalization].every((state) =>
      statuses.includes(state),
    ) ||
    typeof value.policyVersion !== "string" ||
    !/^[a-zA-Z0-9_.-]{1,64}$/.test(value.policyVersion)
  )
    throw new TypeError("Invalid advertising consent");
  return {
    storage: value.storage,
    userData: value.userData,
    personalization: value.personalization,
    policyVersion: value.policyVersion,
  };
}

export interface AdAttribution {
  version: 1;
  touchId: string;
  touchedAt: number;
  provider: "google" | "meta";
  accountId: string | null;
  campaignId: string;
  groupId: string | null;
  adId: string | null;
  consentPolicy: string;
  storage: "granted";
}

/** Reporting dimensions only. Never reads click IDs, cookies or customer data. */
export function createAdvertisingContext(siteId: string) {
  const key = `os-analytics:${siteId}:advertising`;
  const ttl = 30 * 60 * 1000;
  let current: AdAttribution | undefined;
  let previousUrl: string | undefined;
  let suppressedUrl: string | undefined;
  const id = (value: unknown) =>
    typeof value === "string" && /^\d{1,32}$/.test(value) ? value : null;
  function clear() {
    current = undefined;
    previousUrl = undefined;
    // A later grant on the same landing must not resurrect withdrawn context.
    suppressedUrl = location.href;
    try {
      sessionStorage.removeItem(key);
    } catch {}
  }
  function capture(
    visitorId: string,
    consent: AdvertisingConsent,
  ): AdAttribution | undefined {
    if (consent.storage !== "granted") return;
    try {
      const now = Date.now();
      const url = new URL(location.href);
      const provider = url.searchParams.get("yaap_ad_provider");
      const dimensions = {
        provider,
        accountId: id(url.searchParams.get("yaap_ad_account")),
        campaignId: id(url.searchParams.get("yaap_ad_campaign")),
        groupId: id(url.searchParams.get("yaap_ad_group")),
        adId: id(url.searchParams.get("yaap_ad_id")),
      };
      const stored = JSON.parse(sessionStorage.getItem(key) ?? "null");
      const saved = stored?.context;
      const valid =
        stored?.visitorId === visitorId &&
        Number.isFinite(stored.lastAt) &&
        stored.lastAt <= now &&
        now - stored.lastAt < ttl &&
        saved?.version === 1 &&
        ["google", "meta"].includes(saved.provider) &&
        id(saved.campaignId) &&
        [saved.accountId, saved.groupId, saved.adId].every(
          (v) => v === null || id(v),
        ) &&
        saved.storage === "granted" &&
        typeof saved.consentPolicy === "string" &&
        /^[a-zA-Z0-9_.-]{1,64}$/.test(saved.consentPolicy) &&
        typeof saved.touchId === "string" &&
        /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(
          saved.touchId,
        ) &&
        Number.isSafeInteger(saved.touchedAt) &&
        saved.touchedAt <= now &&
        now - saved.touchedAt < ttl;
      if (!valid) current = undefined;
      else
        current = {
          version: 1,
          provider: saved.provider,
          accountId: saved.accountId,
          campaignId: saved.campaignId,
          groupId: saved.groupId,
          adId: saved.adId,
          touchId: saved.touchId,
          touchedAt: saved.touchedAt,
          storage: "granted",
          consentPolicy: saved.consentPolicy,
        };
      if (previousUrl !== url.href) {
        // document.referrer belongs to the original landing, not later SPA routes.
        const firstCapture = previousUrl === undefined;
        previousUrl = url.href;
        if (
          url.href !== suppressedUrl &&
          (provider === "google" || provider === "meta") &&
          dimensions.campaignId
        ) {
          const same =
            current &&
            Object.entries(dimensions).every(
              ([k, v]) => current?.[k as keyof AdAttribution] === v,
            );
          if (!same)
            current = {
              version: 1,
              ...dimensions,
              provider,
              campaignId: dimensions.campaignId,
              touchId: crypto.randomUUID(),
              touchedAt: now,
              storage: "granted",
              consentPolicy: consent.policyVersion,
            };
        } else if (
          provider !== null ||
          ["utm_source", "utm_medium", "utm_campaign"].some((k) =>
            url.searchParams.has(k),
          ) ||
          !stored ||
          !valid ||
          (firstCapture &&
            document.referrer &&
            new URL(document.referrer).origin !== url.origin)
        )
          current = undefined;
      }
      if (!current) {
        sessionStorage.removeItem(key);
        return;
      }
      // A policy change starts fresh collection; never relabel old context as newly consented.
      if (current.consentPolicy !== consent.policyVersion) {
        clear();
        return;
      }
      sessionStorage.setItem(
        key,
        JSON.stringify({ visitorId, lastAt: now, context: current }),
      );
      return { ...current };
    } catch {
      current = undefined;
      return;
    }
  }
  return { capture, clear };
}
