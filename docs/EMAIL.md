# Outbound email infrastructure

Yaap uses the native Cloudflare Email Service `EMAIL` Worker binding. React Email supplies JSX templates and rendering; Cloudflare handles delivery without an email API token. The foundation provides `sendEmail` for raw content and `sendTemplateEmail` for React templates. Website invitations send only after an owner explicitly requests them. Hosted billing sends durable owner notices at 80%, 100%, the 110% collection ceiling, three days before trial end, at trial end, and after the three-day trial grace. Report subscriptions and scheduled report delivery are future work.

## Enable production sending

1. In the same Cloudflare account as the Yaap Worker, open **Compute > Email Service > Email Sending**, select **Onboard Domain**, and select your sender domain. Review the DNS records Cloudflare proposes and finish onboarding. Wait for verification. The domain must use Cloudflare DNS.
2. Set the Worker's `EMAIL_FROM` runtime variable to a bare sender address such as `reports@example.com`. Optionally set `EMAIL_REPLY_TO` to a monitored bare address. Hosted mode also uses `BETTER_AUTH_URL` as the trusted absolute app origin for Billing links and `BILLING_ALERT_EMAIL` as the internal recipient for one-time trial-ended notices. Leave `EMAIL_FROM` unset to keep sending disabled. These addresses are configuration, not credentials; they can also be maintained in `vars` in the root `wrangler.jsonc`.
3. Optionally restrict the `EMAIL` binding in the root `wrangler.jsonc` to that sender using `allowed_sender_addresses: ["reports@example.com"]`. If you add this restriction, update it whenever `EMAIL_FROM` changes. The default binding allows changing the sender through the variable alone. Do not set a fixed destination for report delivery.
4. Run `npm run check`, then deploy through the existing deployment process. Validate a deliberately requested test email before enabling reports. Provider acceptance returns `messageId`; this is not proof of inbox delivery. Inspect Email Service logs for delivery, suppression, and bounces.

See Cloudflare's [domain onboarding guide](https://developers.cloudflare.com/email-service/get-started/send-emails/), [binding restrictions](https://developers.cloudflare.com/email-service/configuration/send-bindings/), and [Workers API](https://developers.cloudflare.com/email-service/api/send-emails/workers-api/). Account sending limits and recipient eligibility apply; verify these for the production account before rollout.

The default deploy template omits email. Add `"send_email": [{ "name": "EMAIL" }]` to the root `wrangler.jsonc` and rebuild when enabling it. The workspace config retains the simulated binding for local development.

## React Email templates

Run `npm run email:dev` from the repository root and open http://localhost:3001. This runs the React Email preview separately from the Yaap app on port 8790. It does not send mail or require Cloudflare credentials.

- `apps/web/src/emails/report-ready.tsx`: starter template with typed props and sample `PreviewProps` for the preview UI.
- `apps/web/src/emails/site-invitation.tsx`: website-viewer invitation with the selected site's scope, inviter, expiry, and acceptance link.
- `apps/web/src/emails/billing-notice.tsx`: shared usage-limit and trial-lifecycle notice with a Billing action.
- `apps/web/src/emails/_components/email-layout.tsx`: shared layout, typography, and footer. Underscore-prefixed folders stay out of the preview sidebar.
- `apps/web/src/server/email-template.ts`: server-side `renderEmail` and `sendTemplateEmail` helpers. HTML is rendered once, then converted to plain text.

Add templates as default-exported `.tsx` components under `src/emails`, with typed props and `PreviewProps`. Use React Email components and inline styles rather than dashboard components or application CSS. Use absolute HTTPS links and hosted image URLs. Preview data is only for development; callers must supply real props. React escapes interpolated text. Avoid injecting raw HTML.

The current [React Email setup](https://react.email/docs/getting-started/manual-setup) uses `react-email` for components/rendering and `@react-email/ui` for development previews. Both are pinned in the workspace and root lockfile.

### Sending a template

From server-side TSX:

```tsx
import ReportReadyEmail from "../emails/report-ready";
import { sendTemplateEmail } from "./email-template";

const { messageId } = await sendTemplateEmail(env, {
  to: recipient.email,
  subject: "Your Yaap report",
  template: (
    <ReportReadyEmail
      siteName={site.name}
      periodLabel={periodLabel}
      dashboardUrl={dashboardUrl}
    />
  ),
});
```

For `.ts` callers, use `createElement(ReportReadyEmail, props)` from React. Derive the dashboard URL from your trusted app origin and the authorized site, and include the relevant report filters. The starter template does not query metrics or implement a reporting cadence. Add subscription preferences/unsubscribe controls with the reporting feature before enabling recurring mail.

Production sends render with real props at runtime. Keep rendering imports server-side. The preview UI can inspect the rendered HTML and plain text; its Send control belongs to React Email’s own provider integration, so use `sendTemplateEmail` when wiring Cloudflare delivery.

## Raw content usage

```ts
import { sendEmail } from "./email";

const { messageId } = await sendEmail(env, {
  to: recipient.email,
  subject: "Your Yaap report",
  text: "Your report is ready.",
  html: "<p>Your report is ready.</p>",
});
```

The helper validates configuration, recipient, subject, and content before sending. It requires plain text and accepts optional HTML. Template callers must escape dynamic HTML. Each call sends to one recipient, and callers must derive authorized recipients server-side. No public sending endpoint is exposed.

Provider errors propagate unchanged so future report delivery can distinguish suppression, configuration problems, and rate limits. The helper does not log addresses or content, swallow failures, or retry ambiguous sends. Add persistent delivery records and a duplicate prevention strategy with the reporting scheduler.

## Local verification

Set `EMAIL_FROM=reports@example.com` in `apps/web/.dev.vars`. For hosted billing notices, also set `BETTER_AUTH_URL` to the app or current HTTPS tunnel origin and `BILLING_ALERT_EMAIL` to the operator inbox. The checked-in binding has no `remote: true`, so local Wrangler/Vite delivery is simulated. Tests exercise the helper with a fake binding without delivering mail. Do not enable a remote binding for ordinary development or CI.

Run the focused tests from `apps/web` with `node --test tests/email.test.mjs tests/email-template.test.mjs`. The template tests render inside Miniflare/workerd and capture the outgoing payload without sending mail. `npm run check:deploy` after a build verifies that Vite preserved the email binding.

## Brand assets and styling

The shared email layout uses the dashboard's Graphite palette, Inter font (with Arial fallback), and the actual Yaap mark and wordmark. The PNG logo in `public/brand/logo-email.png` is a 2×-plus raster export of `public/brand/logo-light.svg`, on a white backing for legibility. Email clients that block web fonts use the fallback font.

By default, logo and font URLs are absolute URLs under `/brand` on the dashboard origin. Deploy these public assets before sending the redesigned emails. If assets live on a separate public host, pass `assetBaseUrl` pointing to its brand directory. Preview props use `/static`, with copies of the same logo, font, and font license in `src/emails/static`; keep these copies in sync when changing brand assets.

The optional `metrics` prop accepts preformatted `visitors`, `pageviews`, and `conversions` values. Without it, the metrics row is omitted. The sample numbers exist only in `PreviewProps`. Metrics stack and the report button expands on narrow screens; inline base styling remains usable in clients that strip media queries. The layout targets the light dashboard theme; some email clients may apply their own dark-mode color transformations.
