# Public dashboards and the demo

Owners can open **Website settings → Public dashboard**, enable sharing, choose additional reports, and save. **Copy public dashboard link** and **Preview public dashboard** use `/share/<public-id>`. Visitors need no account. Opening that URL while signed in still shows the public, read-only view.

Public pages reuse the dashboard layout, sidebar, website picker, report search, help and report components. Public capabilities hide private controls and unshared reports; navigation stays within the public share. Only authenticated pages load the account's website list.

Sharing is off by default. Enabling it exposes aggregate traffic: page paths, referrers, campaigns, geographic/device breakdowns and session metrics. Additional categories are independently opt-in:

| Option | Public data |
| --- | --- |
| Events & properties | Individual events, names, paths and recorded properties |
| Visitors & journeys | Visitor identifiers, location and browsing history; event properties and linked payments follow their separate options |
| Goals & funnels | Definitions, matching conditions and conversion reports |
| Revenue & payments | Revenue, attribution, payment references and refunds |

Owners should review recorded properties and conditions before publishing them. Public links are public access, not invitations or authenticated viewer memberships. Share pages request `noindex, nofollow`, omit referrers and are served without caching; indexing directives are not access control.

Turning sharing off and saving denies subsequent public reads immediately. Previously downloaded or displayed information cannot be recalled. Re-enabling sharing reuses the same link. Existing owner/viewer access is unaffected. Settings, billing, credentials, membership management and all user-facing mutations continue to require authentication and ownership. Anonymous report functions resolve exactly one enabled share on every request, enforce the requested category and redact cross-report details. Public and private reports use separate browser query caches.

## Local demo

Apply the new migration for the selected backend, then run:

```sh
npm run db:seed -- --demo --sessions 5000
```

This creates a **new synthetic Atlas Demo site**, enables its public reports and writes its ID as `YAAP_DEMO_SITE_ID` in the local `apps/web/.dev.vars`. Existing websites are preserved. Restart the development server if it does not reload bindings. Run `npm run db:rollup:postgres` or `npm run db:rollup:local` to populate summaries, then open `/demo`. The homepage shows **View demo** only while a configured demo is public. The demo displays a sample-data label and a Get started link.

`--public` enables public sharing on a new local seed without making it the installation demo. The normal seed command still refuses remote database connections. Both options expose only generated synthetic data.

## Existing production Worker

1. Deploy the code and apply `0027_public_site_sharing.sql` for D1 or `0015_public_site_sharing.sql` for PostgreSQL through the usual migration workflow.
2. Generate a synthetic dataset for an existing owner/workspace in that installation. Read their IDs from the target database; do not substitute local IDs:

   ```sh
   npm run db:seed -- --demo --sessions 5000 --output /tmp/yaap-demo.sql --owner-id OWNER_ID --workspace-id WORKSPACE_ID
   ```

   Export refuses to overwrite a file and does not connect to a database. It prints the new site ID and public URL. Import the SQL into the existing database using the installation's normal operator tooling (Wrangler D1 execute with `--remote --file` for D1, or a PostgreSQL transaction). A failed D1 import can leave a partial new site; inspect it before retrying.
3. Set `YAAP_DEMO_SITE_ID` to the printed site ID on the **existing Worker**, and deploy that configuration. `/demo` redirects to the site's public overview with 30 days selected. No additional Worker, database or queue is required.
4. Keep the existing hourly maintenance cron enabled. It appends bounded, deterministic synthetic traffic and USD payments for the last 24 completed hours, then the normal rollup job updates summaries. Stable IDs prevent duplicates on retries. The demo must be public and retain the synthetic `https://atlas-demo.example` origin for refreshes to run. Customer sites are never selected automatically. The minute-by-minute billing repair cron does not generate demo traffic.

The demo does not simulate ongoing browser presence. An online count of zero is valid. Scheduled refreshes keep recent reports populated; they do not replay months of missed history after an extended outage. Development servers do not automatically invoke Cloudflare cron events.
