# Public information pages

The landing site includes `/privacy`, `/terms`, `/security` and `/contact`, sharing the existing header, footer, typography and a responsive contents navigation. The footer also links to the repository documentation and software license. Signup links to Privacy and Terms without claiming acceptance of an unfinished agreement.

Privacy and Terms are **drafts, not effective policies**. They have a visible draft notice and `noindex, nofollow` metadata. Security describes implemented controls; Contact links to documentation, public issues and authenticated Billing. The confirmed public address is `hello@yaap.sh`, used for support, privacy requests and private security reports. The production operator, data locations and outstanding commercial policies remain unconfirmed.

## Finalizing the content

Public contact details are centralized in `apps/web/src/features/landing/policy-details.ts`. Page copy is in `trust-pages.tsx` beside it. Confirm the following before turning off `legalDraft`, replacing draft language and adding an effective date:

- Legal operating entity and registered address. `Mucho ehf` appears in sandbox catalog documentation, but that alone does not establish the production operator.
- Actual hosted processors, database provider, data locations, international transfer safeguards and how customers obtain the DPA. Polar's merchant-of-record role should be distinguished from analytics subprocessors.
- Purpose-by-purpose lawful bases, legitimate interests where used, homepage tracking configuration and applicable consent/objection controls. The homepage self-tracker optionally uses identifiers; do not publish a blanket claim that Yaap uses no browser storage.
- Hosted analytics retention, account closure, post-cancellation access and deletion, backup cleanup, support and operational records, and billing record retention. Check these against implemented behavior, not only pricing proposals.
- Refund rules, payment grace, warranties, service changes, suspension/termination, liability, governing law and dispute arrangements. Preserve mandatory rights and align refund language with the terms actually presented by Polar checkout.
- Privacy rights and complaint routes appropriate to the operator and customers. Confirm the actual request process before promising response or deletion timelines.

Changing `legalDraft` alone does not finalize the documents: their body copy intentionally names unresolved matters. Update the draft prepared/last updated metadata in `public-page.tsx` as part of final publication. Do not add an agreement-acceptance checkbox until the effective terms and acceptance-recording behavior are defined.

## Scope and sources

This implements the first batch of four pages. DPA and Subprocessors remain a separate hosted-launch deliverable; neither is linked as if it already exists.

Product facts were checked against `docs/TRACKING.md`, `docs/settings.md`, the billing implementation and catalog documents, `src/visitor-metadata.ts`, `src/auth/options.ts`, and `src/components/self-tracking.tsx`.

The privacy structure was checked against the [ICO privacy information guidance](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/individual-rights/the-right-to-be-informed/what-privacy-information-should-we-provide/) and [storage and access technologies guidance](https://ico.org.uk/for-organisations/direct-marketing-and-privacy-and-electronic-communications/guidance-on-the-use-of-storage-and-access-technologies/what-are-storage-and-access-technologies/). These are references for the draft, not a determination of Yaap's jurisdiction or legal compliance.
