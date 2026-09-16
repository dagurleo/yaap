import { classifyBot, isBotTrackingPath } from "./bots";
export { classifyBot, isBotTrackingPath } from "./bots";
export type { BotCategory, BotClassification } from "./bots";

export type BotTrackingOptions = {
  siteId: string;
  endpoint: string;
  token: string;
  publicOrigin?: string;
  /** Receives delivery failures without affecting the website response. */
  onError?: (error: unknown) => void;
};
export type BackgroundContext = { waitUntil(promise: Promise<unknown>): void };

/** Call once per request. Await in long-lived servers; use waitUntil on edge runtimes. */
export function trackBotRequest(
  request: Request,
  options: BotTrackingOptions,
  context?: BackgroundContext,
  response?: Response,
): Promise<void> {
  const work = (async () => {
    if (!["GET", "HEAD"].includes(request.method)) return;
    const userAgent = request.headers.get("user-agent") ?? "";
    if (!classifyBot(userAgent)) return;
    const url = new URL(request.url);
    if (!isBotTrackingPath(url.pathname)) return;
    const endpoint = new URL(options.endpoint);
    if (
      !["https:", "http:"].includes(endpoint.protocol) ||
      endpoint.username ||
      endpoint.password
    )
      throw new Error("Invalid bot tracking endpoint");
    if (url.origin === endpoint.origin && url.pathname === endpoint.pathname)
      return;
    const origin = options.publicOrigin
      ? new URL(options.publicOrigin).origin
      : url.origin;
    const result = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${options.token}`,
      },
      body: JSON.stringify({
        siteId: options.siteId,
        id: crypto.randomUUID(),
        url: origin + url.pathname,
        userAgent: userAgent.slice(0, 2048),
        ...(response ? { statusCode: response.status } : {}),
      }),
      redirect: "error",
      signal: AbortSignal.timeout(3000),
    });
    if (!result.ok) throw new Error(`Bot tracking failed (${result.status})`);
  })().catch((error: unknown) => {
    try {
      options.onError?.(error);
    } catch {
      /* Tracking must never break the site. */
    }
  });
  context?.waitUntil(work);
  return work;
}
