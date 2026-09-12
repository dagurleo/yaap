import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readdirSync, readFileSync } from "node:fs";
import {
  generateSeed,
  optionsFromArgs,
  seedDatabaseConfig,
} from "../scripts/seed-site.mjs";

test("seed imports against real migrations with coherent dashboard data", () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec("PRAGMA foreign_keys=ON");
    const migrations = new URL("../migrations/", import.meta.url);
    for (const file of readdirSync(migrations)
      .filter((file) => file.endsWith(".sql"))
      .sort())
      db.exec(readFileSync(new URL(file, migrations), "utf8"));
    db.exec(
      "INSERT INTO user(id,name,email) VALUES ('owner','Owner','owner@example.test')",
    );
    db.exec(
      "INSERT INTO workspaces(id,owner_user_id,created_at,updated_at) VALUES ('workspace','owner',0,0)",
    );
    const now = Date.UTC(2026, 8, 10, 12);
    const options = {
      ownerId: "owner",
      workspaceId: "workspace",
      siteId: "demo",
      sessions: 5000,
      days: 180,
      now,
      name: "Owner's demo",
    };
    for (const sql of generateSeed(options)) db.exec(sql);
    const scalar = (sql) => Object.values(db.prepare(sql).get())[0];
    assert.equal(scalar("SELECT name FROM sites"), "Owner's demo");
    assert.ok(scalar("SELECT count(*) FROM events") > 15000);
    assert.equal(scalar("SELECT count(*) FROM goals"), 3);
    assert.equal(scalar("SELECT count(*) FROM funnels"), 2);
    assert.equal(
      scalar(
        `SELECT count(*) FROM events WHERE received_at > ${now} OR received_at < ${now - 180 * 86400000}`,
      ),
      0,
    );
    assert.ok(
      scalar("SELECT count(*) FROM events WHERE visitor_id IS NULL") > 0,
    );
    assert.ok(
      scalar(
        "SELECT count(*) FROM (SELECT visitor_id FROM events WHERE visitor_id IS NOT NULL GROUP BY visitor_id HAVING count(DISTINCT session_id) > 1)",
      ) > 0,
    );
    assert.ok(
      scalar(
        `SELECT count(DISTINCT visitor_id) FROM events WHERE received_at >= ${now - 300000}`,
      ) >= 20,
    );
    assert.ok(
      scalar(
        `SELECT count(*) FROM events WHERE received_at < ${now - 90 * 86400000}`,
      ) > 0,
    );
    assert.equal(
      scalar("SELECT count(*) FROM payments"),
      scalar("SELECT count(*) FROM events WHERE name='purchase'"),
    );
    assert.ok(
      scalar(
        "SELECT count(*) FROM payments WHERE refunded_amount > 0 AND refunded_amount <= amount",
      ) > 0,
    );
    assert.equal(scalar("SELECT count(DISTINCT mode) FROM payments"), 2);
    assert.equal(scalar("SELECT count(DISTINCT currency) FROM payments"), 2);
    assert.equal(
      scalar(
        "SELECT count(*) FROM payments p WHERE p.visitor_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM events e WHERE e.site_id=p.site_id AND e.visitor_id=p.visitor_id AND e.name='signup' AND e.received_at<=p.paid_at)",
      ),
      0,
    );
    assert.equal(
      scalar(
        "SELECT count(*) FROM ingestion_buckets b WHERE b.stored != (SELECT count(*) FROM events e WHERE e.received_at >= b.hour AND e.received_at < b.hour+3600000)",
      ),
      0,
    );
    assert.ok(
      scalar(
        "SELECT count(*) FROM events a JOIN events b ON a.session_id=b.session_id JOIN events c ON b.session_id=c.session_id WHERE a.path='/' AND b.path='/pricing' AND c.name='signup' AND a.received_at<b.received_at AND b.received_at<c.received_at",
      ) > 0,
    );
    const before = scalar("SELECT count(*) FROM events");
    for (const sql of generateSeed({
      ...options,
      siteId: "another",
      sessions: 20,
    }))
      db.exec(sql);
    assert.equal(
      scalar("SELECT count(*) FROM events WHERE site_id='demo'"),
      before,
    );
    assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
    assert.deepEqual(
      [...generateSeed({ ...options, sessions: 10 })],
      [...generateSeed({ ...options, sessions: 10 })],
    );
  } finally {
    db.close();
  }
});

test("seed validates options and cannot accidentally target remote D1", () => {
  assert.equal(optionsFromArgs([]).sessions, 100000);
  for (const args of [
    ["--sessions", "0"],
    ["--sessions", "1.5"],
    ["--days", "NaN"],
    ["--seed", "-1"],
    ["--name", ""],
    ["--origin", "https://example.com/path"],
    ["--remote"],
  ])
    assert.throws(() => optionsFromArgs(args));
  assert.equal(optionsFromArgs(["--sessions", "500000"]).sessions, 500000);
});

test("seed selects the configured local backend and rejects remote Postgres", () => {
  assert.deepEqual(seedDatabaseConfig({}, {}), { provider: "d1" });
  const local = {
    DATABASE_PROVIDER: "postgres",
    DATABASE_URL: "postgresql://user@127.0.0.1:5432/demo",
  };
  assert.deepEqual(seedDatabaseConfig(local, {}), {
    provider: "postgres",
    connectionString: local.DATABASE_URL,
  });
  assert.deepEqual(seedDatabaseConfig(local, { DATABASE_PROVIDER: "d1" }), {
    provider: "d1",
  });
  assert.equal(
    seedDatabaseConfig(local, {
      DATABASE_URL: "postgresql://user@localhost/other",
    }).connectionString,
    "postgresql://user@localhost/other",
  );
  assert.throws(
    () => seedDatabaseConfig({ DATABASE_PROVIDER: "mysql" }, {}),
    /Invalid DATABASE_PROVIDER/,
  );
  assert.throws(
    () => seedDatabaseConfig({ DATABASE_PROVIDER: "postgres" }, {}),
    /DATABASE_URL/,
  );
  for (const url of [
    "postgresql://user@db.example/demo",
    "postgresql://user@127.0.0.1/demo?host=db.example",
    "https://localhost/demo",
  ])
    assert.throws(() =>
      seedDatabaseConfig({ ...local, DATABASE_URL: url }, {}),
    );
  assert.equal(
    seedDatabaseConfig(
      { ...local, DATABASE_URL: "postgresql://user@[::1]/demo" },
      {},
    ).provider,
    "postgres",
  );
});
