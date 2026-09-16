import assert from "node:assert/strict";
import { test } from "node:test";
import { build } from "esbuild";

const compiled = await build({
  entryPoints: ["src/lib/seo.ts"],
  bundle: true,
  write: false,
  format: "esm",
  platform: "node",
});
const { publicSeo, serializeJsonLd } = await import(
  `data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString("base64")}`
);

test("metadata and breadcrumbs use the installation origin without leaking another tenant", () => {
  const seo = publicSeo({
    origin: "https://analytics.example.com",
    path: "/docs/npm",
    title: "Install Yaap",
    description: "Install the client.",
    breadcrumbs: [
      { name: "Home", path: "/" },
      { name: "Docs", path: "/docs" },
      { name: "npm", path: "/docs/npm" },
    ],
  });
  assert.deepEqual(seo.links, [
    { rel: "canonical", href: "https://analytics.example.com/docs/npm" },
  ]);
  const find = (name) =>
    seo.meta.find((m) => m.name === name || m.property === name)?.content;
  assert.equal(find("og:url"), seo.links[0].href);
  assert.equal(
    find("og:image"),
    "https://analytics.example.com/brand/social-card.png",
  );
  assert.equal(find("twitter:card"), "summary_large_image");
  assert.doesNotMatch(JSON.stringify(seo), /yaap\.sh/);
  const graph = JSON.parse(seo.scripts[0].children)["@graph"];
  assert.deepEqual(
    graph[1].itemListElement.map((item) => [item.position, item.item]),
    [
      [1, "https://analytics.example.com/"],
      [2, "https://analytics.example.com/docs"],
      [3, "https://analytics.example.com/docs/npm"],
    ],
  );
});

test("draft pages remain noindex and JSON-LD cannot close its script element", () => {
  const title = "</script><script>alert(1)</script>";
  const seo = publicSeo({
    origin: "https://analytics.example.com",
    path: "/privacy",
    title,
    description: "Draft",
    noindex: true,
  });
  assert.equal(
    seo.meta.find((m) => m.name === "robots").content,
    "noindex, follow",
  );
  assert.doesNotMatch(seo.scripts[0].children, /</);
  assert.equal(JSON.parse(seo.scripts[0].children)["@graph"][0].name, title);
  assert.equal(JSON.parse(serializeJsonLd({ title })).title, title);
});

test("home describes the real brand without invented reviews or ratings", () => {
  const seo = publicSeo({
    origin: "https://analytics.example.com",
    path: "/",
    title: "Yaap",
    description: "Web analytics",
  });
  const graph = JSON.parse(seo.scripts[0].children)["@graph"];
  assert.deepEqual(
    graph.map((item) => item["@type"]),
    ["WebPage", "Organization", "WebSite"],
  );
  assert.doesNotMatch(
    seo.scripts[0].children,
    /aggregateRating|review|SearchAction/,
  );
});
