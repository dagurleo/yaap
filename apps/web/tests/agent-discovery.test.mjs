import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { after, before, test } from "node:test";
import { build } from "esbuild";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";

let mf, publicAgentTools, registerPublicAgentTools;
const origin = "https://analytics.example.com";
before(async () => {
  const docs = await Promise.all(
    (await readdir("content/docs"))
      .filter((file) => file.endsWith(".mdx"))
      .map(async (file) => {
        const raw = await readFile(`content/docs/${file}`, "utf8");
        const field = (name) => {
          const value = raw.match(new RegExp(`^${name}: (.+)$`, "m"))[1];
          return value.startsWith('"') ? JSON.parse(value) : value;
        };
        return {
          url: file === "index.mdx" ? "/docs" : `/docs/${file.slice(0, -4)}`,
          title: field("title"),
          description: field("description"),
          content: raw.replace(/^---[\s\S]*?---\s*/, ""),
        };
      }),
  );
  const result = await build({
    stdin: {
      contents: `
        import { agentDiscovery, publicResponseHeaders } from './src/server/agent-discovery';
        import { publicMarkdown, wantsMarkdown, publicPagePath } from './src/server/public-markdown';
        export default { async fetch(request) {
          const origin = new URL(request.url).origin;
          const docs = ${JSON.stringify(docs)};
          const discovered = await agentDiscovery(request, origin, async () => docs.map(doc => ({ ...doc, getMarkdown: async () => doc.content })));
          if (discovered) return discovered;
          const html = new Response('<html><head><title>Ignore head</title></head><body><nav>Ignore navigation</nav><main><h1>Yaap &amp; analytics</h1><aside>Ignore sidebar</aside><p>First <a href="/pricing?x=1&amp;y=2">pricing</a> &amp; details.</p><script>Ignore script</script><svg><text>Ignore icon</text></svg><div data-markdown-skip><h2>Ignore example data</h2></div><section><h2>Reports</h2><ul><li>Views</li><li>Events &#8212; live</li></ul><p hidden>Ignore hidden</p><p>End of main.</p></section></main><footer>Ignore footer</footer></body></html>', { headers: { 'Content-Type': 'text/html', 'Vary': 'Origin', 'ETag': 'old', 'Content-Length': '1' } });
          let response = wantsMarkdown(request) ? await publicMarkdown(html, new URL(publicPagePath(new URL(request.url).pathname), origin)) : html;
          publicResponseHeaders(response, request, origin);
          return response;
        } };
      `,
      resolveDir: process.cwd(),
    },
    bundle: true,
    write: false,
    format: "esm",
    platform: "node",
    mainFields: ["module", "main"],
    conditions: ["workerd", "worker", "node"],
    plugins: [
      {
        name: "raw-markdown",
        setup(plugin) {
          plugin.onLoad({ filter: /\.md$/ }, async ({ path }) => ({
            contents: await readFile(path.replace(/\?raw$/, ""), "utf8"),
            loader: "text",
          }));
        },
      },
    ],
  });
  mf = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script: result.outputFiles[0].text,
      compatibilityDate: "2026-09-09",
      compatibilityFlags: ["nodejs_compat"],
    }),
  );
  const tools = await build({
    entryPoints: ["src/lib/public-agent-tools.ts"],
    bundle: true,
    write: false,
    format: "esm",
    platform: "node",
  });
  ({ publicAgentTools, registerPublicAgentTools } = await import(
    `data:text/javascript;base64,${Buffer.from(tools.outputFiles[0].text).toString("base64")}`
  ));
});
after(async () => mf?.dispose());
const get = (path, options) => mf.dispatchFetch(origin + path, options);

test("discovery works without a database, links to this installation and preserves draft status", async () => {
  const robots = await (await get("/robots.txt")).text();
  assert.match(robots, /User-agent: \*/);
  assert.match(robots, /Content-Signal: search=yes, ai-input=yes, ai-train=no/);
  assert.doesNotMatch(robots, /Disallow: \/(?:app|login|signup|share|invite)/);
  assert.match(robots, /Allow: \/api\/v1\/openapi.json/);
  const sitemap = await (await get("/sitemap.xml")).text();
  assert.ok(sitemap.includes(`${origin}/pricing`));
  assert.doesNotMatch(sitemap, /\/privacy|\/terms|\/app|yaap\.sh/);
  const llms = await (await get("/llms.txt")).text();
  assert.match(llms, /draft, not effective/);
  assert.ok(llms.includes(`${origin}/auth.md`));
  const auth = await (await get("/auth.md")).text();
  assert.match(auth, /automated agent account registration are not supported/);
  assert.ok(auth.includes(`Resource/audience: ${origin}/mcp`));
  const guide = await (await get("/docs/api.md")).text();
  assert.match(
    guide,
    /https:\/\/github.com\/dagurleo\/yaap\/blob\/main\/docs\/REPORTING.md/,
  );
  assert.doesNotMatch(guide, /\]\(REPORTING.md\)/);
});

test("public variants share one canonical and non-content routes carry noindex", async () => {
  for (const path of [
    "/",
    "/pricing",
    "/self-hosted-web-analytics",
    "/conversion-tracking",
    "/revenue-attribution",
    "/docs",
    "/docs/npm",
  ]) {
    const markdown = path === "/" ? "/index.md" : `${path}.md`;
    for (const variant of [path, `${path}?utm_source=test`, markdown]) {
      const response = await get(variant);
      assert.ok(
        response.headers
          .get("Link")
          .includes(`<${origin}${path}>; rel="canonical"`),
      );
      assert.equal(response.headers.get("X-Robots-Tag"), null);
    }
  }
  const sitemap = await (await get("/sitemap.xml")).text();
  for (const path of [
    "/self-hosted-web-analytics",
    "/conversion-tracking",
    "/revenue-attribution",
  ])
    assert.ok(sitemap.includes(`<loc>${origin}${path}</loc>`));
  for (const path of [
    "/app",
    "/app/a/overview",
    "/sites/a",
    "/share/a",
    "/demo",
    "/login",
    "/signup",
    "/check-email",
    "/forgot-password",
    "/reset-password",
    "/setup",
    "/invite/token",
    "/docs-search",
  ])
    assert.equal(
      (await get(path)).headers.get("X-Robots-Tag"),
      "noindex, nofollow",
      path,
    );
});

test("catalogs and skill digest describe retrievable native resources", async () => {
  const api = await get("/.well-known/api-catalog");
  assert.match(api.headers.get("Content-Type"), /application\/linkset\+json/);
  assert.equal(
    (await api.json()).linkset[0]["service-desc"][0].href,
    `${origin}/api/v1/openapi.json`,
  );
  const catalog = await (await get("/.well-known/ai-catalog.json")).json();
  assert.equal(catalog.specVersion, "1.0");
  const cardResponse = await mf.dispatchFetch(catalog.entries[0].url);
  assert.match(
    cardResponse.headers.get("Content-Type"),
    /application\/mcp-server-card\+json/,
  );
  const card = await cardResponse.json();
  assert.equal(card.name, "com.example.analytics/yaap");
  assert.equal(card.remotes[0].url, `${origin}/mcp`);
  assert.deepEqual(card.remotes[0].supportedProtocolVersions, ["2025-11-25"]);
  assert.equal(card.tools, undefined);
  assert.deepEqual(
    await (await get("/.well-known/mcp/server-card.json")).json(),
    card,
  );
  const index = await (
    await get("/.well-known/agent-skills/index.json")
  ).json();
  const skill = await (await get(index.skills[0].url)).text();
  assert.equal(
    index.skills[0].digest,
    `sha256:${createHash("sha256").update(skill).digest("hex")}`,
  );
  assert.ok(skill.includes(`description: ${index.skills[0].description}\n`));
  assert.equal(
    (await get("/llms.txt", { method: "HEAD" })).headers.get("Content-Type"),
    "text/plain; charset=utf-8",
  );
  assert.equal(await (await get("/llms.txt", { method: "HEAD" })).text(), "");
  assert.equal((await get("/llms.txt", { method: "OPTIONS" })).status, 204);
  const post = await get("/llms.txt", { method: "POST" });
  assert.equal(post.status, 405);
  assert.equal(post.headers.get("Allow"), "GET, HEAD, OPTIONS");
});

test("Markdown negotiation extracts actual public content and excludes scripts and mock data", async () => {
  const response = await get("/", { headers: { Accept: "text/markdown" } });
  const text = await response.text();
  assert.match(response.headers.get("Content-Type"), /text\/markdown/);
  assert.equal(response.headers.get("Vary"), "Origin, Accept");
  assert.equal(response.headers.get("ETag"), null);
  assert.match(text, /^# Yaap & analytics/);
  assert.match(
    text,
    /\[pricing\]\(<https:\/\/analytics.example.com\/pricing\?x=1&y=2>\)/,
  );
  assert.match(text, /## Reports/);
  assert.match(text, /- Views\n+- Events — live/);
  assert.match(text, /End of main\./);
  assert.doesNotMatch(text, /Ignore/);
  assert.match(
    response.headers.get("Link"),
    /rel="alternate"; type="text\/markdown"/,
  );
  assert.match(
    (await get("/pricing.md")).headers.get("Content-Type"),
    /text\/markdown/,
  );
  assert.equal(
    (await get("/privacy.md")).headers.get("X-Robots-Tag"),
    "noindex",
  );
  for (const accept of [
    "text/html",
    "*/*",
    "text/markdown;q=0",
    "text/html;q=1,text/markdown;q=0.5",
  ]) {
    assert.match(
      (await get("/", { headers: { Accept: accept } })).headers.get(
        "Content-Type",
      ),
      /text\/html/,
    );
  }
  for (const path of ["/app", "/login", "/api/v1/sites", "/unknown.md"]) {
    const privateResponse = await get(path, {
      headers: { Accept: "text/markdown" },
    });
    assert.match(privateResponse.headers.get("Content-Type"), /text\/html/);
    assert.equal(privateResponse.headers.get("Link"), null);
  }
});

test("public browser tools quote actual tiers and make no account changes", async () => {
  const tools = publicAgentTools(origin, false);
  assert.ok(tools.every((tool) => tool.annotations.readOnlyHint));
  const connection = await tools[0].execute({});
  assert.equal(connection.mcp, `${origin}/mcp`);
  const quote = tools[1].execute;
  assert.equal((await quote({ monthlyEvents: 100000 })).monthlyPriceCents, 900);
  assert.equal(
    (await quote({ monthlyEvents: 100001 })).monthlyPriceCents,
    1900,
  );
  assert.equal(
    (await quote({ monthlyEvents: 10000000 })).monthlyPriceCents,
    14900,
  );
  assert.equal(
    (await quote({ monthlyEvents: 10000001 })).monthlyPriceCents,
    undefined,
  );
  assert.equal(
    (await quote({ monthlyEvents: 0 })).hostedSignupAvailable,
    false,
  );
  for (const monthlyEvents of [-1, 1.5, "100000", Infinity, NaN])
    await assert.rejects(() => quote({ monthlyEvents }));
  const registrations = [];
  const cleanup = registerPublicAgentTools(
    {
      registerTool: async (tool, options) =>
        registrations.push({ tool, options }),
    },
    origin,
    true,
  );
  assert.equal(registrations.length, 2);
  cleanup();
  assert.ok(registrations.every(({ options }) => options.signal.aborted));
});

test("every public guide appears in the sitemap and local docs links resolve", async () => {
  const { readdir } = await import("node:fs/promises");
  const files = (await readdir("content/docs")).filter((file) =>
    file.endsWith(".mdx"),
  );
  const paths = new Set(
    files.map((file) =>
      file === "index.mdx" ? "/docs" : `/docs/${file.slice(0, -4)}`,
    ),
  );
  const sitemap = await (await get("/sitemap.xml")).text();
  for (const path of paths)
    assert.ok(
      sitemap.includes(`<loc>${origin}${path}</loc>`),
      `Missing sitemap guide: ${path}`,
    );
  for (const file of files) {
    const content = await readFile(`content/docs/${file}`, "utf8");
    for (const match of content.matchAll(
      /\]\((\/docs(?:\/[^)#]+)?)(?:#[^)]*)?\)/g,
    )) {
      assert.ok(
        match[1] === "/docs/api.md" || paths.has(match[1]),
        `Broken link in ${file}: ${match[1]}`,
      );
    }
  }
});

test("all public docs are discoverable as standalone Markdown and in the full export", async () => {
  const index = await (await get("/llms.txt")).text();
  const full = await (await get("/llms-full.txt")).text();
  for (const file of (await readdir("content/docs")).filter((file) =>
    file.endsWith(".mdx"),
  )) {
    const path = file === "index.mdx" ? "/docs" : `/docs/${file.slice(0, -4)}`;
    assert.ok(index.includes(`${origin}${path}.md`));
    const direct = await get(`${path}.md`);
    const text = await direct.text();
    assert.equal(direct.status, 200);
    assert.match(direct.headers.get("Content-Type"), /text\/markdown/);
    assert.equal(direct.headers.get("Content-Location"), `${origin}${path}.md`);
    assert.match(text, /^# /);
    assert.doesNotMatch(text, /<script type=|^title:|^description:/m);
    assert.ok(full.includes(text.trim()), `Full export omits ${path}`);
    const negotiated = await get(path, {
      headers: { Accept: "text/markdown" },
    });
    assert.equal(await negotiated.text(), text);
    assert.equal(negotiated.headers.get("Vary"), "Accept");
    const html = await get(path, { headers: { Accept: "text/html" } });
    assert.match(html.headers.get("Content-Type"), /text\/html/);
    assert.ok(html.headers.get("Link").includes(`${origin}${path}.md`));
    assert.equal(
      await (await get(`${path}.md`, { method: "HEAD" })).text(),
      "",
    );
  }
  assert.ok(full.includes(`Source: ${origin}/docs/api.md`));
  assert.match(full, /```tsx[\s\S]*useEffect/);
  assert.match(full, /\| Mode/);
  assert.match(full, /https:\/\/analytics.example.com\/docs\/npm/);
  assert.equal(
    await (await get("/docs/index.md")).text(),
    await (await get("/docs.md")).text(),
  );
  assert.equal((await get("/docs/internal-plan.md")).status, 404);
  assert.equal((await get("/docs/npm.md", { method: "POST" })).status, 405);
  assert.equal((await get("/docs/npm.md", { method: "OPTIONS" })).status, 204);
  for (const accept of [
    "*/*",
    "text/markdown;q=0",
    "text/html;q=1,text/markdown;q=0.5",
  ]) {
    assert.match(
      (await get("/docs", { headers: { Accept: accept } })).headers.get(
        "Content-Type",
      ),
      /text\/html/,
    );
  }
});
