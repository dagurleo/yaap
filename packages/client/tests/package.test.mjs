import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

test("packed package installs independently, imports without a browser, and exposes usable types", async () => {
  const directory = await mkdtemp(join(tmpdir(), "yaap-client-package-"));
  try {
    const [packed] = JSON.parse(
      execFileSync(
        "npm",
        ["pack", "--ignore-scripts", "--json", "--pack-destination", directory],
        { encoding: "utf8" },
      ),
    );
    const files = packed.files.map((file) => file.path);
    for (const file of [
      "dist/index.js",
      "dist/index.d.ts",
      "dist/types.d.ts",
      "dist/script.js",
      "README.md",
      "LICENSE.md",
    ])
      assert.ok(files.includes(file), `Missing ${file}`);
    assert.ok(
      files.every(
        (file) =>
          file.startsWith("dist/") ||
          ["package.json", "README.md", "LICENSE.md"].includes(file),
      ),
    );
    await writeFile(
      join(directory, "package.json"),
      JSON.stringify({ private: true, type: "module" }),
    );
    execFileSync(
      "npm",
      [
        "install",
        "--ignore-scripts",
        "--no-audit",
        "--no-fund",
        join(directory, packed.filename),
      ],
      { cwd: directory, stdio: "pipe" },
    );
    execFileSync(
      process.execPath,
      [
        "--input-type=module",
        "-e",
        `
      import assert from "node:assert/strict";
      import { init } from "@yaap/client";
      assert.equal(typeof globalThis.window, "undefined");
      assert.equal(init({ siteId: "test", host: "https://analytics.example" }), undefined);
      assert.equal(init({ siteId: "test" }), undefined);
    `,
      ],
      { cwd: directory, stdio: "pipe" },
    );
    await writeFile(
      join(directory, "consumer.ts"),
      `
      import { init, type Analytics, type AnalyticsOptions, type EventProperties } from "@yaap/client";
      const options: AnalyticsOptions = { siteId: "test", host: "https://analytics.example", tracking: "paused" };
      const analytics: Analytics | undefined = init(options);
      const properties: EventProperties = { plan: "pro", seats: 2, trial: true };
      analytics?.track("signup", properties);
      analytics?.destroy();
      // @ts-expect-error Properties must be scalar values.
      analytics?.track("signup", { nested: {} });
      init({ siteId: "test" });
      // @ts-expect-error A site ID is still required with a custom server.
      init({ host: "https://analytics.example" });
    `,
    );
    const compiler = fileURLToPath(
      new URL("bin/tsc", import.meta.resolve("typescript/package.json")),
    );
    execFileSync(
      process.execPath,
      [
        compiler,
        "--strict",
        "--noEmit",
        "--module",
        "NodeNext",
        "--moduleResolution",
        "NodeNext",
        "--target",
        "ES2022",
        "consumer.ts",
      ],
      { cwd: directory, stdio: "pipe" },
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
