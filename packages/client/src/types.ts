/** Values accepted by YAAP custom events. */
export type EventProperties = Record<string, string | number | boolean>;

export type ConsentState = "granted" | "denied" | "unknown";
/** Site-reported choices; analytics identifiers alone never grant ad consent. */
export interface AdvertisingConsent {
  storage: ConsentState;
  userData: ConsentState;
  personalization: ConsentState;
  policyVersion: string;
}

export interface AnalyticsOptions {
  siteId: string;
  /** YAAP server URL. Defaults to https://yaap.sh. */
  host?: string;
  /** Enable visitor/session identifiers. Defaults to true. */
  identifiers?: boolean;
  /** Start paused when collection must wait for a visitor's choice. */
  tracking?: "active" | "paused";
  /** Optional ad attribution is off until storage is explicitly granted. */
  advertisingConsent?: AdvertisingConsent;
}

export interface Analytics {
  track(name: string, properties?: EventProperties): Promise<boolean>;
  pause(): void;
  resume(): void;
  setIdentifiers(enabled: boolean): void;
  /** Legacy alias for setIdentifiers; does not pause collection. */
  setConsent(enabled: boolean): void;
  /** Controls optional ad dimensions; does not enable analytics identifiers or collection. */
  setAdvertisingConsent(consent: AdvertisingConsent): void;
  getVisitorId(): string | null;
  /** Stop collection and release listeners, timers, and history hooks. */
  destroy(): void;
}
