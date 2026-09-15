# Local development

Use Node.js 22.12 or newer.

```sh
npm ci
npm run db:setup:local
npm run db:migrate:local
npm run dev
```

Open http://localhost:8790 for the public Yaap landing page. Choose Sign in or open http://localhost:8790/app for the protected workspace (redirects to setup on a fresh install). Read `BOOTSTRAP_SECRET` from your local `apps/web/.dev.vars`, enter it on the setup screen, and create the owner with a password of at least 12 characters. The setup secret is separate from the Better Auth signing secret. Neither belongs in Git.

Add a website using its exact origin, including protocol and port. HTTPS is required except on localhost. Install the generated snippet, visit a page, and watch the event list refresh automatically.

The tracker supports full page loads and SPA pathname navigation, source/campaign fields, custom event names, and configurable browser/session IDs (enabled by default). Goals, funnels, visitor journeys and revenue reports are available in the dashboard.

## Test Polar sandbox webhooks

Hosted billing must use a Polar sandbox organization access token, sandbox product IDs and a sandbox webhook secret together. Create the token in the sandbox organization's **Settings → General → Developers** area. The current checkout and portal implementation needs `customers:write`, `checkouts:write`, `subscriptions:read` and `customer_sessions:write`; add `subscriptions:write` when testing subscription changes. Put the token in the gitignored `apps/web/.dev.vars`, set `YAAP_HOSTING_MODE=hosted` and `POLAR_ENVIRONMENT=sandbox`, then restart the dev server. Never mix sandbox and production credentials or product IDs.

With the app running on port 8790, start a temporary Cloudflare Quick Tunnel in a second terminal:

```sh
npm run billing:tunnel
```

The command pins the origin `Host` header to `localhost:8790`, preserving Vite's host allowlist while exposing the local Worker. Copy the generated `https://<random>.trycloudflare.com` URL and create a **raw** endpoint in the Polar sandbox at:

```text
https://<random>.trycloudflare.com/api/billing/webhooks/polar
```

Subscribe to checkout, customer, order, subscription and refund lifecycle events. Save the endpoint's signing secret as `POLAR_WEBHOOK_SECRET`. A checkout return does not activate billing by itself; the signed webhook triggers authoritative subscription provider reconciliation.

Quick Tunnel hostnames are temporary. Keep the tunnel process running during the test, and update or replace the sandbox endpoint whenever the hostname changes. Disable or delete the endpoint after the session so Polar does not retry an expired URL. For longer local sessions, Polar's own `polar listen http://localhost:8790/api/billing/webhooks/polar` command is the simpler alternative because it owns the relay and prints the matching signing secret.

## Use local Postgres

With PostgreSQL running locally:

```sh
npm run db:setup:postgres
npm run dev
```

This creates and migrates `yaap_local`, selects Postgres in `apps/web/.dev.vars`, and preserves your auth secrets. Restart an existing dev server, then open `/setup` to create the owner in the new database. D1 data stays in its existing database. `/health` reports the active backend.

See [database setup and architecture](DATABASES.md) for custom connection settings, PlanetScale Postgres through Hyperdrive, migrations, and integration tests.

## Seed a large local demo

After applying local migrations and creating your owner account, run:

```sh
npm run db:seed
```

This creates a new **Atlas Demo** site with 100,000 synthetic visits across 180 UTC days (hundreds of thousands of events). It includes anonymous and returning browsers, varied locations/devices, sources and campaigns, weekday/daytime traffic patterns and spikes, three goals, two ordered funnels, and USD/EUR payments with refunds in both test and live report modes. Google and Meta paid journeys include synthetic account/campaign/ad IDs. The final three sessions use fresh visitors and live payments so **Revenue → Ad campaigns** has recent examples, including a missing account ID and separate USD/EUR totals (use at least three sessions). Payments are synthetic database rows; no payment provider is contacted. Recent events populate the five-minute activity feed, and matching storage counters populate ingestion stats. Seeds do not simulate ongoing presence heartbeats. Event triggers populate pending rollups. After seeding, run `npm run db:rollup:postgres` for local PostgreSQL or `npm run db:rollup:local` for D1; development does not automatically run the production hourly job. The script prints the dashboard URL when finished.

```sh
npm run db:seed -- --sessions 500000 --days 365 --name "Big Demo"
npm run db:seed -- --help
```

Options also include `--origin https://demo.example` and `--seed 42` for repeatable distributions (dates are relative to execution time). Every run creates a fresh site with unique IDs and preserves existing sites. The command reads `DATABASE_PROVIDER` and `DATABASE_URL` from `apps/web/.dev.vars`, with environment variables taking precedence. It seeds the selected local backend: D1 in `apps/web/.wrangler/state`, or Postgres on localhost. Apply that backend’s migrations and create its owner first. Remote targets are rejected. Postgres imports run in one transaction and roll back completely on failure. For D1, a failed import retains the generated SQL for inspection and may leave a partial site.

## Commands

| Command                        | Purpose                                                                                           |
| ------------------------------ | ------------------------------------------------------------------------------------------------- |
| `npm run dev`                  | Vite and the local Worker runtime on port 8790                                                    |
| `npm run billing:tunnel`       | Expose port 8790 through a temporary Cloudflare Quick Tunnel for sandbox webhooks                 |
| `npm run build`                | Production Worker and browser assets                                                              |
| `npm run preview`              | Serve the production build on 8790; stop dev first                                                |
| `npm run check`                | Backend formatting, build, typecheck, D1/tracker tests, and local deployment configuration checks |
| `npm run format:backend`       | Format backend sources, shared validation, scripts, and tests                                     |
| `npm run check:format:backend` | Check backend formatting without changing files                                                   |
| `npm run test:postgres`        | PostgreSQL integration tests and funnel runtime/timeout fixture                                   |
| `npm run test:hyperdrive`      | Integration tests through local Hyperdrive emulation                                              |
| `npm run db:rollup:local`      | Backfill complete days in local D1 only                                                           |
| `npm run db:rollup:postgres`   | Backfill complete days in local PostgreSQL only                                                   |

Run `npm run build` before standalone backend test commands. The root check includes both workspaces, client package/type checks, and deployment asset parity. PostgreSQL tests require a local server and permission to create disposable databases; see [database checks](DATABASES.md#checks). The suites do not use your owner's analytics database. `npm run deploy` changes remote resources; it is not a local check.

## Project layout

The root `package.json` defines npm workspaces and forwards app commands to `@yaap/web`. Forwarders change into the workspace directory explicitly so both npm and Bun select the correct package. `bun dev` works from the root; use `bun run build` and `bun run test` for names that also have Bun built-in commands. Keep `npm ci` and the root npm lockfile for reproducible installs. Install once at the root with `npm ci`; commit only the root `package-lock.json`. Both workspaces share the installed tools. App-relative paths in Vite, Wrangler, Drizzle and tests resolve from `apps/web`.

`npm run build:client` builds ESM, declarations and the standalone script. App `dev` and `build` rebuild and copy that script to the ignored `apps/web/public/script.js`; edit the client source, never this generated file. Restart dev after changing client source. `npm run check:client` tests both entry points and installs a real tarball in an isolated consumer. See [client development and release](../packages/client/README.md#local-development-and-release).

| Location                           | Responsibility                                                  |
| ---------------------------------- | --------------------------------------------------------------- |
| `apps/web/src/server.ts`           | Worker entry point: HTTP, queues, scheduled maintenance         |
| `apps/web/src/api.ts`              | HTTP API, setup and tracking endpoints                          |
| `apps/web/src/routes/`             | Public landing page, setup/login and protected dashboard routes |
| `apps/web/src/features/dashboard/` | Report UI, server functions and query configuration             |
| `apps/web/src/server/`             | Shared report calculations, ownership checks and services       |
| `apps/web/src/db/`                 | Shared executor/store, D1 schema and PostgreSQL schema          |
| `apps/web/src/auth/`               | Better Auth configuration and browser client                    |
| `apps/web/src/lib/`                | Shared validation and report definitions                        |
| `packages/client/src/index.ts`     | Shared typed tracker implementation                             |
| `packages/client/src/script.ts`    | Script-tag configuration adapter                                |
| `packages/client/tests/`           | Behavior parity and independent npm-package smoke tests         |
| `apps/web/migrations/`             | D1 SQL and metadata; PostgreSQL has its own subdirectory        |
| `apps/web/tests/`                  | Pipeline, seed and runtime fixtures                             |

TanStack Start renders the dashboard in the same Worker as the API. Server functions call shared services directly. Each request receives its own database scope and QueryClient; private HTML and server-function responses use `private, no-store`. Login/logout clear browser query data. Route guards and each server function independently check access; `apps/web/src/start.ts` enforces server-function CSRF checks.

Vite generates `apps/web/dist/server/wrangler.json`. Edit `apps/web/wrangler.jsonc`, not the generated copy. Local state lives in `apps/web/.wrangler/state`; secrets live in the gitignored `apps/web/.dev.vars`.

## Schema changes

Update both database schemas and generate both migration histories:

```sh
npm run db:generate
npm run db:generate:postgres
```

Review generated SQL, including expression indexes and JSON-text defaults. Commit schemas, SQL and Drizzle metadata together. Apply D1 migrations through Wrangler and PostgreSQL migrations through `apps/web/scripts/migrate-postgres.mjs`. Do not mix migration runners or use `drizzle-kit push` against an installation managed by these migrations.

Auth changes must preserve the unique `user_single_owner` index on the constant `(1)` in both schemas. Public registration stays disabled; setup validates the bootstrap secret before temporarily enabling signup. Owner recovery and repair of partial setup are still planned.

## UI conventions

Use the existing shadcn/Radix components in `apps/web/src/components/ui` and Tailwind utilities. `Button` defaults to `type="button"`; set `type="submit"` explicitly for form submission. Use `variant="primary"` for the main action, `variant="ghost"` for quiet actions, and accessible labels for icon-only buttons. Merge conditional classes with `cn` from `apps/web/src/lib/utils.ts`.

`apps/web/src/styles.css` loads the shared styles and `apps/web/src/graphite.css` theme. Use semantic tokens for light/dark surfaces, text, borders and charts. The account menu offers Light, Dark and System; browser preference is applied before paint. Brand assets ship in `apps/web/public/brand`, and bundled third-party icons retain their [license notes](../apps/web/public/icons/README.md).

## Making changes

Keep changes scoped to one implementation stage, preserve existing data and tracker compatibility, and update the guide that owns the changed behavior. Backend changes need D1 and PostgreSQL parity; new UI should be checked on desktop/mobile and light/dark themes. Use synthetic fixtures for screenshots and tests. Never commit `apps/web/.dev.vars`, database credentials, local database files or real visitor data.

TypeScript rejects unused locals and parameters. Run `npm run format:backend` before `npm run check`; the check command verifies formatting without rewriting files. See the [backend audit](BACKEND_AUDIT.md) for reviewed boundaries, regression coverage, and remaining operational limitations.

See the [implementation plan](IMPLEMENTATION_PLAN.md) for acceptance criteria and the [roadmap](ROADMAP.md) for current priorities.
