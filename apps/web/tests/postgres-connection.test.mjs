import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import pg from "pg";
import { migrationConnectionString } from "../scripts/migrate-postgres.mjs";

test("PlanetScale system certificates work with pg and preserve connection details", () => {
  const original =
    "postgresql://role%2Fbranch:p%40ss%26word@example.invalid:5432/analytics?sslmode=verify-full&sslrootcert=system&sslnegotiation=direct&application_name=yaap+migrations";
  assert.throws(() => new pg.Client({ connectionString: original }), {
    code: "ENOENT",
    path: "system",
  });
  const connectionString = migrationConnectionString(original);
  const client = new pg.Client({ connectionString });
  const parameters = client.connectionParameters;
  assert.equal(parameters.user, "role/branch");
  assert.equal(parameters.password, "p@ss&word");
  assert.equal(parameters.host, "example.invalid");
  assert.equal(parameters.port, 5432);
  assert.equal(parameters.database, "analytics");
  assert.equal(parameters.application_name, "yaap migrations");
  assert.equal(parameters.sslnegotiation, "direct");
  // An empty TLS options object uses Node's default CA and hostname checks.
  assert.deepEqual(client.ssl, {});
  assert.equal(
    new URL(connectionString).searchParams.has("sslrootcert"),
    false,
  );
});

test("system trust always verifies TLS, including with libpq compatibility enabled", () => {
  for (const mode of [
    undefined,
    "require",
    "verify-ca",
    "verify-full",
    "disable",
    "no-verify",
  ]) {
    for (const compatibility of [false, true]) {
      const url = new URL(
        "postgresql://role:password@example.invalid/analytics?sslrootcert=system",
      );
      if (mode) url.searchParams.set("sslmode", mode);
      if (compatibility) url.searchParams.set("uselibpqcompat", "true");
      const connectionString = migrationConnectionString(url.href);
      assert.equal(
        new URL(connectionString).searchParams.get("sslmode"),
        "verify-full",
      );
      assert.deepEqual(new pg.Client({ connectionString }).ssl, {});
    }
  }
});

test("ordinary local and verified TLS URLs are unchanged", () => {
  for (const original of [
    "postgresql://local@127.0.0.1/analytics?sslmode=disable",
    "postgresql://role:password@example.invalid/analytics?sslmode=verify-full",
  ]) {
    const connectionString = migrationConnectionString(original);
    assert.equal(connectionString, original);
    assert.deepEqual(
      new pg.Client({ connectionString }).ssl,
      new pg.Client({ connectionString: original }).ssl,
    );
  }
});

test("custom certificate files are preserved", async () => {
  const directory = await mkdtemp(join(tmpdir(), "yaap-postgres-ca-"));
  try {
    const certificate = "test certificate contents";
    const path = join(directory, "root.crt");
    await writeFile(path, certificate);
    const url = new URL(
      "postgresql://role:password@example.invalid/analytics?sslmode=verify-full",
    );
    url.searchParams.set("sslrootcert", path);
    const connectionString = migrationConnectionString(url.href);
    assert.equal(connectionString, url.href);
    assert.deepEqual(new pg.Client({ connectionString }).ssl, {
      ca: certificate,
    });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
