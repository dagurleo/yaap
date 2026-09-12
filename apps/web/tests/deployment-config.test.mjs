import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { configureDeploymentDatabase } from "../scripts/deployment-config.mjs";

const id = "0123456789abcdef0123456789abcdef";

test("absent build IDs preserve the configured database; malformed IDs fail before changing it", () => {
  for (const value of [undefined, "", "  "]) {
    for (const original of [
      { d1_databases: [{ binding: "DB", database_id: "existing-d1" }] },
      {
        vars: { DATABASE_PROVIDER: "postgres" },
        hyperdrive: [{ binding: "HYPERDRIVE", id }],
      },
    ]) {
      const config = structuredClone(original);
      configureDeploymentDatabase(config, value);
      assert.deepEqual(config, original);
    }
  }
  for (const value of [
    "not-an-id",
    "a".repeat(31),
    "g".repeat(32),
    "a".repeat(33),
  ]) {
    const config = { vars: { DATABASE_PROVIDER: "d1" } };
    assert.throws(
      () => configureDeploymentDatabase(config, value),
      /YAAP_HYPERDRIVE_ID/,
    );
    assert.deepEqual(config, { vars: { DATABASE_PROVIDER: "d1" } });
  }
});

test("the build ID replaces only the analytics database and preserves unrelated resources", () => {
  const config = {
    vars: { DATABASE_PROVIDER: "d1", YAAP_HOSTING_MODE: "hosted" },
    d1_databases: [{ binding: "DB" }, { binding: "OTHER_DB" }],
    hyperdrive: [
      { binding: "HYPERDRIVE", id: "a".repeat(32) },
      { binding: "OTHER_HYPERDRIVE", id: "b".repeat(32) },
    ],
    queues: { producers: [{ binding: "EVENTS", queue: "renamed-events" }] },
    secrets: { required: ["BETTER_AUTH_SECRET", "BOOTSTRAP_SECRET"] },
  };
  const unrelated = structuredClone({
    queues: config.queues,
    secrets: config.secrets,
  });
  configureDeploymentDatabase(config, ` ${id} `);
  configureDeploymentDatabase(config, id);
  assert.deepEqual(config.vars, {
    DATABASE_PROVIDER: "postgres",
    YAAP_HOSTING_MODE: "hosted",
  });
  assert.deepEqual(config.d1_databases, [{ binding: "OTHER_DB" }]);
  assert.deepEqual(config.hyperdrive, [
    { binding: "OTHER_HYPERDRIVE", id: "b".repeat(32) },
    { binding: "HYPERDRIVE", id },
  ]);
  assert.deepEqual(
    { queues: config.queues, secrets: config.secrets },
    unrelated,
  );
});

test("deploy rejects a stale provider or Hyperdrive ID before contacting a database or Wrangler", async () => {
  const directory = await mkdtemp(join(tmpdir(), "yaap-deploy-config-"));
  try {
    await mkdir(join(directory, "dist/server"), { recursive: true });
    const env = { ...process.env, YAAP_HYPERDRIVE_ID: id };
    delete env.DATABASE_URL;
    for (const [config, message] of [
      [
        {
          d1_databases: [
            {
              binding: "DB",
              database_id: "11111111-2222-4333-8444-555555555555",
            },
          ],
        },
        /Build output does not match YAAP_HYPERDRIVE_ID/,
      ],
      [
        {
          vars: { DATABASE_PROVIDER: "postgres" },
          hyperdrive: [{ binding: "HYPERDRIVE", id: "a".repeat(32) }],
        },
        /Build output does not match YAAP_HYPERDRIVE_ID/,
      ],
      [
        {
          vars: { DATABASE_PROVIDER: "postgres" },
          hyperdrive: [{ binding: "HYPERDRIVE", id }],
        },
        /Set the production DATABASE_URL build secret/,
      ],
    ]) {
      await writeFile(
        join(directory, "dist/server/wrangler.json"),
        JSON.stringify(config),
      );
      const result = spawnSync(
        process.execPath,
        [fileURLToPath(new URL("../scripts/deploy.mjs", import.meta.url))],
        { cwd: directory, env, encoding: "utf8" },
      );
      assert.equal(result.status, 1);
      assert.match(result.stderr, message);
      assert.equal(result.stdout, "");
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
