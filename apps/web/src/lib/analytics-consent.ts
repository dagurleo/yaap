export type AnalyticsChoice = "accepted" | "rejected" | "dismissed" | "unknown";
export const analyticsConsentKey = "yaap:analytics-consent:v1";
const changeEvent = "yaap:analytics-consent-change";
const lifetime = 180 * 24 * 60 * 60 * 1000;
let fallback: string | undefined;

export function getAnalyticsChoice(): AnalyticsChoice {
  if (typeof window === "undefined") return "unknown";
  try {
    let raw: string | null | undefined = fallback;
    if (raw === undefined) {
      try {
        raw = localStorage.getItem(analyticsConsentKey);
      } catch {}
    }
    const saved = JSON.parse(raw ?? "null");
    if (
      saved &&
      (saved.choice === "accepted" ||
        saved.choice === "rejected" ||
        saved.choice === "dismissed") &&
      typeof saved.expiresAt === "number" &&
      saved.expiresAt > Date.now() &&
      saved.expiresAt <= Date.now() + lifetime
    )
      return saved.choice;
  } catch {}
  return "unknown";
}

export function setAnalyticsChoice(
  choice: Exclude<AnalyticsChoice, "unknown">,
) {
  fallback = JSON.stringify({ choice, expiresAt: Date.now() + lifetime });
  try {
    localStorage.setItem(analyticsConsentKey, fallback);
    fallback = undefined;
  } catch {}
  window.dispatchEvent(new Event(changeEvent));
}

export function subscribeAnalyticsChoice(listener: () => void) {
  const storageChanged = (event: StorageEvent) => {
    if (event.key === analyticsConsentKey || event.key === null) {
      fallback = undefined;
      listener();
    }
  };
  window.addEventListener(changeEvent, listener);
  window.addEventListener("storage", storageChanged);
  return () => {
    window.removeEventListener(changeEvent, listener);
    window.removeEventListener("storage", storageChanged);
  };
}
