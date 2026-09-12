# Payments

Open **Revenue → Payment settings** for a website. Create a server API key or configure Stripe signing secrets. Test and live reports are separate. No Stripe connection is required to deploy the analytics app.

## Server API

Keep the API key on your server. It can write payments only for its website; it cannot read reports, access authentication or change settings. Rotation immediately invalidates the old key; revocation disables API ingestion. Only a hash is stored, and the full key is shown once.

Send `POST https://ANALYTICS_HOST/payments/SITE_ID` with `Authorization: Bearer osa_...` and `Content-Type: application/json`:

```json
{
  "id": "order_123",
  "mode": "test",
  "amount": 2900,
  "currency": "USD",
  "paidAt": 1788950000000,
  "refundedAmount": 0,
  "visitorId": "CONSENTED_BROWSER_UUID",
  "identityEnabled": true
}
```

Use the actual payment timestamp in milliseconds. `mode` must be `test` or `live`. Amounts are positive integer charge units: `2900` means USD 29.00, and `2900` means JPY 2,900. ISK and UGX use Stripe's two-decimal compatibility units (`500` means 5 ISK). MGA uses zero-decimal charge units. See [Stripe currency rules](https://docs.stripe.com/currencies).

Omit `visitorId` and `identityEnabled` for an unattributed payment. Do not invent an identity or derive one from email/IP. The API accepts timestamps from 2000 onward with at most five minutes of clock skew.

A stable `id` deduplicates by website, provider and mode. Retry network failures, 429 and 5xx with the same ID. Success is 202. To record a refund, resend the same payment with its **cumulative** `refundedAmount`, bounded by the original amount. An older, smaller refund total is ignored. Conflicting currency, timestamp, amount or non-null visitor identity returns 409. A previously missing identity may be linked later when identifiers are enabled. Sending the same sale through both the server API and Stripe creates two independent records; choose one ingestion path per sale.

## Consent and checkout

The tracker exposes `window.osAnalytics.getVisitorId()` with full analytics enabled by default. It returns `null` while collection is paused, identifiers are disabled, the page is prerendering, or storage is unavailable. The implementer must apply their consent/privacy choices before using this identifier.

```ts
// Browser: send this with your existing checkout request.
const visitorId = window.osAnalytics?.getVisitorId() ?? null;
```

Your checkout server must validate its request and create the actual payment. Revenue amounts must come from your server/payment provider, never a browser-provided amount. Only attach analytics metadata when identifiers are enabled by your integration. This flag describes tracking configuration; it does not attest that consent was given. Example for a Stripe Checkout one-time payment:

```ts
const metadata = visitorId
  ? { os_analytics_visitor_id: visitorId, os_analytics_identity_enabled: "true" }
  : {};

const checkout = await stripe.checkout.sessions.create({
  mode: "payment",
  line_items: [{ price: YOUR_PRICE_ID, quantity: 1 }],
  success_url: YOUR_SUCCESS_URL,
  cancel_url: YOUR_CANCEL_URL,
  payment_intent_data: { metadata },
});
```

Use your existing authenticated TanStack Start server function for checkout; keep Stripe and analytics API keys in its server environment. Stripe copies PaymentIntent metadata onto its charge. Checkout Session metadata alone is insufficient. For subscriptions or other payment flows, attach the same identifier metadata to each relevant PaymentIntent/charge in your server integration; customer emails and subscription metadata are not used to infer identity. [Metadata propagation](https://docs.stripe.com/metadata).

## Stripe webhooks

Create a **snapshot** event destination in Stripe for the website and mode:

`https://ANALYTICS_HOST/payments/stripe/SITE_ID/test`

Use `/live` for live events. Subscribe to `charge.succeeded`, `charge.captured`, and `charge.refunded`. Save that endpoint's `whsec_...` signing secret under the matching mode in Payment settings. Separate test/live secrets are encrypted at rest with AES-GCM; keep `BETTER_AUTH_SECRET` stable so they and visitor identities remain usable. Disconnect removes the saved secret. The app does not need your Stripe API key.

Signatures are verified against the bounded, unmodified request body with a five-minute timestamp tolerance. Test/live mismatches are rejected. Unpaid or uncaptured charges and unrelated event types are ignored. Payment and refund snapshots upsert by charge ID, so duplicate and out-of-order deliveries do not inflate totals or undo recorded refunds. Stripe payments use the charge's creation timestamp and captured amount. Refunds use `amount_refunded`; no full webhook payload, email, address, card details or customer profile is stored. [Webhook delivery and signing](https://docs.stripe.com/webhooks), [Charge fields](https://docs.stripe.com/api/charges/object).

For local Stripe CLI testing, forward those events to `http://localhost:8790/payments/stripe/SITE_ID/test` and save the CLI's test signing secret. No live account or charge is needed for the repository's automated tests.

## Reports

Revenue shows captured amount, refunds, net revenue, payment count and distinct linked customers, separately per currency. Refunds restate the original payment period. Comparisons use the preceding calendar period. The report is payment analytics, not a cash-flow or accounting ledger; fees, exchange-rate conversion, disputes and reversals of previously recorded refunds are outside this release.

Revenue reads **saved attribution records**, not live joins to raw events. Each record captures its model and lookback when first initialized. The default is first touch with a 30-day lookback; Payment settings offers first touch or last non-direct touch and an integer window of 1–365 days. Policy changes affect new attribution records, including legacy payments not yet backfilled. Existing records keep their policy.

- **First touch:** earliest retained identified pageview within the inclusive window `[paidAt − lookbackDays, paidAt]`, ordered by timestamp then event ID ascending.
- **Last non-direct touch:** latest pageview with a campaign source or external referrer in that window; if none exists, latest direct pageview. Timestamp and event ID descending break ties. Source context follows the [tracker's campaign persistence rules](TRACKING.md#source-and-campaign-definitions), so this model selects pageview context rather than reconstructing marketing clicks.
- **Dimensions:** source, campaign, path, location and technology filters use the chosen pageview's saved values. The displayed landing page is that touch's path; it differs from the session landing-page definition in [conversion performance](CONVERSION_PERFORMANCE.md).

### Reconciliation and finalization

New records stay pending for at least **72 hours from attribution initialization**, including backfills of older payments. Payment delivery, revenue reads, explicit **Reconcile retained history**, and hourly maintenance reconcile pending records. Queue events become eligible once stored; they do not trigger a report recalculation on every event. Better candidates replace pending matches, but deleting a candidate's raw event does not erase the saved match. Replay and concurrent reconciliation cannot downgrade a saved candidate.

The first reconciliation at or after the deadline takes one final view of available history and freezes the record. This is a minimum reconciliation interval, not an exact wall-clock deadline: delayed maintenance can extend it. Events arriving after finalization never reassign revenue. Identity supplied before the final check can attribute a pending payment; identity linked after finalization can update the payment/customer link but does not reopen its frozen attribution. Refunds and repeated deliveries retain the same snapshot and model while updating cumulative refund totals.

Missing identity is reported separately from no matching pageview in the lookback window. Anonymous pageviews are never assigned retroactively. The report shows pending/finalized state, model/window and unmatched net revenue separately by currency. Pending and unmatched payments remain in overall monetary totals.

### Backfill and retention

Initialization and reconciliation each process at most 200 records per call, scoped to a payment, website or hourly global maintenance. Backfill progresses in stable order; pending work uses the oldest check time to avoid starvation. Reports include uninitialized payments as **Awaiting backfill**, with null dimensions, until a later refresh or maintenance run checks their retained history. **Reconcile retained history** is an idempotent owner action; it does not reset finalized records or recover deleted events. A payment accepted just before an interrupted initialization is repaired by a retry, report read or maintenance.

Snapshots have no foreign key to raw events. They retain the selected event ID, timestamp, hashed visitor and attribution dimensions for the payment's lifetime, even after raw-event expiration. Payment deletion/retention cascades to its snapshot. During backfill and reconciliation, cleanup temporarily preserves eligible pageviews for linked payments whose attribution is missing or pending. These events become eligible for normal cleanup after finalization; a maintenance backlog can delay that cleanup. Raw-event expiry otherwise continues normally. Existing deleted history cannot be reconstructed from rollups.

Attribution is separate from traffic/session summaries. It does not archive complete visitor journeys or recover event properties. Revenue still keeps currencies separate and refunds restate the original payment period.

### Owner-session API

`GET /api/sites/:siteId/payment-settings` includes `attributionModel` and `attributionLookbackDays`. Send `POST` to that endpoint with `{"action":"attribution","model":"last_non_direct","lookbackDays":30}` to set the policy for new records, or `{"action":"reconcileAttribution"}` to process a bounded batch. Both require site ownership and same-origin authentication.

Revenue payment rows include `attributionModel`, `attributionLookbackDays`, `attributionStatus` (`pending`, `finalized`, `backfill_required`), `attributionFinalizedAt` and `attributionReason` (null, `missing_identity`, `no_matching_pageview`, `backfill_required`). The dashboard report's `attribution` groups summarize model/window/state/reason by currency with payment counts and net amounts. API/MCP payment reads use the same snapshots; aggregate metadata identifies the model as `per_payment_snapshot` because a range may contain different captured policies.

Payment history is paginated. Linked payments can open a visitor journey when event history remains. Journeys show the latest 20 linked payments across modes, with test payments marked; View revenue opens that visitor's live report, where mode and dates can be changed.

## Upgrade and runtime

Apply D1 migration `0019_payment_attribution.sql` or PostgreSQL migration `0007_payment_attribution.sql` before running this version. Use the normal [database migration commands](DATABASES.md); this adds the snapshot table and default policy fields without rewriting payments. Existing payments are backfilled in bounded batches on reports, manual reconciliation or hourly maintenance. A legacy installation may temporarily show awaiting-backfill amounts.

Revenue no longer polls every 15 seconds, retries failed reports automatically, or refetches on window focus. Use Refresh revenue or Reconcile retained history. An isolated PostgreSQL fixture backfilled 200 payments and read the revenue report against 100,000 events in 144 ms on the development machine; this is not a production capacity guarantee. The existing 15-second PostgreSQL statement bounds still apply.

## Verification

The isolated suite exercises API authentication and key rotation/revocation, per-site boundaries, concurrent duplicate deliveries, cumulative refunds before/after payment delivery, signatures and replay tolerance, test/live separation, identifier linkage, late event attribution, currency separation, filtering, comparisons, pagination and owner-only server functions. It uses isolated synthetic fixtures on D1 and PostgreSQL, including local Hyperdrive emulation. Live Stripe delivery is not verified until you configure an endpoint.

Legacy `consent: true` API payloads and `os_analytics_consent: "true"` Stripe metadata remain supported as identifier switches. Prefer `identityEnabled` and `os_analytics_identity_enabled` for new integrations. An explicit new flag takes precedence over its legacy equivalent.
