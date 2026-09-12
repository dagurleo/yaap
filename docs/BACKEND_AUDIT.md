# Backend audit

Reviewed 2026-09-11. This records a source review and local validation, not a production penetration test or a release certification.

## Scope

Reviewed the Worker entry point, owner setup and authentication, dashboard server functions, ingestion and queue consumption, shared services and report queries, public REST/MCP/OAuth handlers, database executors and stores, both database schemas, migration invariants, and database/deployment scripts. Checked authorization, input boundaries, SQL construction, retry behavior, secret handling, report semantics, and maintainability against the existing integration fixtures.

## Fixed in this review

| Finding | Change |
| --- | --- |
| The global response wrapper replaced OAuth consent's `no-referrer` policy. | Preserve endpoint-specific privacy headers and apply `no-referrer` to OAuth redirects as well. Add frame protection to Worker responses. |
| Database initialization ran outside the HTTP error boundary; errors and legacy redirects missed common headers. | Catch initialization failures and apply private response headers consistently. |
| JSON response headers were spread as an object even though `HeadersInit` also accepts tuples and `Headers`. | Normalize through the `Headers` API so request IDs and other supplied headers survive. |
| JSON, OAuth forms, and Stripe webhooks duplicated streaming body readers and left readers locked. | Share a bounded byte reader, cancel oversized uploads, release locks, and validate media types exactly and case-insensitively. Stripe signatures still use the original bytes. |
| Some malformed dashboard inputs and encoded path parameters became internal errors. | Validate object boundaries and convert invalid path encoding into a client error. |
| Stripe parsing used `any` across the entire webhook payload. | Narrow unknown event, charge, and metadata objects before reading them. Shared payment validation still checks monetary values and timestamps. |
| A PostgreSQL URL's `host` query parameter could bypass the local-host check. | Validate both the URL host and host overrides in the runtime, setup script, and disposable test-database helper. |
| Expensive public reads were classified by a regular expression over operation names. Event discovery and other report operations could receive the management budget. | Select the report budget from the operation registry's explicit `report` flag. |
| Concurrent OAuth refreshes could pass the initial reuse check, leaving the winning grant active after the second refresh failed. | Recheck reuse and revoke the grant when rotation wins between reads or during the transaction. Exercise simultaneous refreshes in integration tests. |
| Ownership and server-function input checks were duplicated, and formatting was inconsistent. | Extract shared site-access validation, simplify repeated boundary checks, remove unused imports, format backend sources/scripts/tests, and make formatting and unused-code checks enforceable. |

No database migration is required for these changes. Existing stored identities, payment encryption formats, and token formats remain compatible.

## Validation

- `npm run check`: passed formatting, production build, strict TypeScript checks, deployment configuration validation, and 72 tests. Three PostgreSQL-only tests were skipped in this run and passed in the PostgreSQL suite.
- `npm run test:postgres`: all 41 tests passed against disposable PostgreSQL databases, including the 100,000-event runtime and transaction-timeout fixture.
- `npm run test:hyperdrive`: all 40 pipeline and public API tests passed through local Hyperdrive emulation.
- Regression coverage includes OAuth response headers, simultaneous refresh reuse, report rate limits, streamed byte limits and reader cleanup, header representations, malformed inputs, hidden remote PostgreSQL hosts, and database initialization failures.
- `npm audit` reported zero known dependency vulnerabilities during this review.
- A targeted scan of all locally available Git refs inspected 1,017 blob versions for private keys and common GitHub, AWS, Stripe live-key, and Slack token patterns. It found no matches and no historical `.env` or `.dev.vars` files other than examples. This was a pattern scan; it cannot prove that every possible secret is absent, and it does not inspect unavailable remote refs or external artifacts.

## Remaining limitations

These affect operational readiness and are not resolved by formatting or local tests:

- Owner recovery and repair of partial setup, portable exports, tested restores, and release/upgrade guidance remain on the [release roadmap](ROADMAP.md#before-public-release).
- Fresh-account Cloudflare provisioning and real Stripe delivery have not been verified. Local Hyperdrive emulation does not establish production latency or connection behavior.
- The public API's concurrency counter is a best-effort guard tied to minute buckets. It is not a strict global semaphore across a minute boundary. A durable lease-based admission mechanism is appropriate if a hard concurrency ceiling becomes necessary.
- Retention and rollup jobs process bounded batches, but backlog-drain capacity and cleanup lag still need burst/load benchmarks. Report panels assembled through separate calls can observe intervening writes; only `batch()` and individual statements share a database snapshot.

## Maintenance rules

Keep transport handling at the edges: `apps/web/src/api.ts` and dashboard server functions authenticate the owner, `apps/web/src/server/` owns shared business logic, and `apps/web/src/public-api/` adds scoped credentials, versioned contracts, revisions, and idempotency. A caller-supplied website ID is never authorization; check both credential grants and site ownership where applicable.

Use bound Drizzle SQL values. Dynamic identifiers must come from fixed mappings or validated enums. Keep provider differences in the executor and expression helpers. Preserve the single-owner index and event-maintenance triggers when generating migrations, and never rewrite an applied migration for cosmetic reasons.

Keep raw webhook bytes intact until signature verification. Never include credentials or raw visitor request data in logs. Reuse event/payment IDs on retry, and preserve the atomic relationship between public mutations, revision guards, idempotency records, and audit records.

Authentication configuration was cross-checked against the [Better Auth security documentation](https://better-auth.com/docs/reference/security), including trusted origins, cookie behavior, and proxy IP headers.
