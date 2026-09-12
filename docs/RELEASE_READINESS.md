# Public release readiness

Reviewed 2026-09-12. The deployment template passes local validation. A fresh Cloudflare-account installation has **not** been verified, so the button must not yet be described as a proven one-click installation.

## Deployment changes

- Added the production Wrangler config, two-secret example, and Cloudflare binding descriptions at the repository root. The button copies the complete npm workspace repository.
- Production Vite builds consume the root config, including resource names and IDs chosen by Cloudflare. Local development retains its workspace config and private `.dev.vars`.
- Separated root build and deploy commands so Workers Builds builds once. Deployment applies migrations before uploading, using the same explicit built config for both commands.
- Reject unprovisioned D1 deployments before contacting Wrangler. Explain missing build output with a direct recovery command.
- Removed email from the default production template. Basic self-hosting needs neither an email domain nor Polar credentials; email and hosted billing remain opt-in.
- Restored the README button and documented owner setup, manual Git integration, custom domains, optional backends, and upgrades.

## Verified locally

| Check | Result |
| --- | --- |
| Clean repository copy and root `npm ci` | Passed with the shared lockfile; no private local files or existing build output required |
| Client and production app build; strict TypeScript; backend formatting | Passed |
| App tests against the built Worker | 83 passed; 3 PostgreSQL-only tests skipped here and covered below |
| Client package and tracker entry points | 18 package/browser tests and 19 module-entry tests passed |
| PostgreSQL integration | 59 passed against disposable local databases |
| Hyperdrive emulation | 58 passed |
| Renamed installation | Renamed Worker, D1 database, event queue, and dead-letter queue in an isolated copy; build and config validation passed |
| Fresh D1 migrations from built config | All 27 applied to isolated local storage; second application had no pending migrations |
| Wrangler deployment dry run | Passed with renamed bindings, 413 assets, and approximately 1.45 MiB compressed Worker upload |
| Unprovisioned deploy guard | Stopped before any Wrangler invocation |
| Dependency audit | `npm audit` reported zero known vulnerabilities, including development dependencies |
| Secret scan | Gitleaks found no matches in remote-main history or all 128 locally available commits, including tool checkpoints; current text files also scanned |
| GitHub state | Private repository; only `main` advertised by the remote; latest existing CI run successful |

These checks establish local behavior, not live provisioning, production performance, inbox delivery, or the absence of every possible vulnerability or secret. The public repository is source-available under [Elastic License 2.0](../LICENSE.md).

## Required live deployment acceptance

Use a fresh Cloudflare account or isolated test resources after the release source is available to the deployment service:

- [ ] The deploy form discovers the root config and prompts for exactly the two owner secrets.
- [ ] Worker, D1, and both queue names can be changed; all producer, consumer, and dead-letter references remain consistent.
- [ ] Provisioning, build, migrations, and deployment complete without manual source repair.
- [ ] `/health` succeeds and `/setup` creates an owner with the bootstrap secret; a second owner is rejected.
- [ ] Login survives a redeploy with the same auth secret and a real tracked pageview reaches the dashboard through the queue.
- [ ] Both cron schedules are installed, the dead-letter queue is bound, and repeat deployment preserves data with no pending migrations.
- [ ] Optional email, custom domains, PostgreSQL/Hyperdrive, and payment integrations receive their own live checks when enabled.

Record the tested revision, date, deployment URL, and outcome here. Do not publish secrets or database credentials.

## Other release work

The existing [release roadmap](ROADMAP.md#before-public-release) still calls for owner recovery and partial-setup repair, portable backups/exports with tested restoration, capacity and cleanup-lag benchmarks, and live Stripe test-mode delivery. Basic upgrade instructions are now in [deployment](DEPLOYMENT.md#upgrades-and-live-acceptance); code rollback is not a database rollback.

## Publishing a clean history

A single root commit named `Initial public release` can preserve the complete reviewed source tree while excluding earlier commit messages. Keep the original history in a private Git bundle outside the published repository. Compare the new commit's tree with the reviewed source before replacing the remote branch.

Replacing an existing GitHub branch requires a deliberate history rewrite and an explicit expected old commit (`--force-with-lease`), followed by checking remote branches and tags. Keep backups and local tool checkpoint refs private. A history rewrite is not a substitute for rotating a credential if one is ever discovered.
