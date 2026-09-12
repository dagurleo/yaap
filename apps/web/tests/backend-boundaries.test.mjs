import { test } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

const output = await build({
  stdin: {
    contents: `export * from "./src/http";
      export { postgresPool } from "./src/db/executor";
      export { reportFilters } from "./src/lib/report-filters";
      export { revenueFilters } from "./src/lib/revenue-filters";
      export { default as worker } from "./src/server";`,
    resolveDir: process.cwd(),
    loader: "ts",
  },
  bundle: true,
  write: false,
  format: "esm",
  platform: "node",
  loader: { ".md": "text" },
  banner: {
    js: `import { createRequire } from "node:module"; const require = createRequire(${JSON.stringify(pathToFileURL(resolve("package.json")).href)});`,
  },
  plugins: [
    {
      name: "unused-ssr-handler",
      setup(build) {
        build.onResolve(
          { filter: /^@tanstack\/react-start\/server-entry$/ },
          () => ({ path: "ssr", namespace: "test" }),
        );
        build.onLoad({ filter: /.*/, namespace: "test" }, () => ({
          contents:
            'export default { fetch() { throw new Error("Unexpected SSR request"); } };',
        }));
      },
    },
  ],
});
const {
  json,
  readBody,
  readJson,
  requiredString,
  postgresPool,
  reportFilters,
  revenueFilters,
  worker,
} = await import(
  "data:text/javascript;base64," +
    Buffer.from(output.outputFiles[0].text).toString("base64")
);

const request = (body, headers = {}) =>
  new Request("https://analytics.example/api", {
    method: "POST",
    body,
    headers,
    duplex: "half",
  });

test("JSON response headers accept records, tuples and Headers instances", () => {
  for (const headers of [
    { "X-Request-Id": "example" },
    [["X-Request-Id", "example"]],
    new Headers({ "X-Request-Id": "example" }),
  ]) {
    const response = json({ ok: true }, 201, headers);
    assert.equal(response.status, 201);
    assert.equal(response.headers.get("x-request-id"), "example");
    assert.equal(response.headers.get("cache-control"), "no-store");
  }
});

test("body limits count streamed bytes, cancel oversized input and release readers", async () => {
  let cancelled = false;
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode("東京"));
      controller.enqueue(new TextEncoder().encode("!"));
    },
    cancel() {
      cancelled = true;
    },
  });
  const input = request(stream);
  await assert.rejects(readBody(input, 6), { status: 413 });
  assert.equal(cancelled, true);
  assert.equal(input.body.locked, false);
  const exact = request("東京");
  assert.equal((await readBody(exact, 6)).byteLength, 6);
  assert.equal(exact.body.locked, false);
});

test("body stream failures release the reader without masking the failure", async () => {
  const input = request(
    new ReadableStream({
      start(controller) {
        controller.error(new Error("interrupted upload"));
      },
    }),
  );
  await assert.rejects(readBody(input, 16), /interrupted upload/);
  assert.equal(input.body.locked, false);
});

test("JSON parsing accepts case-insensitive media types and rejects malformed input", async () => {
  assert.deepEqual(
    await readJson(
      request('{"name":"東京"}', {
        "Content-Type": "Application/JSON; charset=utf-8",
      }),
    ),
    { name: "東京" },
  );
  for (const type of ["text/json", "application/json-extra", "text/plain"]) {
    await assert.rejects(readJson(request("{}", { "Content-Type": type })), {
      status: 415,
    });
  }
  for (const body of ["null", "[]", "1", "{", ""]) {
    await assert.rejects(
      readJson(request(body, { "Content-Type": "application/json" })),
      { status: 400 },
    );
  }
});

test("malformed settings and report inputs produce validation errors", () => {
  for (const input of [null, undefined, [], "report", 42]) {
    assert.throws(() => requiredString(input, "name", 120), { status: 400 });
    assert.throws(() => reportFilters(input), { status: 400 });
    assert.throws(() => revenueFilters(input), { status: 400 });
  }
});

test("local PostgreSQL connections cannot hide a remote host in URL parameters", async () => {
  for (const url of [
    "postgresql://user@remote.example/db",
    "postgresql://user@localhost/db?host=remote.example",
    "postgresql://user@localhost/db?%68ost=remote.example",
    "postgresql://user@localhost/db?host=localhost&host=remote.example",
    "https://localhost/db",
  ]) {
    assert.throws(() => postgresPool({ DATABASE_URL: url }), /HYPERDRIVE/);
  }
  const pool = postgresPool({ DATABASE_URL: "postgresql://user@127.0.0.1/db" });
  await pool.end();
});

test("database initialization failures receive the normal private error response", async (t) => {
  t.mock.method(console, "error", () => {});
  for (const bindings of [
    {},
    { DATABASE_PROVIDER: "unsupported" },
    { DATABASE_PROVIDER: "postgres" },
  ]) {
    const response = await worker.fetch(
      new Request("https://analytics.example/health"),
      bindings,
    );
    assert.equal(response.status, 500);
    assert.equal(response.headers.get("cache-control"), "private, no-store");
    assert.equal(response.headers.get("x-content-type-options"), "nosniff");
    assert.equal(response.headers.get("x-frame-options"), "DENY");
    assert.deepEqual(await response.json(), {
      error: "Request failed. Check configuration and migrations.",
    });
  }
});
