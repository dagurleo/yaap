# Database backends

Yaap supports D1 (default) and PostgreSQL 16+ using the same API, dashboard, ingestion queue, and report calculations. Choose one backend for the whole installation. PostgreSQL works locally and with PlanetScale Postgres through Cloudflare Hyperdrive. PlanetScale MySQL/Vitess is not supported.

## Local Postgres

Start local PostgreSQL, then:

```sh
npm ci
npm run db:setup:postgres
npm run dev
```

The setup command connects to `postgresql://<your OS user>@127.0.0.1:5432/postgres`, creates `yaap_local` if needed, applies its migrations, and sets `DATABASE_PROVIDER=postgres` and `DATABASE_URL` in the gitignored `apps/web/.dev.vars`. Existing auth secrets are preserved. Supply `PG_LOCAL_ADMIN_URL` if your local server uses another user, password, or port. Setup requires permission to create a database. It never connects to a remote server.

For an existing local database, set these values in `apps/web/.dev.vars` yourself and run `npm run db:migrate:postgres`:

```dotenv
DATABASE_PROVIDER=postgres
DATABASE_URL=postgresql://your-user@127.0.0.1:5432/yaap_local
```

Restart an already-running dev server after changing bindings. Open http://localhost:8790/setup and create your owner using `BOOTSTRAP_SECRET` from `apps/web/.dev.vars`. A fresh Postgres database has no owner, even if your local D1 database does. `GET /health` reports `database: "postgres"` after a successful database query.

Switch back by setting `DATABASE_PROVIDER=d1` in `apps/web/.dev.vars` and restarting. This selects the existing local D1 database; it does not copy data. `npm run db:seed` follows the selected local backend and creates a new demo site for its existing owner. Options such as `--sessions 100000 --days 180` work on both providers. Postgres seeding uses a transaction and preserves all existing sites; remote Postgres URLs are rejected. `db:rollup:local` is D1-only; use `npm run db:rollup:postgres` to backfill local PostgreSQL. Run the appropriate command after seeding: development does not automatically execute the hourly production cron. Normal scheduled rollups work on both providers.

## Production Postgres through Hyperdrive

1. Create a **Postgres** database in PlanetScale. Obtain a direct connection URL for migrations and a runtime role for Hyperdrive. The migration role needs DDL, function, and trigger privileges. The runtime role needs access to all application tables and trigger functions.
2. Create a Hyperdrive configuration pointing to that database with query caching **disabled** (`wrangler hyperdrive create ... --caching-disabled`). Auth, settings, payments, and live reports require fresh reads. Hyperdrive still pools connections when caching is disabled.
3. In the root `wrangler.jsonc`, remove `d1_databases` and add:

```json
{
  "vars": { "DATABASE_PROVIDER": "postgres" },
  "hyperdrive": [{ "binding": "HYPERDRIVE", "id": "YOUR_REAL_HYPERDRIVE_ID" }]
}
```

Merge these properties into the existing config; preserve assets, queues, crons, and `nodejs_compat`.

4. Set `DATABASE_URL` as a **build/CI secret** pointing directly at the same production database, using the TLS settings from PlanetScale. Keep the existing `BETTER_AUTH_SECRET` and `BOOTSTRAP_SECRET` as Worker runtime secrets. Hyperdrive supplies the runtime connection string; do not put database credentials in Wrangler vars or commit them.
5. Run `npm run build` and then `npm run deploy` from the repository root. The deployment script selects migrations from the **built Wrangler configuration**, requires a real Hyperdrive binding for Postgres, applies migrations, and only deploys if they succeed. It never falls back to the local `apps/web/.dev.vars` migration URL for a Postgres deployment. The ordinary D1 deployment path is preserved.
6. Verify `/health`, create the owner for a fresh install, and check one real queued pageview and one report.

Local Postgres and local Hyperdrive emulation are covered by integration tests. A live PlanetScale/Hyperdrive deployment still needs verification once that database exists. Switching providers is configuration selection, not data migration; no live cutover or automatic D1 import is included.

## Implementation

- `apps/web/src/db/store.ts` exposes typed domain operations for sites, events, goals, funnels, payments, presence, and rate limits. Driver results and column codecs stay inside the database layer.
- `apps/web/src/db/executor.ts` implements parameterized reads, consistent read batches, and atomic writes for D1 and Postgres. SQL differences (UTC dates, JSON, scalar minimum/maximum) are explicit expression helpers. Reports remain shared SQL.
- `apps/web/src/db/index.ts` creates a separate connection scope for each HTTP request, queue batch, and scheduled invocation. Postgres pools close at the end of the scope; Hyperdrive owns pooling across invocations.
- Auth uses a matching Drizzle adapter/schema for each provider. Postgres auth uses transactions. Epoch milliseconds, integer booleans, and JSON text are intentionally retained on disk so application values match D1. Counts and timestamps are returned as JavaScript numbers with precision checks.
- Each provider has its own schema/migration history. When changing data models, update both schemas and generate both migrations. PostgreSQL migrations live under `apps/web/migrations/postgres`; D1 migrations remain directly under `migrations`.
- `migrate-postgres.mjs` applies pending migrations transactionally under an advisory lock and records SHA-256 checksums. Repeated runs are safe; edited applied migrations are rejected. Do not also run Drizzle's migrator or `drizzle-kit push` against that database.
- PostgreSQL triggers maintain first-seen visitors and invalidate session/day summaries on event insert, update, and delete. Event mutations and rollup rebuilds lock the site row so rebuilding cannot lose a concurrent event. This serializes writes **within a site**, while different sites can write independently. Bulk operations across multiple sites should lock sites in a consistent order.
- PostgreSQL indexes daily traffic by site/dimension/day, excluding arbitrary paths from its B-tree key size limit. Rebuild transactions replace each day's grouped rows atomically.

## Runtime bounds

PostgreSQL analytics transactions use a 15-second statement timeout, 3-second lock timeout and 10-second idle transaction timeout. Transaction-local settings also apply through Hyperdrive. These bound individual statements rather than total request duration. See [conversion runtime](CONVERSIONS.md#query-runtime) for the benchmark and cancellation fixture.

## Checks

```sh
npm run check
npm run test:postgres
npm run test:hyperdrive
```

The Postgres tests connect to local `postgres`, create a unique disposable database, migrate it twice, exercise the actual Worker bundle, and drop only that database afterward. Set `PG_TEST_URL` for a different local admin connection. Tests cover setup races, auth, queue replay, reports, typed properties/conversions, filters, payments, retention, Unicode paths, rollup rollback, concurrent writes during rollup, and seeded reports before/after rollup with failed-import rollback. The PostgreSQL runtime fixture adds 100,000-event funnel execution, statement cancellation, rollback and lock-release checks. The Hyperdrive suite uses Miniflare's binding emulator connected to the same real local Postgres engine.

Generate future schema changes with `npm run db:generate` and `npm run db:generate:postgres`. Use `drizzle-kit generate --config drizzle.postgres.config.ts --custom --name <name>` for Postgres trigger changes.

## Capacity

Capacity depends on the database provider, plan and workload. The local funnel fixture measures one query shape; it is not an ingestion throughput or production capacity benchmark. Queue consumption remains sequential, retention deletes at most 5,000 expired events per site per hourly run, and retention defaults to unlimited. Larger installations should measure database growth, query duration, queue backlog, and cleanup lag before increasing traffic.

References: [Hyperdrive with PlanetScale Postgres](https://developers.cloudflare.com/hyperdrive/examples/connect-to-postgres/postgres-database-providers/planetscale-postgres/), [Hyperdrive caching](https://developers.cloudflare.com/hyperdrive/concepts/query-caching/), [Better Auth Drizzle adapter](https://www.better-auth.com/docs/adapters/drizzle).
