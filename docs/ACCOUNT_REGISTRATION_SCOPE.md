# Account registration beyond installation setup

Scoped 2026-09-12 against the current working tree. This document proposes work; it does not claim deployment or runtime verification. Owner setup works per the user. Source and existing tests were inspected; tests were not rerun for this documentation-only scope.

## Outcome and recommended boundary

People can join a shared website through an invitation, and hosted customers can sign up to own their own websites and invite viewers. Keep installation bootstrap, user identity, and website/account ownership distinct.

| Entry | Result |
| --- | --- |
| `/setup` | Existing secret-protected, one-time installation owner setup. |
| `/invite/$token` | Create a login or sign in, explicitly accept, then view the selected website. No owned workspace, trial, or subscription is created. |
| Proposed `/signup`, hosted only | Create a login, verify email, provision one owned account, and start the existing hosted onboarding/trial. |
| Proposed “Create your own account”, signed-in hosted viewer | Reuse the login and shared memberships; deliberately provision an owned account and activate its trial once. |

Recommended default: public registration is available in hosted mode after installation initialization; self-hosted remains owner setup plus invitation-gated registration. Public self-hosted signup is a separate opt-in product decision. “Owner” means owner of a particular account, not a global administrator. New customers gain no rights over the installation owner's sites.

## What exists and what is missing

| Area | Current evidence | Remaining work |
| --- | --- | --- |
| Registration policy | `src/auth/index.ts` enables signup only for explicit owner/invitation contexts; normal `/api/auth/sign-up/email` is disabled. | Add an explicit hosted registration context and endpoint; do not globally flip signup on. |
| Viewer invitations | `src/server/sharing.ts`, site settings People, and `/invite/$token` implement create/resend/revoke/remove, registration and explicit acceptance. | Verify the complete browser journey and delivery configuration; reuse this feature. |
| Invite return after login | Invitation page supplies `/invite/...` as `returnTo`, but `src/lib/login-return.ts` accepts only `/oauth/authorize?`. Login discards the invitation destination. | Add narrowly validated local invitation paths while preserving OAuth behavior and rejecting external/malformed destinations. Cover sign-in and switch-account paths. |
| New invite identity | Server validates a pending token and matching email, then its Better Auth user hook sets `emailVerified: true`. | Verify hosted-mode session behavior: hosted auth also requires verification and sends verification on signup, while the form simply reloads. Confirm the user can reach explicit acceptance without a loop or unnecessary verification email. |
| Hosted signup UI | Login has no signup link; landing CTAs lead to `/app`; there is no public signup route. | Hosted signup entry points, name/email/password form, check-email page, resend and expired-link recovery, and first-website onboarding. |
| Account provisioning | Owner registration creates a workspace; invitation registration does not. `getAccess()` exposes `ownsAccount`. | Share idempotent provisioning between hosted signup and deliberate viewer-to-owner onboarding. Preserve site-level access boundaries. |
| Trial activation | `src/server/billing/trial.ts` activates only for a verified workspace owner; verification hook calls it. | Ensure workspace creation and verification order cannot skip activation. An already-verified viewer needs explicit activation after provisioning because no new verification hook runs. |
| Password recovery | Auth options have no `sendResetPassword`; login has no recovery UI. | Add forgot/reset password flow with the email helper and safe callback handling. |
| Email | `src/server/email.ts` requires `EMAIL` and `EMAIL_FROM`. | Verify configured sending and recoverable verification failures. Source inspection cannot establish deployed bindings or inbox delivery. |
| Tests | `tests/pipeline.test.mjs` covers invited signup, explicit acceptance, isolation, removal, and failed sends; it is included in Postgres/Hyperdrive scripts. | Add browser redirect and hosted-registration coverage. Existing endpoint tests do not prove the login return journey. |

Paths above are relative to `apps/web`. Some historical code-map statements in [WEBSITE_SHARING_FEATURE.md](WEBSITE_SHARING_FEATURE.md) describe pre-implementation behavior; use current source as the baseline.

## Delivery slices

### 1. Finish the existing invitation journey

Fix the invitation return allowlist and test new users, existing users, wrong signed-in identity, and unverified identity. Keep explicit acceptance after authentication. Show a successful verification-send state, actionable existing-account guidance, and sensible expired/revoked invitation recovery. Check hosted and self-hosted behavior, including the actual registration response/session cookie. Keep registration from creating a workspace or trial.

This slice alone addresses inviting other people to view the current owner's websites; public signup is not a prerequisite for invitations.

### 2. Add hosted customer registration and verification

Introduce `/signup` and a same-origin, rate-limited registration endpoint, enabled only for initialized hosted installations. Reuse Better Auth password handling and the existing 12–128 character policy. The server determines registration intent; client input cannot choose verification status, owner IDs, or privileged roles.

Provide hosted-only signup links from login and landing CTAs. After signup, show a check-email state rather than assuming a session exists. Preserve a validated local continuation through verification, resend, sign-in and recovery. Handle existing email addresses without exposing account existence; direct users to sign-in/recovery generically.

Provision at most one workspace for a deliberately registered customer and activate the existing trial only after verification. Make recovery explicit if auth creation succeeds but workspace provisioning or email delivery fails: retries must reuse the identity/account, avoid duplicate trials, and allow verification resend. Do not copy the installation-wide bootstrap claim/lock into customer signup.

### 3. Allow an invited viewer to become an owner

Add an explicit hosted “Create your own account” action for authenticated viewers. Require verified email; provision one workspace idempotently; call trial activation after provisioning. Repeated requests return the existing account without resetting allowance or trial dates. Preserve shared-site memberships and show owned and shared websites through the existing navigation. After their last shared site is removed, a viewer retains their login and sees a useful empty state.

### 4. Complete recovery and release validation

Configure Better Auth password-reset email delivery and add forgot/reset-password pages, token-expired states, resend feedback and session handling after reset. Keep account enumeration responses neutral and rate-limit email-triggering operations. Validate using fake email and disposable databases; deployment and real recipient email are separate release operations.

The Better Auth [email/password documentation](https://better-auth.com/docs/authentication/email-password) describes verification callbacks, resend and reset APIs. Check behavior against the repository's pinned dependency during implementation, especially cookies and responses when verification is required.

## Acceptance criteria

- Owner setup and existing owner sign-in continue working; public signup cannot bypass the setup secret or initialize an unconfigured installation.
- New invited user registers, explicitly accepts, and sees only the shared site with no owned workspace/trial. Existing user signs in and returns to the same invitation; switching identities also preserves it.
- An invitation preview GET never consumes the invite or grants access. Expired, revoked, rotated and replayed links retain current protections.
- Two public hosted customers receive distinct accounts and isolated sites, billing and credentials; either can invite a viewer to selected sites.
- Public signup is rejected in self-hosted mode, while valid invitation registration remains available.
- Verification is recoverable after expired links, email-send failure, browser reload and repeated signup; unverified users cannot perform owner onboarding actions.
- A previously verified viewer can deliberately create an owned account and start its trial once, retaining shared access. Concurrent/retried provisioning does not duplicate accounts or reset trials.
- Forgot/reset-password works for owners and viewers; expired/reused reset links fail and responses do not disclose whether an email is registered.
- Return destinations accept only intended local routes; external URLs, protocol-relative URLs and encoded bypasses are rejected. Existing OAuth return behavior is preserved.
- Exercise D1, Postgres and Hyperdrive for changed auth/provisioning boundaries, plus browser checks of invitation, signup, verification and recovery. Run the repository check and provider suites when implementing, using a fresh build for pipeline tests.

## Scope limits and implementation size

This is a moderate auth/onboarding change, with an immediate smaller invitation-flow fix. The account and sharing data model already exists; no new organization plugin or membership schema is expected. Add migrations only if a concrete provisioning/recovery invariant requires persisted state, with D1/Postgres parity.

Keep the initial role model as account owner plus website viewer. Editor/admin invitations, account-wide teams, ownership transfer, social login/SSO and seat billing remain outside this scope. No application code, infrastructure or email delivery was changed by this scoping task.
