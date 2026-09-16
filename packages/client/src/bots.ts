/** User-agent claims, not proof of crawler identity. Keep specific tokens first. */
export type BotCategory = "ai_answers" | "indexing" | "training" | "other";
export type BotClassification = {
  name: string;
  provider: string;
  category: BotCategory;
};
const crawlers: [string, string, BotCategory][] = [
  ["ChatGPT-User", "OpenAI", "ai_answers"],
  ["OAI-SearchBot", "OpenAI", "indexing"],
  ["GPTBot", "OpenAI", "training"],
  ["Claude-User", "Anthropic", "ai_answers"],
  ["Claude-SearchBot", "Anthropic", "indexing"],
  ["ClaudeBot", "Anthropic", "training"],
  ["Perplexity-User", "Perplexity", "ai_answers"],
  ["PerplexityBot", "Perplexity", "indexing"],
  ["Googlebot", "Google", "indexing"],
  ["bingbot", "Microsoft", "indexing"],
  ["Applebot", "Apple", "indexing"],
  ["DuckDuckBot", "DuckDuckGo", "indexing"],
  ["facebookexternalhit", "Meta", "other"],
  ["Twitterbot", "X", "other"],
];
const rules = crawlers.map(([name, provider, category]) => ({
  pattern: new RegExp(`(?:^|[^a-z0-9_-])${name}(?=[/;\\s)]|$)`, "i"),
  bot: { name, provider, category },
}));
export function classifyBot(userAgent: string): BotClassification | null {
  const ua = userAgent.slice(0, 2048);
  for (const { pattern, bot } of rules) if (pattern.test(ua)) return bot;
  if (
    /bot\b|crawler|spider|slurp|headlesschrome|phantomjs|lighthouse|facebookexternalhit|\bpreview\b|curl\/|wget\/|python-requests|python-urllib|go-http-client/i.test(
      ua,
    )
  )
    return { name: "Other automation", provider: "Unknown", category: "other" };
  return null;
}

/** Keep discovery documents and content files, including XML and Markdown. */
export function isBotTrackingPath(path: string) {
  return (
    !/^\/(?:api|_next|_nuxt|assets|static)(?:\/|$)/i.test(path) &&
    !/\.(?:js|mjs|css|map|png|jpe?g|gif|webp|avif|svg|ico|woff2?|ttf|otf|mp[34]|webm|wav|zip|gz)$/i.test(
      path,
    )
  );
}
