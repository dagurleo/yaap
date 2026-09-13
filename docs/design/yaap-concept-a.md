# Concept A — integrated landing page

Approved reference: https://cork.dagurleo.workers.dev/b/cywrPoN5TB (v4, September 13, 2026).

The landing page leads with the split hero and a slowly rotating visitor globe, followed directly by the actual Yaap traffic interface. The six-stop pricing slider continues to use `BILLING_PLANS`; hosted registration and demo availability determine the existing CTA destinations. No visitor telemetry is exposed by the public hero.

## Assets and sample content

- `public/landing/traffic-desktop.png` and `traffic-mobile.png`: actual desktop and responsive mobile UI captures from the local **Atlas Demo** workspace (`atlas-demo.example`). The report covers August 15–September 13, 2026. Its synthetic seed ends September 10, accounting for the final zero days. The mobile asset crops the report controls, metrics and chart.
- Acquisition, funnel and revenue examples use the same seeded workspace. Source percentages represent pageviews (bars scaled relative to the leading source); funnel values represent sessions with a one-day conversion window; USD net revenue includes refunds. Currencies are never combined.
- The hero's 128 visitors and city/page labels are illustrative, with provenance recorded here and in accessible labels. They are not live or customer counts.
- The globe uses COBE 2 (MIT), dynamically imported after hydration. The old moodboard SVG placeholder was removed: a faint, plain circular skeleton occupies the same footprint until the real globe appears, with a brief opacity transition and reserved layout space. Reduced motion skips the transition.

## Interaction

Drag in any direction with a mouse or touch to spin and tilt the globe, including full turns over the poles. All four arrow keys work when focused. Touch gestures on the interactive globe rotate it; gestures outside it scroll the page. Automatic rotation resumes on release at the chosen tilt, except when reduced motion is enabled.

City cards use the same coordinates and orthographic projection as their globe markers. They follow rotation and dragging, fade at the horizon, and disappear on the far side. Country flags reuse the dashboard assets. Cards choose an open position above or below their markers as the globe tilts; nearer cities take priority if space runs out. The narrowest layouts show flags and city names without page paths. Reduced motion keeps the WebGL globe stationary until manual input.

The globe makes one turn in roughly 90 seconds. It shows 24 visitor markers and six compact city/page labels; the visible caption and pause control were removed in the next approved pass. It stops updating outside the viewport, in a hidden tab, or with reduced motion enabled. The subtle circular skeleton remains if JavaScript or WebGL is unavailable. Mobile navigation is a native disclosure that dismisses on navigation or Escape; FAQ items are native disclosures. Pricing supports dragging, keyboard input and selecting any of the six stops.

The product preview is a screenshot. It uses a separate mobile crop rather than compressing desktop navigation and tables onto a narrow screen. The sample date range is visible beneath it.
