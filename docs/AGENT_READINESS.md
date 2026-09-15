# Agent readiness

On September 13, 2026, [Is It Agent Ready?](https://isitagentready.com/) scanned `https://yaap.sh` and returned **7/100** (1 of 15 scored checks passed). This is the baseline for the deployed site, not a score for the implementation below.

The scan found missing crawl directives, sitemap, discovery links, Markdown delivery, API/AI catalogs, authentication instructions, MCP server card and skills index. OAuth authorization-server metadata already passed. The scanner reported the protected resource as a mismatch because it compared the homepage with `/mcp`; `/mcp` is the correct existing OAuth audience and remains unchanged.

## Implemented

| Resource | Purpose |
| --- | --- |
| `/robots.txt` | Allows public crawling, excludes app/auth/collection paths and points to the sitemap. Content signals permit search and AI input and decline model training. These are preferences, not access controls. |
| `/sitemap.xml` | Lists the homepage, pricing, security and contact. Privacy and terms join it when `policyDetails.legalDraft` becomes false. |
| `/llms.txt` | Product and integration entry point, with explicit draft labels for unfinished legal pages. |
| Public pages with `Accept: text/markdown` | Converts the same server-rendered main content into Markdown. Scripts, navigation, hidden elements and the illustrative dashboard are excluded. Supports content negotiation and `Vary: Accept`. |
| `/index.md`, `/pricing.md`, `/security.md`, `/contact.md`, `/privacy.md`, `/terms.md` | Explicit Markdown alternatives. Draft legal documents retain `X-Robots-Tag: noindex`. |
| `/auth.md` | Documents scoped personal tokens and owner-preregistered MCP OAuth with S256 PKCE. No automated enrollment or dynamic registration is advertised. |
| `/docs/api.md` | Serves the canonical repository API guide with working links to companion documents. |
| `/.well-known/api-catalog` | RFC 9727 Linkset catalog linking to OpenAPI and the integration guide. |
| `/.well-known/ai-catalog.json` | AI Catalog 1.0 referencing the MCP card. |
| `/mcp/server-card` | Current MCP card format with installation URL, Streamable HTTP and the implemented `2025-11-25` protocol. Also available at `/.well-known/mcp/server-card.json`. Tools are discovered after authentication. |
| `/.well-known/agent-skills/index.json` | Agent Skills discovery index, including the SHA-256 digest of the served `yaap-analytics/SKILL.md`. |

Public pages advertise API, AI catalog, OpenAPI, documentation, sitemap and Markdown alternatives in HTTP `Link` headers. HTML head links and the footer also expose integration documentation. Discovery URLs use the configured `BETTER_AUTH_URL` origin when present and otherwise the request origin, so self-hosted installations advertise their own endpoints.

On supported browsers, public pages register two read-only WebMCP tools using `document.modelContext.registerTool`: connection information and hosted price estimation. Pricing uses the same billing catalog as the application, validates event counts, and reports an estimate without creating a subscription. Registrations are removed on unmount. This browser API is experimental; browsers without it keep the normal page experience.

Static discovery documents do not require database initialization. Only their GET/HEAD responses are public and allow cross-origin reads. Analytics endpoints retain token/site/scope checks, same-origin browser restrictions and private/no-store caching. Markdown conversion is allowlisted to the six public page routes and does not apply to account or API responses.

## Verification and deployment

`npm run check` builds the Worker, checks types and formatting, exercises the discovery resources and all six Markdown pages against the built Worker, checks API/MCP authentication, and validates Worker routing. Unit tests also check skill digests, Accept preferences, public-content extraction, pricing boundaries and WebMCP cleanup. The skill can be validated with the skill-creator `quick_validate.py` script.

Verified locally on September 13, 2026: the complete check passed (104 web tests passed, 3 PostgreSQL-specific tests skipped; 37 client tests passed across both entry points). The skill validator passed. In Chrome, the landing page rendered without console errors and selecting 500,000 events updated the price to $19/month. Markdown pricing exposed all six tiers. Native browser WebMCP execution remains dependent on browser support; its tool behavior and registration cleanup were tested with a mock context.

Both Wrangler configurations explicitly route discovery URLs to the Worker. Deploy using the installation's existing production configuration and normal deployment process; the repository template has an empty D1 ID and does not identify the production database. After deployment, rerun the external scanner and check the public URLs directly. Local checks do not establish a new live score.

Remaining external or optional items:

- DNS-AID and DNSSEC require domain configuration. No DNS changes are included here.
- Check Cloudflare bot/WAF settings if a deployed crawler gets challenged. The origin's robots document must remain reachable; a managed robots feature must not replace these directives.
- Some scanner checks target earlier draft formats for MCP cards or WebMCP. The implementation follows current upstream formats and does not add unsupported capabilities to improve a score.
- Automated agent registration, agent-to-agent protocols and agent payment protocols are not implemented. Yaap's analytics payment operations do not make purchases or issue refunds.

## References

- [RFC 9727 API catalog](https://www.rfc-editor.org/rfc/rfc9727.html)
- [Cloudflare Markdown content negotiation](https://developers.cloudflare.com/fundamentals/reference/markdown-for-agents/)
- [MCP server card discovery](https://github.com/modelcontextprotocol/experimental-ext-server-card/blob/main/docs/discovery.md)
- [AI Catalog](https://ai-catalog.io/)
- [Agent Skills discovery](https://github.com/agentskills/agentskills)
- [WebMCP specification](https://webmachinelearning.github.io/webmcp/)

## Public documentation exports

The `/docs` guides expose `.md` alternatives and support `Accept: text/markdown`. `/docs.md` is the quick-start export; `/docs/index.md` is an alias. The HTML head and HTTP `Link` headers advertise Markdown and `/llms.txt`. `/llms.txt` includes each public guide, and `/llms-full.txt` combines all guides and the API reference. Fumadocs generates processed Markdown at build time; the Worker serves it without login, database access or runtime filesystem reads. Code blocks, tables and absolute links are preserved. Unknown Markdown guide paths return 404; HEAD and OPTIONS are supported and write methods return 405. Existing private routes and crawl preferences retain their access rules.
