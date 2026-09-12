# Deploy to Cloudflare

The default template runs self-hosted Yaap with D1, an event queue, and a dead-letter queue. PostgreSQL, outbound email, and hosted billing are optional.

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/dagurleo/yaap)

## Deploy button

1. Use the button once this repository is public. Connect GitHub or GitLab and your Cloudflare account. Copy the **complete repository**, with root directory `/`; do not select `apps/web`. The app needs `packages/client` and the root lockfile.
2. Choose the Worker, D1 database, and queue names. Cloudflare reads the root `wrangler.jsonc`, provisions the resources, and writes the chosen names and database ID into your copy. Keep the event producer, consumer, and dead-letter references consistent.
3. Generate **two different secrets**, running `openssl rand -hex 32` separately for each. Enter `BETTER_AUTH_SECRET` and `BOOTSTRAP_SECRET` in the secret fields. Save the bootstrap value for `/setup`; keep the auth secret stable across upgrades. The root `.dev.vars.example` declares only these two required inputs.
4. Accept **Build command:** `npm run build`; **Deploy command:** `npm run deploy`. Use Node.js 22.12 or newer (`NODE_VERSION=22`). Workers Builds installs dependencies from the root lockfile; the build produces the client and app, and deploy applies D1 migrations by binding name before uploading the built Worker.
5. Open `/setup` at the deployed `workers.dev` URL. Create the owner using your bootstrap secret, add a website, and install its tracking snippet.
6. Visit the tracked website and confirm a pageview reaches the dashboard. Confirm `/health` succeeds, then sign out and back in. Owner setup must refuse a second owner.

A public source repo is required. This button configuration is locally tested, but fresh-account provisioning and resource renaming still need a live acceptance run. Cloudflare documents [deploy buttons, supported resources, and limitations](https://developers.cloudflare.com/workers/platform/deploy-buttons/).

## Existing repository / Workers Builds

Import the full repository, select branch `main`, root directory `/`, and the Worker name from the root `wrangler.jsonc`. Use the same build and deploy commands above. Unlike the template flow, an ordinary Git import needs you to configure resources yourself:

- Create a D1 database and both queues; put the database ID and resource names in the root config.
- Set `BETTER_AUTH_SECRET` and `BOOTSTRAP_SECRET` as **Worker runtime secrets**. Build variables alone do not configure runtime secrets.
- Leave build watch paths covering the entire repository. Disable non-production branch builds until they use separate databases and queues.

From a local checkout, run `npm ci`, `npm run build`, then `npm run deploy` from the repository root. Authenticate Wrangler and configure resources and runtime secrets first. The deploy command deliberately consumes the build; rebuild after every code or configuration change. `npm run deploy --workspace @yaap/web` combines the build and deployment for local convenience.

The deploy script rejects an unprovisioned D1 database before attempting migrations. It passes the built config explicitly to both migrations and deployment, preserving template-assigned resource names and IDs. These commands change remote resources; use `npm run check` for local validation.

## Configuration

**Production:** edit the root `wrangler.jsonc`. Production builds read this file even though Vite runs inside `apps/web`. **Local development:** `apps/web/wrangler.jsonc` and `apps/web/.dev.vars` keep the local database, email simulator, and existing developer secrets separate. Do not put runtime secret values in either Wrangler file.

For PostgreSQL, set `YAAP_HYPERDRIVE_ID` in Cloudflare Builds variables and follow the [Hyperdrive instructions](DATABASES.md#production-postgres-through-hyperdrive). The build substitutes the Hyperdrive binding and PostgreSQL provider without changing the public D1 template. Leave this variable unset for the default D1 deployment. The deploy script selects migrations from the built provider configuration. PostgreSQL migration credentials belong in a build secret, with runtime access through Hyperdrive.

Email is omitted from the default production template so a basic installation needs no sender-domain setup. To enable invitations and other email features, follow [Email Service setup](EMAIL.md), add `"send_email": [{ "name": "EMAIL" }]` to the root config, configure `EMAIL_FROM`, and rebuild. Hosted billing also requires explicit configuration; see [billing](HOSTED_BILLING_SCOPE.md).

Auth uses the Cloudflare-routed request origin. Optional `BETTER_AUTH_URL` pins a canonical origin for a custom domain; use the exact HTTPS origin without a trailing slash. Dashboard and API share that origin.

## Upgrades and live acceptance

Before upgrading, back up the database and record the deployed commit, resource IDs, and configuration. Keep the same database, queues, and secrets, merge the new code, then run the normal build and deploy. Applied migrations are tracked and repeat deployment must leave existing data intact. A Worker code rollback does not undo database migrations; test backup restoration before relying on rollback.

Before public launch, exercise the button on a fresh account or isolated resources, rename every resource, complete owner setup, collect a real event, and redeploy with existing data. Verify queue consumption, both cron schedules, the dead-letter queue binding, and a second deployment with no pending migrations. Record the result in [release readiness](RELEASE_READINESS.md). See [operations](OPERATIONS.md) for troubleshooting.
