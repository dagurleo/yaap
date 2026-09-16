# Yaap SEO launch and growth plan

Implementation date: September 16, 2026. This is a code and content pass; it does not establish that the changes have been deployed, indexed or improved rankings.

## Starting point

The live homepage returned HTTP 200 and server-rendered content. Robots and sitemap endpoints worked, and unknown pages returned 404. Public pages had titles and descriptions but lacked HTML canonical links, Open Graph/Twitter previews and structured data. Account URLs were blocked in robots.txt, preventing crawlers from reading noindex directives. A public `site:yaap.sh` search returned no results during the audit; Search Console is needed to establish Google's actual indexing state.

## Implemented

- A shared `publicSeo` helper supplies unique titles/descriptions, absolute canonicals, Open Graph/Twitter metadata, a 1200 × 630 brand card, WebPage data and breadcrumbs. The homepage adds Organization and WebSite data. No invented reviews, ratings or eligibility claims.
- URLs use the installation's configured `BETTER_AUTH_URL`, falling back to the request origin. Self-hosted installations do not emit canonicals pointing at yaap.sh. Keep production `BETTER_AUTH_URL` set to `https://yaap.sh`.
- Public HTML, campaign query variants and alternate Markdown responses share a canonical. Public trailing-slash variants return 308 while retaining query parameters. Markdown and AI discovery remain available.
- Public routes explicitly allow indexing. Account, dashboard, demo, shared-report and search endpoints have noindex response headers; the root document defaults to noindex. HTTP errors have noindex headers and missing pages retain 404 responses. Account pages are crawlable so their directives can be read; authentication is unchanged. Draft legal pages remain excluded.
- Three product pages explain implemented capabilities, examples, setup, costs and limitations. They are linked from the homepage/navigation/footer, related pages, sitemap and `llms.txt`.
- The homepage names the product category in its H1, links to the product pages and explains collection modes without blanket cookieless or legal-compliance claims.
- Four lossless WebP screenshots replace PNG transfers where supported, retaining PNG fallbacks and explicit dimensions. Total size drops from 1,909,433 to 1,122,508 bytes (41.2%). Below-the-fold previews use lazy loading. This is an asset-size measurement, not a measured Core Web Vitals improvement.
- `npm run check:seo -- ORIGIN` audits all sitemap pages, SSR metadata, H1 counts, canonicals, structured JSON, image dimensions, Markdown variants, redirects and noindex/404 behavior. Regression tests cover origin isolation, discovery and script escaping.

## Search intent map

These are product-fit hypotheses, not measured keyword volumes or difficulty scores. Validate them with actual query data after indexing.

| URL | Primary search intent | Supporting material |
| --- | --- | --- |
| `/` | Yaap web analytics; source-available web analytics | Dashboard, capabilities, hosting choices |
| `/self-hosted-web-analytics` | Self-hosted web analytics; web analytics on Cloudflare | Architecture, maintenance, D1/PostgreSQL tradeoffs |
| `/conversion-tracking` | Website conversion tracking; SaaS conversion funnels | Goal examples, denominators, event verification |
| `/revenue-attribution` | Stripe revenue attribution; Polar revenue analytics | Payment linkage, refunds, currencies, attribution limits |
| `/pricing` | Yaap pricing; hosted web analytics pricing | Actual event tiers and included features |
| `/docs/installation`, `/docs/npm` | Install Yaap; @yaap/client | Working script and framework integration examples |
| `/docs/self-hosting` | Deploy Yaap to Cloudflare | Operational steps rather than another product overview |

## Launch actions requiring the live site and account access

1. Deploy through the normal release process. Run `npm run check:seo -- https://yaap.sh`. Check public pages are accessible to browsers, Googlebot and social crawlers without a Cloudflare challenge. Verify HTTP and www variants resolve consistently to the preferred HTTPS host at the edge.
2. Add or verify the `yaap.sh` domain property in Google Search Console using the account's DNS record. Submit `https://yaap.sh/sitemap.xml`. Inspect the homepage and three new product pages, including Google's selected canonical and rendered HTML. Request indexing after successful live inspection. [Google sitemap guidance](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap).
3. Verify the site in Bing Webmaster Tools and submit the same sitemap. Verification records must come from the actual account; none are fabricated in the repository.
4. Validate the homepage's site-name markup and product/docs breadcrumbs with Google's tools. Structured data communicates meaning; it does not guarantee special results. [Site-name guidance](https://developers.google.com/search/docs/appearance/site-names).
5. Run PageSpeed Insights on mobile for the homepage, pricing, a product page and a docs page. Record lab results and monitor field data as traffic becomes available. Target LCP within 2.5 seconds, INP below 200 ms and CLS below 0.1. Investigate measured bottlenecks before changing rendering or cache policy. [Core Web Vitals guidance](https://developers.google.com/search/docs/appearance/core-web-vitals).
6. Finish the confirmed operator details and policies in [PUBLIC_PAGES.md](PUBLIC_PAGES.md). Add an accurate founder/company page when the public identity and story are supplied. Publish customer quotes or case studies only with permission and evidence.

Search Console, Bing accounts, DNS changes, submissions and deployment are not completed by this code pass.

## First 30 days

- Check Search Console weekly: indexed/submitted pages, excluded URLs, canonical selection, crawl failures, branded versus non-branded queries, impressions, clicks and CTR. An empty `site:` result is not a substitute for these reports.
- Track the business outcome in Yaap: organic landing visits → verified signup → first website sending events → paid customer, using events that actually exist or are deliberately instrumented. Search Console supplies search impressions; Yaap supplies on-site behavior. Do not label all Google referrals as organic without checking source semantics.
- Confirm the repository description, npm package homepage and relevant project profiles consistently link to yaap.sh. Publish a technical launch post with the real architecture, source code and installation experience. Share it in relevant developer communities under their rules; outreach and submissions are separate actions, not automated here.
- Collect questions from users trying to deploy or connect payments. Use those questions to improve the product page and docs rather than publishing near-identical keyword pages.

## Next content, ordered by product fit

1. **Stripe and Polar attribution tutorials:** complete, tested checkout metadata and webhook examples, test payments, refunds and failure modes that create unattributed revenue. Check examples against current provider APIs.
2. **Cloudflare deployment case study:** publish a reproducible workload, event volume, database size, retention and an actual bill. State the date and method instead of promising a universal hosting cost.
3. **Framework installation examples:** tested Next.js/React and frameworks customers request, including SPA navigation and consent behavior. Extend the existing npm guide until there is enough distinct material for separate pages.
4. **Conversion measurement guide:** a worked signup-to-activation example, event definitions, session denominators and interpretation of anonymous traffic.
5. **Alternative/comparison pages:** only after hands-on testing of named products. Record versions, dates, pricing sources and honest tradeoffs. Explain who should choose each tool instead of claiming Yaap wins every category.

Prefer original experience and complete answers over publishing frequency or a word-count target. [Google's people-first content guidance](https://developers.google.com/search/docs/fundamentals/creating-helpful-content).

## Maintenance

Public metadata lives in `apps/web/src/lib/seo.ts` and route `head` functions. Product content lives in `features/landing/product-pages.tsx`; paths are in `productPages` in `lib/seo.ts`. Docs paths remain in `lib/docs-paths.ts`. Keep sitemap entries, internal links and canonicals consistent. Do not add invented `lastmod` dates, ratings, credentials or mass-generated city/keyword pages.

When changing an asset, regenerate its optimized variant and preserve its aspect ratio. The social card source is `public/brand/social-card.svg`; the shipped preview is PNG for crawler compatibility. When publishing effective legal documents, update the body and policy flag together and adjust the SEO checker to expect them in the sitemap.

Use redirects and canonical signals for duplicate public URLs rather than noindex on campaign URLs. [Google canonicalization guidance](https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls).

Local commands:

```sh
npm run build
npm run typecheck
npm test
npm run check:deploy
npm run dev -- --port 8791
npm run check:seo -- http://localhost:8791
```

The checker accepts a second origin when a preview serves metadata for a configured production origin: `npm run check:seo -- http://localhost:8791 https://yaap.sh`. Keep staging access-controlled or noindex at the environment/edge level; canonical tags are not a staging access policy.

## Verification on September 16, 2026

- Production build, workspace type checks, backend formatting check and deployment-configuration check passed.
- Full test suite: 184 passed, 3 optional tests skipped. The production Worker test verifies public SSR metadata, canonicals, redirects and 404 exclusions.
- Local HTTP crawl: all 17 sitemap URLs passed `check:seo`, plus social image, Markdown/query variants and excluded-page checks.
- Browser review: homepage and product page layouts checked at desktop and 390px mobile widths; social preview image visually checked.
- Build warnings remain for Fumadocs' browser-externalized filesystem module and missing production secrets in the local build environment. No production provisioning or Core Web Vitals field measurement was performed.
