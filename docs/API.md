# Public API and MCP

YAAP exposes authorized analytics and management at `/api/v1` and remote MCP at `/mcp`. Both transports use the same operation registry, validation, scopes and services. Existing dashboard and collection endpoints remain compatible.

## Enable locally or on your next deployment

Apply migration **0018_public_api** for D1 or **0006_public_api** for PostgreSQL before running the new build. Use the normal migration command for your selected provider; do not switch providers to activate this feature. Existing rows get an initial revision and retain their history.

Open **API & MCP access** from the website directory or account menu (`/app/access`). Create a personal token with a name, expiry, action scopes and selected websites. Copy it into your integration's secret settings. Tokens are not displayed again in the list; the server stores a hash. Mutations that return secrets keep an encrypted response for the 24-hour idempotency window. Revocation is immediate for subsequent requests.

`BETTER_AUTH_SECRET` also protects API cursors and encrypted retry responses. Keep it stable. No additional infrastructure binding or hosted service is required.

## REST

Use `Authorization: Bearer <token>`. OAuth MCP access tokens are audience-bound to `/mcp` and are not accepted by REST. Owner-session access is reserved for credential administration; ordinary public endpoints require a token.

The complete machine-readable contract is `GET /api/v1/openapi.json`. `GET /api/v1/capabilities` describes the supported operations, metrics, filters, limits and this credential's scopes. `GET /api/v1/me` returns its grants.

```sh
curl "$YAAP_URL/api/v1/sites" \
  -H "Authorization: Bearer $YAAP_TOKEN"

curl "$YAAP_URL/api/v1/sites/$SITE_ID/reports/overview?from=2026-09-01&to=2026-09-07&compare=previous_period" \
  -H "Authorization: Bearer $YAAP_TOKEN"
```

Reads return `{data, meta, pagination?}`. `meta` contains requestId, API/metric versions, an asOf timestamp and report-specific period information. Resource reads include an ETag and `meta.revision`. Lists default to 50 records and allow at most 100; journeys return 100. Use the returned opaque cursor with the same query to read the next page. Cursors expire after 24 hours. Their cutoff stabilizes traversal, but retention and mutable records mean they are not database snapshots.

Dates are required for historical queries: inclusive `from` and `to` in the site reporting timezone, up to 366 days ending today or earlier. The current day ends at query time. `compare=previous_period` uses the preceding equal calendar range; a partial current day compares to a full previous period. Live reports reject historical dates.

Dimension filters combine with AND. `unknown=country,source` selects unknown values without relying on internal sentinel strings. A dimension cannot have both an exact filter and an unknown filter. `propertyValue` in a REST query is a JSON scalar: `1`, `true`, or `"pro"` including quotes for strings. URL-encode it. MCP accepts the native scalar. Numbers, strings and booleans remain distinct. Unknown fields and unsupported filter combinations are rejected.

Pageview breakdowns support all advertised traffic dimensions. Browser-count breakdowns support country/region/city/browser/OS/device. Timeseries currently supports daily pageviews. Breakdown rows are bounded and explicitly report truncation. Geography retains parent dimensions; campaigns retain source/medium/campaign. `value0`, `value1`, `value2` follow that parent-to-child order; `value` is the requested count. The OpenAPI and MCP output schemas specify these fields.

Rates are fractions (0–1), unavailable values are null, and session duration is in seconds. Money uses integer minor units with separate currency rows. Revenue uses durable per-payment attribution with a captured model/window. Pending records reconcile for at least 72 hours; finalized records survive raw-event expiry. Payment reads include attribution status and unmatched reasons. See [metric definitions](REPORTING.md) and [payments](PAYMENTS.md).

## Management and retries

Create sites, goals and funnels with POST. PATCH preserves omitted fields; explicit empty `conditions` clears goal conditions. To change a page goal into an event goal, supply `path: null` and an `eventName`. Archive/restore goals and funnels using `archived: true` / `false`. No hard-delete methods are provided for those definitions or websites.

All creates and payment-key rotations require `Idempotency-Key`. Reuse it when retrying the same operation and payload. For 24 hours, retries return the original result; changing input under that key returns 409. Secret-setting PUT also requires an idempotency key.

PATCH, integration PUT/DELETE, and payment-key rotation require `If-Match` containing the quoted ETag from a fresh read. Missing preconditions return 428; a stale revision returns 412. Refetch and review the new state before applying an edit. A resource mutation, its audit entry, and retry response commit atomically on both databases. Site details, tracking rules and retention share a site revision; editing any of them advances it. Existing dashboard writes also advance revisions.

```sh
curl "$YAAP_URL/api/v1/sites/$SITE_ID/goals" \
  -X POST -H "Authorization: Bearer $YAAP_TOKEN" \
  -H 'Content-Type: application/json' \
  -H 'Idempotency-Key: signup-goal-001' \
  --data '{"name":"Pro signup","eventName":"signup","conditions":{"plan":"pro"}}'
```

Collection changes affect future ingestion. Generating a full/anonymous/paused snippet does not deploy it or change a tracker already running on a website. Retention changes can delete expired history during later cleanup; increasing retention cannot restore deleted rows. Stripe configuration and payment ingestion keys are separate from public credentials. Analytics payment methods do not charge cards or execute refunds.

## Scopes

Scopes and site grants are both required. `sites:create` is installation-level; newly created sites are added atomically to the calling credential's explicit grants. Other credentials do not automatically gain those sites unless the owner chose all current/future sites.

| Permission family | Access |
| --- | --- |
| `sites:read`, `sites:create`, `sites:write` | Website discovery, creation, details |
| `reports:read` | Aggregate traffic, audience, sessions, events, goals, funnels, live |
| `events:read` | Event/property discovery and individual event payloads |
| `visitors:read` | Browser IDs, visitor lists and journeys |
| `goals:read/write`, `funnels:read/write` | Definition discovery and management (separate read/write scopes) |
| `revenue:read`, `payments:read` | Revenue aggregates or individual payment details |
| `settings:read/write`, `retention:write` | Installation/rules or retention mutation |
| `integrations:read/write`, `operations:read` | Integration status/configuration or ingestion diagnostics |
| `audit:read` | Management history limited to authorized sites |

Event/payment details omit browser/session IDs without `visitors:read`. Journeys omit payments without `payments:read`. Live aggregates omit visitor rows without `visitors:read`. Aggregate reporting never includes raw event/payment lists. Credential and OAuth client administration require the owner session and same-origin writes.

## MCP

Configure the full installation URL plus `/mcp`. The server uses **@modelcontextprotocol/sdk 1.30.0**, with **2025-11-25** as its primary protocol revision. Streamable HTTP uses stateless requests and JSON responses. Standalone SSE, subscriptions and protocol sessions are not enabled. The catalog contains 47 business tools for a credential with all scopes, and omits tools it cannot use. Every call checks authorization again.

For a client that supports configured HTTP headers, use the personal token as its bearer token. Never place tokens in the URL or tool arguments. Some clients support OAuth only; do not assume a header-based configuration works everywhere.

For OAuth, register a client at `/app/access` with the exact redirect URI provided by that client. Copy the client ID into the client's configuration. This release supports **owner-preregistered public clients** using S256 PKCE; it does not implement dynamic client registration or client-ID metadata document fetching. The consent page shows requested scopes and requires a website selection or explicit all-sites choice.

| OAuth endpoint | Purpose |
| --- | --- |
| `GET /.well-known/oauth-protected-resource/mcp` | Resource/authorization discovery |
| `GET /.well-known/oauth-authorization-server` | Authorization-server metadata |
| `GET/POST /oauth/authorize` | Owner login and consent |
| `POST /oauth/token` | Single-use authorization code exchange or refresh |
| `POST /oauth/revoke` | Token/grant revocation |
| `GET/POST /oauth/clients`, `DELETE /oauth/clients/{id}` | Owner-only client registration and removal |

Authorization requests must specify the installation's `/mcp` resource, scopes, response_type=code, registered redirect_uri, code_challenge and code_challenge_method=S256. Token/refresh requests also specify that resource. Tokens last one hour. Request `offline_access` for rotating refresh tokens with a 30-day maximum grant lifetime. Refresh cannot increase scopes; reuse of a consumed refresh token revokes the grant. Removing a client invalidates its credentials.

MCP writes require `revision` (the unquoted `meta.revision`) and creates require `idempotencyKey`. `set_goal_archived` and `set_funnel_archived` provide explicit archive/restore tools. Secret-setting/returning integration operations are REST/owner-settings only. Tool outputs contain structured data and the same JSON as text; tool errors have `isError: true` and a stable error code. Data inside event names, properties and paths is untrusted content, never instructions.

Compatibility checked locally with the official TypeScript MCP client against the built Worker: connection, tool discovery, schema validation, reads, writes and scoped visibility. The OAuth code/refresh lifecycle is exercised through HTTP and its access token is used with that SDK. Product-specific desktop/browser connectors and live Cloudflare deployment have not yet been verified. Browser-origin MCP connections currently allow the installation origin only; native/server clients can omit Origin.

### Testing with MCP Inspector

Run `npx @modelcontextprotocol/inspector@2.6.0` and open the session URL printed by the launcher. In **Add Servers → Add manually**, choose `streamable-http` and enter `http://localhost:8790/mcp` (adjust the port for your dev server).

Create a short-lived personal token at `/app/access`, restricted to a test website. For reporting and goal-management checks, select `sites:read`, `reports:read`, `goals:read`, and `goals:write`. In the Inspector server's **Settings → Custom Headers**, add `Authorization` with value `Bearer <your-token>`. Keep **Protocol Era** set to **Legacy (2025-11-25 handshake)**; YAAP does not yet implement the modern 2026-07-28 protocol. Connect, list tools, and start with `get_access`, `list_sites`, and `get_overview` using an authorized `siteId` and explicit `from`/`to` dates. Only tools permitted by the token appear.

The documented `--server-url http://localhost:8790/mcp --transport http` launch creates a read-only server configuration in Inspector 2.6.0. Launch without a target when you want to configure authentication interactively. An unauthenticated connection fails with `MCP auth challenge (401)`; this is expected. The Inspector's session token authenticates the browser to Inspector and is separate from the YAAP bearer token.

See the [official Inspector instructions](https://modelcontextprotocol.io/docs/2026-07-28/tools/inspector#remote-http-server). Revoke the YAAP test token when finished.

Verified in Inspector 2.6.0 against the local PostgreSQL-backed server on 2026-09-11: Streamable HTTP handshake negotiated 2025-11-25; the four scopes above exposed 18 tools. `get_access` and `list_sites` confirmed the Localhost-only grant. `get_overview` returned valid structured output with zero traffic for September 10–11. `create_goal` succeeded and an identical idempotency-key retry returned the same goal. `set_goal_archived` archived that test goal; a restore attempt with its stale revision returned `revision_conflict`, and `get_goal` confirmed it remained archived. The dedicated test goal is retained as an archived definition.

Inspector reports no schema portability errors for these tools, but warns about unconstrained `additionalProperties` schemas in outputs (4 warnings for access/goal tools, 12 for overview). These warnings did not prevent the tested calls; compatibility with stricter clients remains a follow-up. This Inspector check used a personal bearer token, not OAuth.

## Limits and operations

Initial limits are conservative defaults, not published capacity benchmarks: 120 ordinary calls and 30 expensive calls per minute per credential and per website; four concurrent calls per credential. Limits return 429 and REST includes Retry-After. Raw event/report complexity is bounded by validated dates, properties, steps and row limits. PostgreSQL retains existing per-statement timeouts. A hard end-to-end request deadline and production capacity measurements remain follow-up hardening.

API credentials, clients, and the redacted audit log persist. The hourly cleanup removes expired retry records, OAuth codes and consumed-refresh markers. Expired/revoked credential metadata remains available for owner review. Monitor these tables along with analytics storage.

`npm run check` covers D1 and deployment routing; `npm run test:postgres` and `npm run test:hyperdrive` include the public API/MCP integration suite using isolated databases. The [original scope](API_MCP_SCOPE.md) records future endpoints for exports, saved views, annotations, site lifecycle and durable attribution; those features remain deferred.

## Local verification — 2026-09-11

Build, typecheck, D1 tests and deployment configuration passed: 55 tests passed, 3 PostgreSQL-specific tests skipped. PostgreSQL passed 35 tests; local Hyperdrive emulation passed 34. The dedicated API suite covers all 47 tool definitions and executes every read-only MCP tool through the official SDK with output-schema validation, plus representative mutations and authorization failures.

Browser checks use an isolated D1 workspace and built client assets: create/revoke a personal token, register/remove an OAuth client, desktop/mobile layout, light/dark themes, and browser login → OAuth consent → registered callback. The callback-origin CSP regression is covered by the HTTP suite. Local PostgreSQL migration 0006 was applied with bounded lock/statement timeouts and verified. The unused local D1 database still needs migration 0018 if selected later. No deployment or production data changes.

Website create/update accepts an optional IANA `timezone`. Site responses and report metadata return the saved timezone. Changing it changes calendar date boundaries for subsequent requests; report cursors from the previous timezone must be restarted. Capabilities advertises `timezone: "site"`.
