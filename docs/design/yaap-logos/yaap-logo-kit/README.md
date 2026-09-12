# Yaap logo explorations
[Cork logo studies](https://cork.dagurleo.workers.dev/b/OSB8H4gB2l)

Three directions, sketched with built-in image generation and refined into deterministic SVG artwork:
1. **Confluence** — angular branching Y; visitor paths and attribution.
2. **Signal** — three rising shapes; direct analytics recognition.
3. **Y-dot** — rounded lowercase y and a data point. Recommended for the name's personality and compact silhouette.

Open index.html for the comparison, or the individual study HTML pages. The existing landing page and application logos have not been replaced.

## Each folder contains
- mark-blue.svg, mark-graphite.svg, mark-white.svg — standalone transparent marks.
- logo-light.svg — cobalt mark + graphite wordmark, for light backgrounds.
- logo-dark.svg — white mark and wordmark, for dark/blue backgrounds.
- logo-mono.svg — graphite mark and wordmark.
- Matching transparent logo PNGs at 192px height.
- favicon.svg — white mark on a cobalt rounded square.
- favicon.ico — 16, 32 and 48px images in one icon.
- favicon-16/32/48/64/192/512.png.
- apple-touch-icon.png — 180px, square cobalt background with inset mark.

The SVG wordmarks are outlined Inter at weight 650. They do not require a webfont. Keep the aspect ratio; use header lockups around 28–32px high. Use the standalone favicon, not the entire wordmark, for browser tabs. Leave roughly one-quarter of the mark's width as clear space where practical. Colors: #2458EB cobalt, #262C32 graphite, #FFFFFF white.

## Example integration after choosing
Copy the selected folder's assets into public/brand/:
```html
<link rel="icon" href="/brand/favicon.svg" type="image/svg+xml">
<link rel="icon" href="/brand/favicon.ico" sizes="16x16 32x32 48x48">
<link rel="apple-touch-icon" href="/brand/apple-touch-icon.png">
<a href="/" aria-label="Yaap homepage">
  <img src="/brand/logo-light.svg" alt="Yaap" height="28">
</a>
```

## Source and validation
- concepts.png is the image-generated sketch sheet, not a production asset.
- build.py draws the refined SVG marks and outlines the wordmark from the repository's Inter font.
- package.mjs rasterizes the SVG exports with Sharp and assembles multi-size ICOs.
- studies.json holds the Cork presentation source.
- Three Cork design sheets rendered without warnings; favicon previews checked at 16, 32, 48 and 64 CSS pixels. Both light and dark header contexts are shown.

