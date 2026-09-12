# Yaap pricing — first implementation

12 September 2026. [Cork moodboard](https://cork.dagurleo.workers.dev/b/OSB8H4gB2l), section **05 / Pricing · section, page & slider**.

The homepage section and public `/pricing` route share one interactive component and the existing `BILLING_PLANS` catalog. Six discrete monthly volumes map to $9, $19, $29, $49, $99 and $149 USD, before applicable tax. No Polar configuration or production deployment changed.

The slider supports dragging, keyboard arrows/Home/End, and direct tier buttons. Its event allowance, price, selected tier, track fill and accessible value update together. Trial copy remains 100,000 events regardless of the paid volume selected. At very narrow widths, only endpoint labels appear; all six stops remain available on the slider.

One hosted feature set, unlimited websites, a shared allowance, self-hosting links and billing FAQs. No annual discount or unverified two-year retention promise is advertised. The existing registration-availability check controls the CTA: `/signup` when enabled, otherwise “Hosted plans are coming soon.” No checkout is initiated by the selector.

## Designs and previews

- `page.html`: standalone interactive full pricing-page design, with the future hosted CTA shown.
- `section.html`: standalone interactive homepage section.
- `page-source.json`, `section-source.json`: static Cork authoring source. Native output/disclosure elements are adapted for Cork sanitization; the downloadable HTML and app retain native interactions.
- `generate.mjs`: regenerate previews from the React implementation and billing catalog with `node docs/design/yaap-pricing/generate.mjs` from the repo root. Requires the repo dependencies and Node 22.18+ with TypeScript stripping support.
- The local HTML uses the existing font at `../yaap-v1/assets/InterVariable.woff2`; the HTML files saved in Cork embed the font and open independently.

Cork design IDs:

- Full page, desktop and mobile: `s_YR3p-9AVidgvjt-xc50`.
- Landing section, desktop and mobile: `w-e5nDytQrZdrK-50jZ5p`.
- 10M events / $149 endpoint: `WabbH0XfL3cEzCHS7mlca`.

The Cork Files drawer contains the editable source bundle and two interactive HTML files attached to the pricing cluster. Binary ZIP transfer was unavailable, so the previews were saved individually.

Cork disables JavaScript, so its canvas frames show fixed states. The application and downloadable HTML implement the slider. Cork's board screenshot endpoint is unavailable; placement is reviewed in the authenticated browser.

## Verification

Production build and TypeScript checks pass. Public-route regression verifies anonymous `/pricing` access, the disabled hosted-registration state, and absence of the dashboard header. Browser checks cover all six tier prices, keyboard controls, mobile layouts, FAQ disclosure, homepage navigation, and no horizontal overflow.
