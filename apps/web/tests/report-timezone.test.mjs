import { test } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
async function module(path) {
  const output = await build({
    entryPoints: [path],
    bundle: true,
    write: false,
    format: "esm",
    platform: "node",
  });
  return import(
    "data:text/javascript;base64," +
      Buffer.from(output.outputFiles[0].text).toString("base64")
  );
}
const { calendarDate, dayBoundary, calendarBuckets, validateTimezone } =
  await module("src/lib/report-timezone.ts");
const { reportFilters, reportPeriod } = await module(
  "src/lib/report-filters.ts",
);
const at = Date.parse;
const hour = 3600000;
test("Tokyo today starts at Japanese midnight even while UTC is yesterday", () => {
  const now = at("2026-09-10T16:00:00Z");
  const filters = {
    ...reportFilters({ from: "2026-09-11", to: "2026-09-11" }),
    timezone: "Asia/Tokyo",
  };
  const period = reportPeriod(filters, now);
  assert.equal(period.start, at("2026-09-10T15:00:00Z"));
  assert.equal(period.end, now + 1);
  assert.equal(period.days, 1);
  assert.equal(period.previousStart, at("2026-09-09T15:00:00Z"));
  assert.equal(calendarDate(period.start - 1, filters.timezone), "2026-09-10");
  assert.equal(calendarDate(period.start, filters.timezone), "2026-09-11");
  assert.throws(
    () => reportPeriod({ ...filters, timezone: "UTC" }, now),
    /today/,
  );
});
test("calendar comparisons and buckets follow 23-hour and 25-hour days", () => {
  for (const [date, hours, start] of [
    ["2026-03-08", 23, "2026-03-08T05:00:00Z"],
    ["2026-11-01", 25, "2026-11-01T04:00:00Z"],
  ]) {
    const period = reportPeriod(
      { days: 7, from: date, to: date, timezone: "America/New_York" },
      at("2026-12-01T00:00:00Z"),
    );
    assert.equal(period.start, at(start));
    assert.equal(period.end - period.start, hours * hour);
    assert.equal(
      calendarDate(period.previousStart, period.timezone),
      date === "2026-03-08" ? "2026-03-07" : "2026-10-31",
    );
    const buckets = calendarBuckets(
      period.previousStart,
      period.end,
      period.timezone,
    );
    assert.equal(buckets.length, 2);
    assert.equal(buckets[0].end, buckets[1].start);
    assert.equal(buckets[1].end - buckets[1].start, hours * hour);
  }
});
test("fractional offsets, midnight transitions and skipped dates have exact boundaries", () => {
  assert.equal(
    dayBoundary("2026-09-11", "Asia/Kathmandu"),
    at("2026-09-10T18:15:00Z"),
  );
  assert.equal(
    dayBoundary("2018-11-04", "America/Sao_Paulo"),
    at("2018-11-04T03:00:00Z"),
  );
  assert.equal(
    dayBoundary("2011-12-30", "Pacific/Apia"),
    dayBoundary("2011-12-31", "Pacific/Apia"),
  );
});
test("timezone input is validated and UTC remains the default", () => {
  assert.equal(validateTimezone("Asia/Tokyo"), "Asia/Tokyo");
  for (const value of [
    null,
    "",
    "Japan/nope",
    "+09:00",
    "UTC'; drop table sites",
    {},
  ])
    assert.throws(() => validateTimezone(value));
  const now = at("2026-09-11T12:00:00Z");
  const period = reportPeriod({ days: 7 }, now);
  assert.equal(period.start, at("2026-09-05T00:00:00Z"));
  assert.equal(period.timezone, "UTC");
  assert.equal(period.days, 7);
});
