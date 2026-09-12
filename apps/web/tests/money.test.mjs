import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { transform } from "esbuild";
const { code } = await transform(await readFile("src/lib/money.ts", "utf8"), {
  loader: "ts",
  format: "esm",
});
const { money } = await import(
  "data:text/javascript;base64," + Buffer.from(code).toString("base64")
);
test("money displays minor units without merging currencies", () => {
  assert.match(money(1099, "USD"), /10\.99/);
  assert.match(money(1099, "JPY"), /1,099/);
  assert.match(money(500, "ISK"), /5$/);
  assert.match(money(500, "UGX"), /5$/);
  assert.match(money(500, "MGA"), /500/);
});
