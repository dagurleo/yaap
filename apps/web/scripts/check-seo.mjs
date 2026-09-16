import assert from "node:assert/strict";

// Run against a local preview or the deployed site. Read-only; no credentials.
const origin = new URL(process.argv[2] || "http://localhost:8790").origin;
const canonicalOrigin = new URL(process.argv[3] || origin).origin;
const request = (path, options) =>
  fetch(new URL(path, origin), {
    signal: AbortSignal.timeout(30000),
    ...options,
  });
const attrs = (tag) =>
  Object.fromEntries(
    [...tag.matchAll(/([\w:-]+)="([^"]*)"/g)].map((m) => [
      m[1],
      m[2].replaceAll("&amp;", "&").replaceAll("&quot;", '"'),
    ]),
  );
const robots = await request("/robots.txt");
assert.equal(robots.status, 200);
const robotsText = await robots.text();
assert.ok(robotsText.includes(`Sitemap: ${canonicalOrigin}/sitemap.xml`));
assert.doesNotMatch(
  robotsText,
  /Disallow: \/(?:app|login|signup|share|invite)/,
);
const sitemapResponse = await request("/sitemap.xml");
assert.equal(sitemapResponse.status, 200);
const sitemap = await sitemapResponse.text();
const urls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(
  (match) => match[1],
);
assert.ok(urls.length >= 17, "Missing public pages in sitemap");
assert.equal(new Set(urls).size, urls.length);
const titles = new Set();
const descriptions = new Set();
const images = new Set();
for (const url of urls) {
  assert.equal(new URL(url).origin, canonicalOrigin);
  assert.doesNotMatch(
    new URL(url).pathname,
    /(?:\.md$|^\/(?:app|share|login|signup|demo)(?:\/|$))/,
  );
  const response = await request(new URL(url).pathname, { redirect: "manual" });
  assert.equal(response.status, 200, url);
  assert.match(response.headers.get("content-type"), /text\/html/);
  assert.doesNotMatch(response.headers.get("x-robots-tag") || "", /noindex/);
  const html = await response.text();
  const head = html.match(/<head>([\s\S]*?)<\/head>/)?.[1];
  assert.ok(head, `Missing SSR head: ${url}`);
  const title = head.match(/<title>([^<]+)<\/title>/)?.[1];
  assert.ok(title && !titles.has(title), `Missing or duplicate title: ${url}`);
  titles.add(title);
  const metas = [...head.matchAll(/<meta\s[^>]*>/g)].map((m) => attrs(m[0]));
  const meta = (key) =>
    metas.filter((m) => m.name === key || m.property === key);
  const description = meta("description");
  assert.equal(description.length, 1, `Description count: ${url}`);
  assert.ok(
    description[0].content && !descriptions.has(description[0].content),
    `Duplicate description: ${url}`,
  );
  descriptions.add(description[0].content);
  assert.equal(meta("robots").length, 1, `Robots count: ${url}`);
  assert.doesNotMatch(meta("robots")[0].content, /noindex/);
  const canonical = [...head.matchAll(/<link\s[^>]*>/g)]
    .map((m) => attrs(m[0]))
    .filter((a) => a.rel === "canonical");
  assert.deepEqual(
    canonical.map((a) => a.href),
    [url],
    `Canonical: ${url}`,
  );
  assert.equal(meta("og:url")[0]?.content, url);
  assert.equal(meta("og:title")[0]?.content, title.replaceAll("&amp;", "&"));
  assert.equal(meta("twitter:card")[0]?.content, "summary_large_image");
  images.add(meta("og:image")[0]?.content);
  assert.equal(
    [...html.matchAll(/<h1(?:\s[^>]*)?>/g)].length,
    1,
    `H1 count: ${url}`,
  );
  const ld = [
    ...head.matchAll(
      /<script\b[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g,
    ),
  ].map((m) => JSON.parse(m[1]));
  assert.ok(ld.length, `Missing structured data: ${url}`);
  assert.ok(
    response.headers.get("link")?.includes(`<${url}>; rel="canonical"`),
  );
  console.log(`PASS ${new URL(url).pathname}`);
}
for (const image of images) {
  assert.ok(image);
  const response = await request(new URL(image).pathname);
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type"), /image\/png/);
  const bytes = Buffer.from(await response.arrayBuffer());
  assert.equal(bytes.readUInt32BE(16), 1200);
  assert.equal(bytes.readUInt32BE(20), 630);
}
for (const path of [
  "/pricing?utm_source=seo-check",
  "/pricing.md",
  "/docs/npm.md",
  "/docs/index.md",
]) {
  const response = await request(path);
  assert.equal(response.status, 200, path);
  const expected = path.startsWith("/docs/index")
    ? "/docs"
    : path.startsWith("/docs")
      ? "/docs/npm"
      : "/pricing";
  assert.ok(
    response.headers
      .get("link")
      ?.includes(`<${canonicalOrigin}${expected}>; rel="canonical"`),
    path,
  );
}
const redirect = await request("/pricing/?utm_source=seo-check", {
  redirect: "manual",
});
assert.equal(redirect.status, 308);
assert.equal(new URL(redirect.headers.get("location")).pathname, "/pricing");
assert.equal(
  new URL(redirect.headers.get("location")).search,
  "?utm_source=seo-check",
);
for (const path of [
  "/login",
  "/signup",
  "/app",
  "/demo",
  "/share/seo-check",
  "/privacy",
  "/terms",
  "/seo-page-does-not-exist",
  "/docs/seo-guide-does-not-exist",
]) {
  const response = await request(path, { redirect: "manual" });
  assert.match(response.headers.get("x-robots-tag") || "", /noindex/, path);
  if (path.includes("does-not-exist")) assert.equal(response.status, 404, path);
}
console.log(
  `SEO checks passed for ${urls.length} public pages, social assets, canonical variants, redirects and indexing exclusions.`,
);
