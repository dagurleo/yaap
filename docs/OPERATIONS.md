# Operations

## Collection

Website Settings has event and payment retention, bot exclusion, and ingestion activity. Only the signed-in owner can read or change these settings. Bot exclusion defaults on; retention defaults off for both new and existing sites.

Known bots are detected from Cloudflare's verified-bot metadata when available and common crawler, preview, headless-browser and command-line user agents. This is a heuristic, not a complete bot detector or an authentication boundary. Turn it off for a site when intentionally collecting synthetic traffic. Excluded requests return 202 without queueing an event. Origin validation and rate limits still apply.

Counters cover validated site traffic and queue processing: queued, stored, duplicate, bot excluded, enqueue failure, write failure, and expired replay. Invalid requests and rate-limit rejections are not assigned to a site's counters. Counters are best-effort database writes independent of delivery; a monitoring failure is logged and does not reject a stored event. Queued minus stored is **not** backlog. A retry can increment failure counters several times. The dashboard retains 30 days of counters and displays the current UTC hour plus the previous 23.

## Retention

After cleanup, the hourly cron also rebuilds up to 14 pending complete-day traffic/activity summaries and their session caches. Event mutations invalidate summaries transactionally; reports use raw data until rebuilding succeeds.

The hourly cron deletes at most 5,000 expired events and 5,000 expired payments per configured site per run. Event age uses server receipt time; payment age uses the original payment time. Large backlogs drain over multiple runs, so this is not an exact deletion deadline. Last retention run records a successful site cleanup pass, even when no records expired.

Event and payment policies are independent. Cleanup does not delete website definitions, goals, funnels, integration settings, or owner credentials. Request-limit buckets and old operational counters are cleaned separately. Default zero means no automatic expiration, not unlimited storage capacity.

Expired event replays are acknowledged without reinsertion. The payment API returns 410 for payments older than the current policy; signed Stripe deliveries return 200 with `ignored: retention`. Disabling or lengthening retention can admit older replays again; deleted rows cannot be restored by changing the setting alone.

Deleting event history affects traffic reports and visitor classification. Finalized [payment attribution](PAYMENTS.md#backfill-and-retention) retains its saved dimensions; snapshots expire with their payments. Eligible pageviews for missing or pending attribution are temporarily protected until backfill/finalization, so maintenance backlogs can delay raw cleanup. Revenue history changes when payments expire. Save an operator-controlled backup before enabling retention if that history is needed.

## Delivery failures

The consumer acknowledges after a successful database insert (or a confirmed duplicate). Failed writes retry; the main queue sends exhausted messages to its dead-letter queue after three retries. A malformed message cannot crash processing of later messages in the batch. Worker logs identify failures without logging event bodies or payment credentials.

Use the Cloudflare dashboard to inspect queue backlog, dead-letter messages, and Worker logs. Resolve the underlying binding, migration or write error before replaying messages. Replay the original analytics body to the main queue, preserving `siteId`, `id` and `receivedAt`; change none of these to force a retry. Remove a dead-letter message only after confirming the main queue accepted it. Duplicate delivery is safe because events use the site/event composite key. Retention applies to replays.

No automatic dead-letter replay or operator export/restore command is included yet.

## Deployment review

`apps/web/wrangler.jsonc` declares one Worker, static assets, the selected database binding, the main queue, the dead-letter queue, hourly cleanup and observability. `npm run deploy` builds, applies migrations for the provider in the generated configuration, then deploys. D1 migrations use **DB**; PostgreSQL migrations use the production `DATABASE_URL` build secret and require a configured Hyperdrive runtime binding. Do not run that command for local checks.

`npm run check` builds and exercises the deployment bundle with isolated D1 and Queues. `npm run check:deploy` validates both source and generated resource references without accessing an account. CI also runs PostgreSQL and local Hyperdrive suites and applies migrations twice to fresh databases. Development and local preview use port 8790.

Use Workers Builds with the complete repository and the monorepo settings in the [deployment guide](DEPLOYMENT.md). The Worker name is `yaap`; existing `os-analytics` database and queue defaults are retained. Runtime secrets are declared in `apps/web/.dev.vars.example`. No OAuth provider, email service, Stripe credential or additional Worker is required. Keep `BETTER_AUTH_SECRET` stable: it signs authentication, hashes analytics identities, and encrypts optional Stripe webhook secrets.

Still requiring a later authorized live test:

- Fresh deployment into the selected account from the public repository.
- Renamed Worker, D1 and both queues; verify consumer/dead-letter references.
- Owner setup, receipt of a real pageview, queue drain, cron execution, and redeployment with existing data.

License selection, owner recovery, export/restore procedures and load testing remain public-release work tracked in the [roadmap](ROADMAP.md#before-public-release).

References: [Deploy buttons](https://developers.cloudflare.com/workers/platform/deploy-buttons/), [Wrangler configuration](https://developers.cloudflare.com/workers/wrangler/configuration/), [queue delivery guarantees](https://developers.cloudflare.com/queues/reference/delivery-guarantees/).
