import { test } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
const output = await build({
  entryPoints: ["src/lib/site-settings.ts"],
  bundle: true,
  write: false,
  format: "esm",
  platform: "node",
});
const {
  validateSiteDetails,
  validateTrackingRules,
  defaultTrackingRules,
  matchesPath,
  allowedTrackingOrigin,
  excludedByTrackingRules,
} = await import(
  "data:text/javascript;base64," +
    Buffer.from(output.outputFiles[0].text).toString("base64")
);
test("website identity rejects invalid origins and blank names", () => {
  assert.deepEqual(
    validateSiteDetails({ name: " Example ", origin: "https://EXAMPLE.com/" }),
    { name: "Example", origin: "https://example.com" },
  );
  for (const origin of [
    "https://example.com/path",
    "http://example.com",
    "https://user:pass@example.com",
    "https://example.com?foo=1",
    "javascript:alert(1)",
  ])
    assert.throws(() => validateSiteDetails({ name: "Test", origin }));
  assert.throws(() =>
    validateSiteDetails({ name: "  ", origin: "https://example.com" }),
  );
  assert.equal(
    validateSiteDetails({ name: "Local", origin: "http://localhost:3000" })
      .origin,
    "http://localhost:3000",
  );
});
test("tracking rules validate bounds, normalize and deduplicate origins", () => {
  const rules = validateTrackingRules({
    ...defaultTrackingRules,
    additionalOrigins: ["https://EXAMPLE.com/", "https://example.com"],
    excludedHostnames: ["STAGING.example.com"],
    excludedPaths: ["/admin/*", "/private"],
  });
  assert.deepEqual(rules.additionalOrigins, ["https://example.com"]);
  assert.deepEqual(rules.excludedHostnames, ["staging.example.com"]);
  for (const invalid of [
    { allowAllDomains: "true" },
    { excludedPaths: ["//evil"] },
    { excludedPaths: ["/path?token=secret"] },
    { excludedHostnames: ["https://example.com"] },
    { additionalOrigins: Array(51).fill("https://example.com") },
  ])
    assert.throws(() =>
      validateTrackingRules({ ...defaultTrackingRules, ...invalid }),
    );
});
test("path wildcards are anchored and punctuation is literal", () => {
  for (const [path, rule, expected] of [
    ["/admin/users", "/admin/*", true],
    ["/admin", "/admin/*", false],
    ["/x/admin/users", "/admin/*", false],
    ["/file.json", "/file.json", true],
    ["/fileXjson", "/file.json", false],
    ["/a/x/b/y/c", "/a/*/b/*/c", true],
    ["/aba", "/ab*ba", false],
    ["/anything", "/*", true],
    ["/a[1]", "/a[1]", true],
  ])
    assert.equal(matchesPath(path, rule), expected, `${path}: ${rule}`);
});
test("allowed origins are exact and exclusions win over allow-all", () => {
  const rules = {
    ...defaultTrackingRules,
    additionalOrigins: ["https://app.example.com"],
    excludedPaths: ["/admin/*"],
    excludedHostnames: ["staging.example.com"],
  };
  assert.equal(
    allowedTrackingOrigin(
      "https://app.example.com",
      "https://example.com",
      rules,
    ),
    true,
  );
  for (const origin of [
    null,
    "null",
    "https://example.com.evil.test",
    "https://app.example.com:8080",
    "https://app.example.com/path",
    "file://",
  ])
    assert.equal(
      allowedTrackingOrigin(origin, "https://example.com", rules),
      false,
    );
  assert.equal(
    allowedTrackingOrigin("https://custom.example", "https://example.com", {
      ...rules,
      allowAllDomains: true,
    }),
    true,
  );
  assert.equal(
    excludedByTrackingRules("https://staging.example.com", "/", {
      ...rules,
      allowAllDomains: true,
    }),
    true,
  );
  assert.equal(
    excludedByTrackingRules(
      "https://app.example.com",
      "/admin/users?x=1",
      rules,
    ),
    true,
  );
  assert.equal(
    excludedByTrackingRules("https://app.example.com", "/public", rules),
    false,
  );
});
