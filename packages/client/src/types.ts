/** Values accepted by YAAP custom events. */
export type EventProperties = Record<string, string | number | boolean>;

export interface AnalyticsOptions {
  siteId: string;
  /** YAAP server URL. Defaults to https://yaap.dagurleo.workers.dev. */
  host?: string;
  /** Enable visitor/session identifiers. Defaults to true. */
  identifiers?: boolean;
  /** Start paused when collection must wait for a visitor's choice. */
  tracking?: "active" | "paused";
}

export interface Analytics {
  track(name: string, properties?: EventProperties): Promise<boolean>;
  pause(): void;
  resume(): void;
  setIdentifiers(enabled: boolean): void;
  /** Legacy alias for setIdentifiers; does not pause collection. */
  setConsent(enabled: boolean): void;
  getVisitorId(): string | null;
  /** Stop collection and release listeners, timers, and history hooks. */
  destroy(): void;
}
