# Yaap — landing page v1
Created 10 September 2026.

[Cork moodboard and designs](https://cork.dagurleo.workers.dev/b/OSB8H4gB2l)

## Direction
Carry the existing Graphite interface into the marketing page: Inter Variable, cool gray canvas, white workspace, charcoal controls, fine borders, and green reserved for status. The page explains the outcome first, uses the dashboard as proof, and then explains self-hosting.

Headline: “See what brings people in. And what makes them customers.”
Descriptor: “Open-source web analytics, from first visit to revenue. Self-hosted on your own Cloudflare account.”

## Landing-page benchmark
These are qualitative design observations, not conversion-rate measurements. Captured desktop first folds are in references/. Product claims and current page structure were inspected on the primary sites.

| Reference | Useful pattern | Yaap application | What to leave behind |
| --- | --- | --- | --- |
| [T3 Code](https://t3.codes) | Large confident headline, candid developer voice, visible source access, product preview | Plain language, understated humor in the name, clear ownership | Floating brand tiles, borrowed stars, dark visual identity |
| [Plausible](https://plausible.io) | Explicit category, demo CTA, large readable dashboard | Let visitors see the product immediately | Privacy/cookieless claims that require separate validation for Yaap |
| [Umami](https://umami.is) | Spacious typography and a focused analytics promise | Calm hierarchy and readable product proof | Broad platform copy that obscures the acquisition-to-revenue story |
| [PostHog](https://posthog.com) | Distinctive personality and developer documentation | Give Yaap a human voice and a concrete technical explanation | Dense desktop metaphor and sprawling product navigation |
| [Supabase](https://supabase.com) | Clear developer outcome and specific infrastructure building blocks | Show the user's own Cloudflare account boundary | Unverified scale claims or expansive feature grids |
| [Dub](https://dub.co) | Revenue-oriented headline, restrained black CTAs, product-centered composition | Connect acquisition to payments with compact report illustrations | Decorative haze over the UI |
| [DataFast](https://datafa.st) | Revenue-first positioning, interactive demo, understandable setup sequence | Traffic → conversion → revenue; three clear setup steps | Subscription pricing and social proof unrelated to Yaap |

Analytics comparators: Plausible, Umami, PostHog and DataFast. Adjacent developer/open-source references: T3 Code and Supabase. Dub is an adjacent attribution reference. DataFast is a commercial positioning comparator, not presented as an open-source alternative.

## Existing style and product evidence
- src/styles.css: exact Graphite colors and Inter family.
- src/graphite.css: dashboard navigation, spacing, typography and reporting surfaces.
- [Selected Graphite dashboard board](https://cork.dagurleo.workers.dev/b/IYhRqmjq7F): source visual included in the new moodboard.
- README.md and docs/SCOPE.md: traffic, journeys, funnels, payment attribution and Cloudflare architecture.
- Public repository, license and live deployment verification remain release work per the existing scope documents.

## Deliverables
- index.html + styles.css: complete responsive static design; open index.html directly, or serve this directory.
- assets/InterVariable.woff2: local font used by the preview.
- source.json: authoring HTML/CSS (Cork asset paths).
- preview-1440.png, preview-768.png, preview-390.png: complete local responsive screenshots.
- references/: seven benchmark captures plus the selected Graphite dashboard.
- Cork: annotated reference board, palette, design rationale, editable full desktop design, and two mobile frames.

Cork design IDs:
- NobSH0F0ATOs8olERgUJc: full desktop and mobile upper portion.
- Ta3wrLu3GHJ7F9Tbe31IJ: mobile continuation.
Cork's 3000px capture limit requires two mobile frames; the local HTML is one continuous page.

## Validation
Checked 1440px, 768px and 390px widths: no horizontal overflow, Inter loaded, all section anchors resolved, FAQ disclosures opened, mobile menu opened and closed. Cork design renders returned no viewport or asset warnings. Cork's board-render endpoint failed, so the complete board was visually checked in the authenticated browser instead.

## Implementation handoff
This is a design prototype under docs/design/yaap-v1, not a replacement for the authenticated dashboard route. CTAs navigate to the setup explanation; wire the production CTA to the eventual public repository or verified deploy flow. Navigation and FAQ are functional in the local HTML. The dashboard is an illustrative static visual, not a live demo. Do not publish sample metrics as customer results.

No invented customers, star counts, pricing, specific license, throughput, consent/compliance guarantee, or deployment-time promise is used. Before launch, add the real source and documentation links, confirm release status and choose the final onboarding destination.


## Cobalt color revision
Updated the landing design in place with saturated cobalt #2458EB, deeper feature-panel blue #1745CD, and selected-surface blue #EDF2FF. Color marks the main CTA, headline emphasis, chart lines, feature details and ownership panel. Graphite neutrals remain the foundation. The app itself is unchanged.

## Selected identity: Confluence
Confluence is the selected Yaap logo. The header, footer, dashboard preview and ownership panel use its outlined SVG lockup. The preview includes matching SVG/ICO favicon links and an Apple touch icon. Header logo height is 34px desktop / 30px mobile; footer is 26px / 24px. Assets are bundled in assets/.

## Hero refinement
Removed the dot-and-label eyebrow above the hero. The headline now opens the page directly, with adjusted top spacing. The name expansion, Yet another analytics platform, appears beside the footer logo.

Section eyebrow labels removed. Header GitHub button is a focusable, aria-disabled placeholder until the public repository exists.

## Implemented landing page

Approved design is implemented at `/` in `src/features/landing/landing-page.tsx`, with isolated styles in `landing.css` and assets in `public/brand/`. The protected workspace entry is `/app`; existing `/sites/:siteId/*` routes are retained. Sign in and the primary CTA enter the guarded workspace flow. GitHub remains an inactive placeholder. FAQs and the mobile menu are interactive.

Verified at 1440, 768, 390 and 320px, including the approved light appearance with a dark OS preference. Build, typecheck, all 30 tests (including public/guarded route regression checks), and deployment configuration validation pass. `implemented-*.png` captures the running app. No live deployment was performed.
