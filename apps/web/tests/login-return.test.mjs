import { test } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";

const output = await build({
  entryPoints: ["src/lib/login-return.ts"],
  bundle: true,
  write: false,
  format: "esm",
  platform: "node",
});
const { loginReturn } = await import(
  "data:text/javascript;base64," +
    Buffer.from(output.outputFiles[0].text).toString("base64")
);

test("login returns preserve OAuth and exact invitation routes", () => {
  const token = "a".repeat(43);
  assert.equal(loginReturn(`/invite/${token}`), `/invite/${token}`);
  assert.equal(
    loginReturn("/oauth/authorize?client_id=test&state=opaque"),
    "/oauth/authorize?client_id=test&state=opaque",
  );
});

test("login returns reject external and malformed destinations", () => {
  const token = "a".repeat(43);
  for (const value of [
    "https://evil.example/invite/" + token,
    "//evil.example/invite/" + token,
    "/invite/short",
    `/invite/${token}?next=https://evil.example`,
    "/invite/%2e%2e%2fapp",
    `/invite/${token}#fragment`,
    `/invite\\${token}`,
    "/app",
    null,
  ])
    assert.equal(loginReturn(value), undefined, String(value));
});
