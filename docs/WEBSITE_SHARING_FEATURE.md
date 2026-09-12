# Website sharing and lightweight accounts

Scoped and implemented 2026-09-12. User direction: invite teammates to view selected websites, keep the product simple, and include viewers in all paid traffic tiers without seat charges.

## Implementation status

The first implementation is complete in the application, D1, and Postgres paths:

- Existing owners and sites are backfilled into lightweight workspaces without changing site IDs or analytics history.
- Owners can invite, resend, revoke, and remove website viewers from **Website settings → People**. Invitations use hashed, expiring, rotating tokens and explicit acceptance.
- Invitation-gated registration and verified matching-account acceptance are supported. Visiting a link never grants access by itself.
- Viewers can read the selected website's analytics, visitor details, funnels, conversions, and revenue. Owner-only settings, mutations, integrations, billing, credentials, and site creation stay unavailable.
- Owned and shared websites are separated in navigation, with viewer capabilities represented in safe site DTOs.
- D1, direct Postgres, and Hyperdrive test suites cover authorization, invitation lifecycle, revocation, and email failure behavior.

Production email delivery still requires the `EMAIL` binding, a verified sender domain, and `EMAIL_FROM` as described in [EMAIL.md](EMAIL.md). Provider acceptance is recorded but does not prove inbox delivery. Hosted subscription lifecycle work remains separate from sharing; viewers follow the owning account's entitlement once that billing layer is enabled. Viewer-issued API keys, OAuth/MCP grants, additional roles, teams, account-wide sharing, and public links remain deferred.

## Outcome

An owner opens **Website → Settings → People**, invites a teammate by email, and grants read-only access to that website. After accepting and signing in, the teammate sees it under **Shared with you**. They cannot see the owner's other sites, billing, integration settings or credentials. The owner can remove their access.

One lightweight account owns the subscription and websites. Call its database entity `workspaces`, consistent with the hosted billing scope; call it **Account** in customer-facing billing settings. Automatically create it when an owner is provisioned. No workspace creation wizard, organization hierarchy or workspace switcher is required for sharing.

Example: Dagur's account owns Sites A, B and C. Alex receives access to A and C; Sam receives access to B. Their logins show only those grants. Adding Site D grants neither teammate access automatically. Alex can also own a separate paying account or accept site invitations from another customer. All events remain billed to the account that owns their originating site.

## Scope and decisions

| Area | First implementation |
| --- | --- |
| Ownership | One owner per account; one owned account per user. A user may view sites from many accounts. |
| Viewer role | Read-only access to one explicitly selected website. No account-wide membership inheritance. |
| Invitations | One site and one email per invitation; repeat from another site's People page to share more sites. |
| Commercial packaging | Invited viewers included in every paid volume tier; no viewer subscription or seat charge. |
| Navigation | Your websites and Shared with you; select websites directly. |
| Billing | Account owner alone manages the Polar customer/subscription and pooled allowance. |
| API/MCP | Existing owner credentials continue working. Viewer dashboard/session reads are in scope; delegated viewer API keys and OAuth/MCP grants are deferred. |
| Hosting | Implement shared access rules for D1 and Postgres. Existing self-hosted owner flows stay usable without Polar or email configuration. |

Defer editor/admin roles, teams/groups, account-wide invitations, automatic access to future sites, ownership transfers, multiple owners, public sharing links, bulk invitations, SSO and seat billing. Do not add an organization plugin merely to represent a site-level grant. Revisit it if later requirements need organization membership or team roles.

## Permissions

Owner is derived from the website's account, not stored as a mutable membership role. The only persisted site membership role in this release is `viewer`.

| Action on a selected site/account | Account owner | Site viewer |
| --- | --- | --- |
| View overview, traffic and real-time reports | Yes | Yes |
| View events, custom properties and visitor journeys | Yes | Yes |
| View existing goals, funnels and conversion reports | Yes | Yes |
| Change report date, filters or comparison locally | Yes | Yes |
| View revenue reports and attributed payment data | Yes | Yes |
| Create/edit/archive goals or funnels | Yes | No |
| Change site, tracking, attribution or retention settings | Yes | No |
| View integration configuration, API secrets or operational settings | Yes | No |
| Connect providers, ingest payments through management tools, rotate keys | Yes | No |
| List people, invite, resend, revoke or remove another member | Yes | No |
| Manage billing, account usage or owned site creation | Yes | No |
| Create credentials for the shared site | Yes, as its owner | No |

Invitation copy must explicitly say **view all analytics for this website, including visitor details and revenue**. This avoids implying a traffic-only role. Separate revenue permissions are a later feature. Site viewers should receive a safe display DTO (ID, name, origin, reporting timezone, capabilities), not the full site/configuration record.

An invited user who owns a different account retains management rights on their own account only. Read permissions on a shared site must never become global owner privileges. A revoked user receives no site data or existence details on subsequent unauthorized requests. Already downloaded data cannot be recalled.

## Data model

Update both [D1 schema](../apps/web/src/db/analytics-schema.ts) and [Postgres schema](../apps/web/src/db/postgres/analytics-schema.ts), using existing timestamp, identifier and JSON conventions. These are logical fields; choose exact Drizzle declarations during implementation.

| Table/change | Fields and invariants |
| --- | --- |
| `workspaces` | `id`, `owner_user_id`, `created_at`, `updated_at`; unique owner, FK to auth user. Stable billing/ownership ID. Avoid `accounts`, which can be confused with Better Auth's auth-account table. |
| `sites.workspace_id` | Required FK to owning workspace after backfill. Index for account site enumeration. Events still reference site IDs; do not rewrite the event history to implement sharing. |
| `site_memberships` | `site_id`, `user_id`, `role='viewer'`, `created_at`, `created_by_user_id`; unique `(site_id,user_id)`, index on user for shared-site listing. No member row needed for the account owner. |
| `site_invitations` | `id`, `site_id`, `email_normalized`, `token_hash`, `created_by_user_id`, `created_at`, `expires_at`, `accepted_at`, `accepted_by_user_id`, `revoked_at`, `last_sent_at`, `send_status`, optional provider message ID. Unique token hash. |

Use the same email canonicalization as the authentication system. Do not strip plus aliases or provider-specific punctuation. An accepted grant binds to immutable user ID; later email changes must not move the grant to somebody else.

Allow at most one current pending invitation per `(site_id,email_normalized)` through a provider-safe database constraint/atomic write strategy. Expiry is evaluated from timestamps, not a time-dependent index predicate. Resend rotates the token and invalidates the earlier link. Removing a member also cancels any pending invitation for that same site/user email, so an old pending link cannot immediately restore access. A fresh authorized invitation may grant access again.

Site deletion removes its memberships and invitations. Deleting a viewer removes their memberships without affecting the sites or billing. Do not cascade deletion of an owning user into an entire billed account as part of this feature; owner-account deletion/transfer requires its own lifecycle.

## Migration and account provisioning

1. Add workspace/membership/invitation tables and nullable site workspace IDs.
2. Backfill one workspace per existing owner, preserving site IDs, event history, payment attribution and credentials. Use the existing single-owner installation user even when it has no sites. Do not create an owned workspace for newly invited guests merely because an auth user exists.
3. Populate each site's workspace from its existing owner. Check that every site resolves to exactly one account and no owner/site relation changes.
4. Migrate all ownership queries to workspace ownership. `sites.owner_id` may remain temporarily for compatibility, but it must be kept consistent by the write path; it must not become a second independently editable authority. Remove it only after all consumers and migration tooling have been updated.
5. Make the site workspace FK required using provider-appropriate migrations. Test upgrading existing databases and rerunning the migration runner.

Owner setup creates auth identity and the lightweight account without leaving a usable half-provisioned state. Creating a paying account later is a deliberate hosted onboarding action, not a side effect of accepting an invitation. A guest with no owned account goes directly to shared sites rather than setup, trial or checkout.

Account bootstrap detection must no longer use “any auth user exists.” Check initialized ownership/account state. Preserve the existing bootstrap secret and setup-race protections. Shared access can be implemented and tested before Polar integration; it must not require live checkout.

## Invitation flow

1. Owner opens People. Show the owner, active viewers, pending invitations and their status. Invite uses a single email input with a fixed Viewer role and the explicit data-access explanation above.
2. Server authenticates the actor and checks ownership of the selected site. Refuse inviting the owner; return an idempotent already-has-access result for existing members. Do not reveal whether the email has a Yaap account.
3. Generate a high-entropy opaque token, store only its hash, and give it a seven-day lifetime. Create/rotate the pending invitation before sending, so accepted email never points to a nonexistent invite.
4. Send an email using the existing [email helper](../apps/web/src/server/email.ts) and [email configuration](EMAIL.md). Include inviter/site display names, access scope, expiry and acceptance link. Escape HTML, include plain text, and build the link from the configured canonical app origin.
5. Landing on the link shows a minimal invitation preview. GET must not grant access or consume the token; email link scanners must be harmless. Require sign-in or invitation-gated registration and explicit acceptance.
6. Require proof of the invited mailbox and a matching authenticated user. A verified matching account may accept; new/unverified accounts must complete an appropriate verification flow. The invitation may serve as mailbox proof only through the auth library's supported server-side flow. Never allow the browser to set verified status. A different signed-in email sees a switch-account prompt and receives no grant.
7. Acceptance atomically verifies unexpired/unrevoked state, current site ownership and allowed account state, inserts/upserts membership and marks the invitation accepted. Accept/revoke races must not leave a grant after revocation wins. A repeated accepted request by the same user is idempotent; a removed membership is not recreated by replaying the accepted token.
8. Redirect to the shared site's overview and refresh accessible-site queries. If it is the user's only site, no owner onboarding is shown.

Proposed delivery controls: 60-second resend cooldown, five sends per site/recipient per day and 30 invitation sends per owner per hour, plus existing global/request limits. These are abuse bounds, not billable seat limits. Persist send outcome; provider acceptance is not inbox delivery. On a definite failure retain a retryable pending invitation; on ambiguous failure show an unknown state and require a controlled resend instead of silently creating more messages. Token rotation and retries must have an explicit implementation strategy; no raw tokens in logs, analytics or long-lived plaintext delivery records.

Use expiring, single-use links and same-origin/CSRF protections for acceptance and invitation mutations. Keep token-bearing pages free of third-party tracking, use a restrictive referrer policy and prevent tokens being forwarded via arbitrary return URLs. Expired, revoked and deleted-site links show a neutral explanation with a route back to sign-in/sites. Owners can revoke a pending invitation even if sending failed.

If email is unconfigured, People explains that sending must be configured and the API fails without claiming mail was sent. Do not introduce a public email-sending endpoint or expose invite tokens through list responses. Automated tests use the fake email binding; real email delivery needs separately authorized production verification.

## Authorization implementation

Use one set of server-side capabilities across dashboard server functions, legacy session HTTP API and public API/MCP dispatch. Suggested boundaries:

```text
requireUser(request) -> authenticated actor user ID
listAccessibleSites(actor) -> safe site metadata + owner/viewer capability
requireSiteView(actor, siteId) -> authorized read context
requireSiteManage(actor, siteId) -> owning account context only
requireAccountOwner(actor, workspaceId) -> billing/account management context
```

Keep actor identity, resource owner and workspace ID separate. Do not pass the site's owner ID as though it were the viewer's identity to satisfy old helper signatures; that could authorize writes and misattribute audit records. Avoid broadening `ownedSite()` in place while mutations still call it. Convert read and write callers deliberately.

Viewer access requires an active membership on that exact site. Account owner access is derived from `workspaces.owner_user_id`. A user with neither relationship gets the existing not-found style result. Every read rechecks authorization, including paginated journeys, direct URLs and export/download routes if present. Recheck relevant rights inside mutations so stale UI state is insufficient.

Service work triggered by a viewer read, such as lazy attribution reconciliation or summary maintenance, may continue only as internal, site-scoped behavior. It must not give the viewer a management operation, reveal configuration or let them modify attribution policy. Keep background/ingestion code clearly distinct from authenticated management paths.

Keep current owner-issued API credentials constrained to sites owned by their actor/account and their explicit scopes/site grants. `allSites` must not silently expand to shared sites. A session-only endpoint is not automatically owner-only. No viewer credential issuance or shared-site OAuth consent in v1; reject attempted delegated grants on the server. If delegated API/MCP access is introduced later, intersect token grants with current live site membership on every request, so membership removal also revokes effective access.

After revocation, subsequent reads fail and site listings omit the site. Clear relevant client caches on remove/accept/sign-out; cache keys include actor and site, and no shared authorization cache may retain a stale grant. An already rendered report in another browser is not guaranteed to disappear instantly; its next fetch/navigation must fail. Do not claim remote erasure of data already viewed.

## UI details

- Site picker/home distinguishes **Your websites** and **Shared with you**; shared cards show a Viewer badge and the site name/origin. Avoid exposing account email or unrelated site counts.
- Viewer-only accounts have no Create website, owner setup, billing or credential-management prompt. A separate voluntary “Create your own account” path may be added with hosted onboarding later.
- Show report tabs and filters for viewers. Hide settings, write actions and management controls; the server remains authoritative.
- People is an owner-only subsection of existing site settings. Include invitation status, resend/revoke, active members and remove access. Removal states which site is affected.
- Existing owners with no invitations see the current experience plus People. Email being disabled does not disable analytics or owner login.
- Shared-site access follows the owning account's service/billing state. The viewer's own subscription, if any, neither unlocks nor disables another account's site. Apply the hosted billing lifecycle when available; self-hosted has no Polar prerequisite.

## Current code map and hazards

Verified against the working tree when writing this document. Re-read these areas at the start of implementation; other work may land first.

| Area | Current files / behavior |
| --- | --- |
| Authentication | [auth options](../apps/web/src/auth/options.ts), [auth factory](../apps/web/src/auth/index.ts): signup disabled except owner setup; email verification currently not required. Invite-only registration must not globally open bootstrap signup. |
| Session identity | [services](../apps/web/src/server/services.ts): `requireOwner()` actually checks only a session; `getAccess()` asks `ownerExists()`. Rename/split these concepts. |
| Ownership | [access helper](../apps/web/src/server/access.ts), [store](../apps/web/src/db/store.ts): `findSite`/`listSites` filter by `owner_id`; `ownerExists()` means any user exists. |
| Server functions | [dashboard functions](../apps/web/src/features/dashboard/functions.ts): reads and mutations both use the owner-named wrapper. |
| Session HTTP routes | [api.ts](../apps/web/src/api.ts): authenticated user ID is passed into both report and mutation services. Audit every route. |
| Public API/MCP | [auth](../apps/web/src/public-api/auth.ts), [service dispatch](../apps/web/src/public-api/service.ts), [OAuth](../apps/web/src/public-api/oauth.ts): session principals get all scopes/allSites, credential grants rely on ownership, OAuth clients are owner-bound. Preserve these boundaries explicitly. |
| Layout/navigation | [website layout](../apps/web/src/features/dashboard/website-layout.tsx), [site tabs](../apps/web/src/features/dashboard/site-tabs.tsx), [app route](../apps/web/src/routes/_app.tsx), [setup route](../apps/web/src/routes/setup.tsx). |
| Email foundation | [helper](../apps/web/src/server/email.ts), [documentation](EMAIL.md), [tests](../apps/web/tests/email.test.mjs): Cloudflare EMAIL binding, one recipient/call; no automatic delivery or retry machinery. |
| Database parity | [database guide](DATABASES.md): D1/Postgres schemas and migrations both required; Postgres migrations are checksummed. Never edit applied migrations. |

The email helper and some layout/config files were already modified or untracked when this scope was authored. Preserve existing changes and inspect current git status rather than overwriting them or assuming a clean checkout.

## Delivery slices

1. **Account boundary and migration.** Add lightweight workspaces, backfill ownership, provision accounts in owner setup and correct bootstrap detection. Preserve existing owner reports, credentials, ingestion and self-hosted setup. No new invite UI yet.
2. **Read/manage authorization.** Add capability helpers, safe site DTOs and accessible-site enumeration. Convert all transports and report/mutation services. Use seeded membership fixtures to prove isolation before enabling invitations. Keep viewer public credentials/OAuth unsupported explicitly.
3. **Invitation lifecycle and auth.** Implement owner-only create/list/resend/revoke/remove services, expiry, hash tokens, rate limits, fake-email-tested delivery and matching-identity acceptance. Support existing and new users without triggering paid onboarding. Choose supported Better Auth APIs after checking the installed version and relevant skill/docs.
4. **People and shared navigation.** Build the fixed-Viewer invite form, membership list, acceptance states and shared-site navigation. Hide owner controls and test direct URL access as well as navigation.
5. **Billing alignment and release verification.** Tie website ownership to the same workspace ID used by the planned Polar model. Update hosted packaging to include viewers once shipped. Complete provider-parity and lifecycle tests and document email requirements. No real invitations or production provisioning are implied by implementing this feature.

Each slice must leave current owner behavior working. Use shared business logic across providers and transports; do not fork analytics SQL per role.

## Acceptance and test matrix

Run meaningful integration tests using real D1/local Postgres fixtures and mocked email delivery, not only helper-level permission tests.

- Existing self-hosted installation with one owner, including zero sites, migrates and logs in normally. Migration reruns are safe; all site IDs and ownership remain stable. First-time setup races still produce the intended single owner/account.
- Owner A with Sites A1/A2, Owner B with Site B1, and Viewer V: V invited only to A1 sees only A1. V invited separately to B1 sees A1/B1. A2 remains undiscoverable. A new Site A3 is not inherited.
- A user can own B1 and view A1: they can manage B1 but cannot mutate A1 or access Account A's billing/credentials.
- Exercise all read surfaces, all mutation classes and direct endpoints with owner, viewer, unrelated user and no session. Viewer sees revenue/event details as disclosed but no integration secrets/settings. Read response shapes do not leak full site configuration.
- Matching existing verified user, new invited user, unverified account and wrong-email session each follow the intended acceptance path. Guest registration does not open public signup or create a paying account/trial. GET/link preview does not grant access.
- Expired/revoked/deleted-site links, resends, already-member invitations, repeated acceptance and concurrent accept/revoke are safe. Resend invalidates the old token. Replaying an accepted link after member removal does not restore access.
- Email not configured, definite send failure, ambiguous delivery and retry are accurately represented; no duplicate grants and no token leakage. Rate limits reject repeated requests without losing pending invitations.
- After removal, a fresh report request, old pagination cursor and site-list refresh cannot return shared data. Another site's membership remains intact. Session/public API/MCP dispatch cannot turn broad scopes or allSites into management of a shared website.
- Existing owner API keys and OAuth flows still work for owned sites. Viewers cannot mint credentials for shared sites or alter owner OAuth clients.
- Invitations do not change event allowance, reset usage or create extra Polar subscriptions. Guest access follows the website owner's billing state. Self-hosted sharing does not require Polar.
- UI states cover pending, accepted, expired, revoked, send failure, no shared sites and permission loss; usable at mobile and desktop widths.

From `apps/web`, run `rtk npm run check`, `rtk npm run test:postgres`, and `rtk npm run test:hyperdrive` when the changes reach their respective boundaries. Add new provider-aware sharing tests to the explicit Postgres/Hyperdrive script file lists; the existing scripts will not discover a newly named test automatically. Follow [database testing guidance](DATABASES.md); fixtures must remain local/disposable and ordinary tests must not send real email.

## Related decisions

- [Hosted billing scope](HOSTED_BILLING_SCOPE.md): workspace identity, usage ledger and lifecycle remain the same account boundary.
- [Polar catalog](HOSTED_POLAR_CATALOG.md): one billing owner plus free website viewers; viewer feature is planned until this scope is implemented.
- [Outbound email](EMAIL.md): reuse the configured sending foundation, without assuming live sender verification or delivery.

This feature does not implement Polar checkout, change the proposed prices, change retention/storage architecture or update the Cork moodboard. Those are independent tasks. Product defaults in this document are sufficient to begin implementation; an implementation-specific API limitation should be resolved against the installed dependency rather than reopening the entire scope.

## New-session starting prompt

> Implement `docs/WEBSITE_SHARING_FEATURE.md`. Start by reading the current repository instructions and git status, preserve existing changes, and verify the code-map assumptions. Build the lightweight account boundary and website-level Viewer sharing in the listed slices, with D1/Postgres parity and invitation email through the existing helper. Keep existing owner/self-hosted behavior working. Do not provision Polar, deploy, send real emails or add organization/team machinery. Complete the authorization and invitation acceptance tests and update the feature doc with implementation status and remaining limitations.
