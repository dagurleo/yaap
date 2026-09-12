import { test } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
const bundle = await build({
  entryPoints: ["src/visitor-metadata.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  write: false,
});
const { visitorMetadata } = await import(
  "data:text/javascript;base64," +
    Buffer.from(bundle.outputFiles[0].text).toString("base64")
);
const metadata = (ua, cf, url = "https://analytics.example.com") => {
  const request = new Request(url, {
    headers: { "user-agent": ua, "CF-IPCountry": "US" },
  });
  Object.defineProperty(request, "cf", { value: cf });
  return visitorMetadata(request);
};
test("metadata handles mobile, tablet, desktop, unknown agents and missing geography", () => {
  const iphone = metadata(
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
    { country: "JP", region: "Tokyo", city: "Tokyo" },
  );
  assert.equal(iphone.browser, "Safari");
  assert.equal(iphone.os, "iOS");
  assert.equal(iphone.device, "Mobile");
  assert.equal(
    metadata(
      "Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1",
      {},
    ).device,
    "Tablet",
  );
  assert.equal(
    metadata(
      "Mozilla/5.0 (X11; Linux x86_64; rv:130.0) Gecko/20100101 Firefox/130.0",
      {},
    ).browser,
    "Firefox",
  );
  assert.deepEqual(metadata("", undefined), {
    country: null,
    region: null,
    city: null,
    browser: null,
    os: null,
    device: null,
  });
  const local = metadata(
    "",
    { country: "US", region: "Test", city: "Test" },
    "http://localhost:8790",
  );
  assert.equal(local.country, null);
  assert.equal(local.city, null);
  const invalid = metadata("unrecognized agent", {
    country: "XX",
    region: "Test",
    city: "Test",
  });
  assert.equal(invalid.country, null);
  assert.equal(invalid.region, null);
  assert.equal(
    metadata("", { country: "JP", region: "x".repeat(121), city: "bad\ncity" })
      .city,
    null,
  );
});
