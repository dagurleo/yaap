import { BILLING_PLANS } from "./billing-plans";

type Tool = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations: { readOnlyHint: true };
  execute: (input: Record<string, unknown>) => Promise<unknown>;
};
export type PublicModelContext = {
  registerTool: (tool: Tool, options: { signal: AbortSignal }) => Promise<void>;
};

export function publicAgentTools(origin: string, hosted: boolean): Tool[] {
  return [
    {
      name: "yaap_get_connection_info",
      description:
        "Get this Yaap installation's public API, MCP and authentication documentation URLs. Customer analytics requires separately authorized credentials.",
      inputSchema: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
      annotations: { readOnlyHint: true },
      execute: async () => ({
        origin,
        mcp: `${origin}/mcp`,
        transport: "streamable-http",
        protocolVersion: "2025-11-25",
        openapi: `${origin}/api/v1/openapi.json`,
        authentication: `${origin}/auth.md`,
        documentation: `${origin}/docs/api.md`,
        accessSettings: `${origin}/app/access`,
        authenticationMethods: [
          "personal-bearer-token",
          "owner-preregistered-oauth-pkce-for-mcp",
        ],
      }),
    },
    {
      name: "yaap_estimate_hosted_price",
      description:
        "Estimate Yaap's published monthly hosted plan for an event volume. Returns a price estimate only; does not create an account or subscription.",
      inputSchema: {
        type: "object",
        properties: {
          monthlyEvents: {
            type: "integer",
            minimum: 0,
            maximum: Number.MAX_SAFE_INTEGER,
            description:
              "Expected monthly collected events, including pageviews and custom events.",
          },
        },
        required: ["monthlyEvents"],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: true },
      execute: async ({ monthlyEvents }) => {
        if (
          typeof monthlyEvents !== "number" ||
          !Number.isSafeInteger(monthlyEvents) ||
          monthlyEvents < 0
        )
          throw new Error("monthlyEvents must be a non-negative safe integer");
        const plan = BILLING_PLANS.find(
          (candidate) => candidate.eventAllowance >= monthlyEvents,
        );
        return {
          monthlyEvents,
          hostedSignupAvailable: hosted,
          pricingUrl: `${origin}/pricing`,
          estimateOnly: true,
          ...(plan
            ? {
                currency: plan.currency,
                interval: plan.interval,
                monthlyPriceCents: plan.monthlyPriceCents,
                includedMonthlyEvents: plan.eventAllowance,
              }
            : {
                message:
                  "This volume exceeds the published tiers. See the pricing page for contact options.",
              }),
        };
      },
    },
  ];
}

export function registerPublicAgentTools(
  context: PublicModelContext,
  origin: string,
  hosted: boolean,
): () => void {
  const controller = new AbortController();
  for (const tool of publicAgentTools(origin, hosted)) {
    // This optional, evolving browser API must never break page rendering.
    try {
      Promise.resolve(
        context.registerTool(tool, { signal: controller.signal }),
      ).catch(() => {});
    } catch {
      /* Browser implementation does not support this tool definition. */
    }
  }
  return () => controller.abort();
}
