import { test } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { postgresFixture } from "./helpers/postgres.mjs";

test(
  "Postgres funnels scale across visitors; query timeouts roll back and release locks",
  {
    skip: process.env.YAAP_TEST_DATABASE !== "postgres",
    timeout: 60_000,
  },
  async (t) => {
    await mkdir(".wrangler", { recursive: true });
    const directory = await mkdtemp(".wrangler/funnel-runtime-");
    const fixture = await postgresFixture();
    let executor;
    try {
      const outfile = resolve(directory, "runtime.mjs");
      await build({
        stdin: {
          contents:
            'export { siteRevenue } from "./src/server/revenue"; export { siteConversions } from "./src/server/conversion-report"; export { siteFunnels } from "./src/server/funnels"; export { withDatabase } from "./src/db"; export { createExecutor } from "./src/db/executor"; export { sql } from "drizzle-orm";',
          resolveDir: process.cwd(),
        },
        outfile,
        bundle: true,
        platform: "node",
        format: "esm",
        packages: "external",
      });
      const {
        siteConversions,
        siteRevenue,
        siteFunnels,
        withDatabase,
        createExecutor,
        sql,
      } = await import(pathToFileURL(outfile));
      const now = Date.now() - 60_000;
      await fixture.pool.query(
        'insert into "user"(id,name,email,created_at,updated_at) values($1,$2,$3,$4,$4)',
        ["runtime-owner", "Runtime test", "runtime@example.test", now],
      );
      await fixture.pool.query(
        "insert into workspaces(id,owner_user_id,created_at,updated_at) values('runtime-workspace','runtime-owner',$1,$1)",
        [now],
      );
      await fixture.pool.query(
        "insert into sites(id,owner_id,workspace_id,name,origin,created_at) values('runtime-site','runtime-owner','runtime-workspace','Runtime','https://runtime.test',$1)",
        [now],
      );
      const steps = [
        { kind: "page", value: "/" },
        { kind: "page", value: "/pricing" },
        { kind: "event", value: "signup" },
      ];
      await fixture.pool.query(
        "insert into funnels(id,site_id,name,scope,window_hours,steps,created_at,updated_at) values('runtime-funnel','runtime-site','Signup','session',24,$1,$2,$2)",
        [JSON.stringify(steps), now],
      );
      // 10,000 independent visitors and 100,000 events: every visitor enters,
      // only the even visitors reach signup. Extra events exercise indexed seeks.
      await fixture.pool.query(
        `insert into events(id,site_id,visitor_id,session_id,name,path,received_at)
      select 'v'||v||'-'||step,'runtime-site','v'||v,'s'||v,
        case when step=9 and v%2=0 then 'signup' else 'pageview' end,
        case step when 0 then '/' when 5 then '/pricing' else '/other' end,$1::bigint+step
      from generate_series(1,10000) v cross join generate_series(0,9) step`,
        [now],
      );
      await fixture.pool.query("analyze events");
      const env = {
        DATABASE_PROVIDER: "postgres",
        DATABASE_URL: fixture.connectionString,
      };
      const started = performance.now();
      const report = await withDatabase(env, (scoped) =>
        siteFunnels(
          scoped,
          "runtime-owner",
          "runtime-site",
          { days: 7 },
          "runtime-funnel",
        ),
      );
      const elapsed = performance.now() - started;
      assert.deepEqual(
        report.results.steps.map((s) => s.reached),
        [10000, 10000, 5000],
      );
      assert.ok(
        elapsed < 10000,
        `100k-event funnel took ${elapsed.toFixed(0)}ms`,
      );
      t.diagnostic(
        `100,000 events / 10,000 visitors / 3 steps: ${elapsed.toFixed(0)}ms`,
      );
      await fixture.pool.query(
        "insert into goals(id,site_id,name,event_name,created_at) values('runtime-goal','runtime-site','Signup','signup',$1)",
        [now],
      );
      const conversionStarted = performance.now();
      const conversions = await withDatabase(env, (scoped) =>
        siteConversions(scoped, "runtime-owner", "runtime-site", {
          days: 7,
          dimension: "landing",
        }),
      );
      assert.equal(conversions.totals.sessions, 10000);
      assert.equal(conversions.totals.convertedSessions, 5000);
      assert.equal(conversions.rows[0].key, "/");
      const conversionElapsed = performance.now() - conversionStarted;
      assert.ok(
        conversionElapsed < 10000,
        `100k-event conversion report took ${conversionElapsed.toFixed(0)}ms`,
      );
      t.diagnostic(
        `100,000-event conversion acquisition report: ${conversionElapsed.toFixed(0)}ms`,
      );
      await fixture.pool.query(
        `insert into payments(site_id,provider,mode,external_id,amount,currency,paid_at,visitor_id,created_at,updated_at)
        select 'runtime-site','api','live','payment-'||v,100,'USD',$1::bigint+20,'v'||v,$1,$1 from generate_series(1,200) v`,
        [now],
      );
      const attributionStart = performance.now();
      const revenue = await withDatabase(env, (scoped) =>
        siteRevenue(scoped, "runtime-owner", "runtime-site", {
          days: 7,
          mode: "live",
          page: 0,
        }),
      );
      const attributionElapsed = performance.now() - attributionStart;
      assert.equal(revenue.total, 200);
      assert.equal(revenue.attribution[0].payments, 200);
      assert.equal(revenue.payments[0].landingPage, "/");
      assert.ok(
        attributionElapsed < 10000,
        `200-payment backfill over 100k events took ${attributionElapsed.toFixed(0)}ms`,
      );
      t.diagnostic(
        `200-payment attribution backfill and revenue report / 100,000 events: ${attributionElapsed.toFixed(0)}ms`,
      );
      executor = createExecutor(env);
      const settings = await executor.all(
        sql`select current_setting('statement_timeout') as statement,current_setting('lock_timeout') as lock,current_setting('idle_in_transaction_session_timeout') as idle`,
      );
      assert.deepEqual(settings, [
        { statement: "15s", lock: "3s", idle: "10s" },
      ]);
      await fixture.pool.query(
        "create table timeout_probe(id integer primary key)",
      );
      const lock = await fixture.pool.connect();
      try {
        await lock.query(
          "BEGIN; LOCK TABLE timeout_probe IN ACCESS EXCLUSIVE MODE",
        );
        await assert.rejects(
          executor.all(sql`select * from timeout_probe`),
          (error) => error.code === "55P03",
        );
      } finally {
        await lock.query("ROLLBACK");
        lock.release();
      }
      // A real server-side timeout, not a client promise race. The write must
      // roll back and the sleeping query must no longer appear in pg_stat_activity.
      await assert.rejects(
        executor.atomic([
          sql`insert into timeout_probe values(1)`,
          sql`select pg_sleep(30)`,
        ]),
        (error) => error.code === "57014",
      );
      assert.equal(
        (await fixture.pool.query("select count(*) from timeout_probe")).rows[0]
          .count,
        0,
      );
      assert.equal(
        (
          await fixture.pool.query(
            "select count(*) from pg_stat_activity where datname=current_database() and state='active' and query='select pg_sleep(30)' and pid<>pg_backend_pid()",
          )
        ).rows[0].count,
        0,
      );
      assert.equal(
        (await executor.all(sql`select 1 as recovered`))[0].recovered,
        1,
      );
    } finally {
      await executor?.close();
      await fixture.close();
      await rm(directory, { recursive: true, force: true });
    }
  },
);
