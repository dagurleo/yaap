import { test } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";

const built = await build({
  entryPoints: ["src/lib/ad-attribution.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  write: false,
});
const { adAttribution, adAttributionColumns } = await import(
  `data:text/javascript;base64,${Buffer.from(built.outputFiles[0].text).toString("base64")}`
);
const now = Date.now();
const event = {
  version: 2,
  visitorId: "site-hashed-visitor",
  sessionId: "site-hashed-session",
  receivedAt: now,
};
const context = {
  version: 1,
  provider: "google",
  accountId: null,
  campaignId: "90071992547409931234",
  groupId: "0023",
  adId: null,
  touchId: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
  touchedAt: now,
  storage: "granted",
  consentPolicy: "v1",
};
test("ad envelope rejects raw matching data, invalid IDs, unknown versions and unlinked or stale context", () => {
  assert.equal(adAttribution(context, event).campaignId, context.campaignId);
  assert.equal(
    adAttributionColumns(adAttribution(context, event)).adGroupId,
    "0023",
  );
  assert.equal(adAttribution(undefined, event), undefined);
  for (const change of [
    { version: 2 },
    { storage: "denied" },
    { storage: "unknown" },
    { provider: "other" },
    { gclid: "private" },
    { consentPolicy: "" },
    { campaignId: 123 },
    { campaignId: "email@example.com" },
    { campaignId: "1".repeat(33) },
    { adId: undefined },
    { accountId: {} },
    { touchedAt: now + 300001 },
    { touchedAt: now - 2100001 },
    { touchedAt: "1" },
    { touchId: "not-a-uuid" },
  ])
    assert.throws(() => adAttribution({ ...context, ...change }, event));
  for (const change of [
    { version: 1 },
    { visitorId: null },
    { sessionId: null },
  ])
    assert.throws(() => adAttribution(context, { ...event, ...change }));
  assert.ok(
    Object.values(adAttributionColumns(undefined)).every((v) => v === null),
  );
});
