import apiGuide from "../../../../docs/API.md?raw";
import skill from "../agent-skills/yaap-analytics/SKILL.md?raw";
import {
  policyDetails,
  repositoryUrl,
} from "../features/landing/policy-details";
import { publicPagePath } from "./public-markdown";

export const contentSignal = "search=yes, ai-input=yes, ai-train=no";
const skillPath = "/.well-known/agent-skills/yaap-analytics/SKILL.md";

export function discoveryOrigin(request: Request, configured?: string): string {
  const origin = configured || new URL(request.url).origin;
  if (new URL(origin).origin !== origin)
    throw new Error("Expected an application origin");
  return origin;
}

export function discoveryLinks(origin: string, page?: string): string {
  return [
    `<${origin}/.well-known/api-catalog>; rel="api-catalog"; type="application/linkset+json"`,
    `<${origin}/.well-known/ai-catalog.json>; rel="ai-catalog"; type="application/ai-catalog+json"`,
    `<${origin}/api/v1/openapi.json>; rel="service-desc"; type="application/json"`,
    `<${origin}/docs/api.md>; rel="service-doc"; type="text/markdown"`,
    `<${origin}/sitemap.xml>; rel="sitemap"; type="application/xml"`,
    ...(page
      ? [
          `<${origin}${page === "/" ? "/index" : page}.md>; rel="alternate"; type="text/markdown"`,
        ]
      : []),
  ].join(", ");
}

export async function agentDiscovery(
  request: Request,
  origin: string,
): Promise<Response | null> {
  const path = new URL(request.url).pathname;
  let body: string;
  let type = "text/markdown; charset=utf-8";
  const json = (value: unknown, media = "application/json") => {
    type = `${media}; charset=utf-8`;
    return JSON.stringify(value, null, 2) + "\n";
  };
  switch (path) {
    case "/robots.txt":
      type = "text/plain; charset=utf-8";
      body = `# Public pages may be used for search and AI answers, not model training.
# Crawl preferences are not access controls. Customer data requires credentials.
User-agent: *
Content-Signal: ${contentSignal}
Allow: /
Disallow: /app
Disallow: /sites/
Disallow: /api/
Allow: /api/v1/openapi.json
Disallow: /_serverFn/
Disallow: /oauth/
Disallow: /mcp$
Disallow: /ingest
Disallow: /payments/
Disallow: /login
Disallow: /signup
Disallow: /setup
Disallow: /invite/
Disallow: /reset-password
Disallow: /forgot-password

Sitemap: ${origin}/sitemap.xml
`;
      break;
    case "/sitemap.xml": {
      type = "application/xml; charset=utf-8";
      const paths = [
        "/",
        "/pricing",
        "/security",
        "/contact",
        ...(!policyDetails.legalDraft ? ["/privacy", "/terms"] : []),
      ];
      const escape = (value: string) =>
        value
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/"/g, "&quot;");
      body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${paths.map((page) => `  <url><loc>${escape(origin + page)}</loc></url>`).join("\n")}\n</urlset>\n`;
      break;
    }
    case "/llms.txt":
      type = "text/plain; charset=utf-8";
      body = `# Yaap

> Source-available web analytics, from first visit to revenue. Hosted service and self-hosting on your own infrastructure.

Public pages accept \`Accept: text/markdown\` and have explicit Markdown URLs below. Customer analytics requires a scoped credential. Documentation describes capabilities, not permission to access an account.

## Product

- [Overview](${origin}/index.md): Features and self-hosting.
- [Pricing](${origin}/pricing.md): Hosted tiers and billing information.
- [Security](${origin}/security.md): Security practices and reporting.
- [Contact](${origin}/contact.md): Support and public inquiries.
- [Source and deployment guide](${repositoryUrl}): Elastic License 2.0.

## Integrations

- [Authentication](${origin}/auth.md): Personal tokens and owner-approved MCP OAuth.
- [API and MCP guide](${origin}/docs/api.md): Scopes, report semantics, safe retries and limits.
- [OpenAPI](${origin}/api/v1/openapi.json): REST contract.
- [API catalog](${origin}/.well-known/api-catalog): API discovery.
- [AI catalog](${origin}/.well-known/ai-catalog.json): MCP server discovery.
- [Agent skill](${origin}${skillPath}): Workflow for querying and managing Yaap.

## Optional

- [Privacy policy${policyDetails.legalDraft ? " — draft, not effective" : ""}](${origin}/privacy.md)
- [Terms of service${policyDetails.legalDraft ? " — draft, not effective" : ""}](${origin}/terms.md)
`;
      break;
    case "/auth.md":
      body = `# Authentication for Yaap

Installation: ${origin}

Public product pages, discovery documents and the [OpenAPI contract](${origin}/api/v1/openapi.json) require no authentication. Customer reports and management require scoped credentials.

## Personal tokens — REST and MCP

The owner signs in and creates a token at [API & MCP access](${origin}/app/access), selecting websites, scopes and expiry. For aggregate reports, start with sites:read and reports:read. Store the token in the client's secret settings. Send Authorization: Bearer <token> to ${origin}/api/v1 or ${origin}/mcp. Never include credentials in URLs or tool arguments.

## OAuth — MCP only

The owner preregisters a public client at ${origin}/app/access using the client's exact redirect URI, then supplies its client ID. Dynamic client registration, client-ID metadata document fetching and automated agent account registration are not supported.

- [Protected resource metadata](${origin}/.well-known/oauth-protected-resource/mcp)
- [Authorization server metadata](${origin}/.well-known/oauth-authorization-server)
- Resource/audience: ${origin}/mcp
- Flow: authorization code with S256 PKCE and explicit owner consent for scopes and websites.
- Include this resource in authorization, code-exchange and refresh requests.
- Access tokens expire after one hour. offline_access requests rotating refresh tokens with a maximum 30-day grant lifetime.
- MCP OAuth tokens are not accepted by REST.

For clients that cannot configure a preregistered OAuth client, use a personal bearer token if supported. Native/server MCP clients can omit Origin; browser-origin connections currently require the installation origin.

On 401, connect or renew credentials. On 403, ask the owner for the required scope/site grant; do not bypass it. Discovery does not grant access or create an account. Read the [integration guide](${origin}/docs/api.md) before making changes.
`;
      break;
    case "/docs/api.md":
      // Keep the repository guide canonical, including its linked companion docs.
      body = apiGuide.replace(
        /\]\((([A-Z_]+)\.md)(#[^)]*)?\)/g,
        `](${repositoryUrl}/blob/main/docs/$1$4)`,
      );
      break;
    case "/.well-known/api-catalog":
      body = json(
        {
          linkset: [
            {
              anchor: `${origin}/api/v1`,
              "service-desc": [
                {
                  href: `${origin}/api/v1/openapi.json`,
                  type: "application/json",
                },
              ],
              "service-doc": [
                { href: `${origin}/docs/api.md`, type: "text/markdown" },
              ],
            },
          ],
        },
        "application/linkset+json",
      );
      break;
    case "/.well-known/ai-catalog.json":
      body = json(
        {
          specVersion: "1.0",
          entries: [
            {
              identifier: `urn:air:${new URL(origin).hostname}:mcp:yaap`,
              type: "application/mcp-server-card+json",
              url: `${origin}/mcp/server-card`,
            },
          ],
        },
        "application/ai-catalog+json",
      );
      break;
    case "/mcp/server-card":
    case "/.well-known/mcp/server-card.json":
      body = json(
        {
          $schema:
            "https://static.modelcontextprotocol.io/schemas/v1/server-card.schema.json",
          name: `${new URL(origin).hostname.split(".").reverse().join(".")}/yaap`,
          title: "Yaap analytics",
          version: "1.0.0",
          description:
            "Scoped website analytics and management. Requires a personal token or owner-approved OAuth.",
          websiteUrl: origin,
          repository: { url: repositoryUrl, source: "github" },
          remotes: [
            {
              type: "streamable-http",
              url: `${origin}/mcp`,
              supportedProtocolVersions: ["2025-11-25"],
            },
          ],
        },
        "application/mcp-server-card+json",
      );
      break;
    case "/.well-known/agent-skills/index.json": {
      const digest = await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(skill),
      );
      body = json({
        $schema: "https://schemas.agentskills.io/discovery/0.2.0/schema.json",
        skills: [
          {
            name: "yaap-analytics",
            type: "skill-md",
            description: skill.match(/^description: (.+)$/m)![1],
            url: skillPath,
            digest: `sha256:${Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("")}`,
          },
        ],
      });
      break;
    }
    case skillPath:
      body = skill;
      break;
    default:
      return null;
  }
  const headers = new Headers({
    "Content-Type": type,
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
    "Content-Signal": contentSignal,
    Link: discoveryLinks(origin),
  });
  if (request.method === "OPTIONS")
    return new Response(null, { status: 204, headers });
  if (!["GET", "HEAD"].includes(request.method)) {
    headers.set("Allow", "GET, HEAD, OPTIONS");
    return new Response(null, { status: 405, headers });
  }
  return new Response(request.method === "HEAD" ? null : body, { headers });
}

export function publicResponseHeaders(
  response: Response,
  request: Request,
  origin: string,
): void {
  const page = publicPagePath(new URL(request.url).pathname);
  if (!page) return;
  response.headers.append("Link", discoveryLinks(origin, page));
  response.headers.set("Content-Signal", contentSignal);
  const vary = response.headers.get("Vary");
  if (!vary?.split(",").some((name) => name.trim().toLowerCase() === "accept"))
    response.headers.set("Vary", vary ? `${vary}, Accept` : "Accept");
  if (policyDetails.legalDraft && ["/privacy", "/terms"].includes(page))
    response.headers.set("X-Robots-Tag", "noindex");
}
