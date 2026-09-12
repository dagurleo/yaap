import { sql } from "drizzle-orm";
import type { createDb } from "../db";
import type { ReportFilters } from "../lib/report-filters";
import { goalMatch } from "./conversion-match";
import { segmentFilter } from "./report-filter";

type Counts = {
  id: string;
  completions: number;
  identifiedCompletions: number;
  convertedSessions: number;
};
export async function goalReport(
  db: ReturnType<typeof createDb>,
  siteId: string,
  filters: ReportFilters,
  start: number,
  end: number,
  summary?: Counts[],
) {
  const definitions = (await db.listGoals(siteId)).sort(
    (a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id),
  );
  const summarized = new Map(summary?.map((row) => [row.id, row]));
  // Daily activity records have event names, but no paths or properties. Only
  // unconstrained event goals can use them; richer definitions read raw events.
  const raw = definitions.filter(
    (goal) =>
      goal.path !== null ||
      Object.keys(goal.conditions).length ||
      !summarized.has(goal.id),
  );
  if (raw.length) {
    const results = await db.batch(
      raw.map((goal) =>
        db.query<Counts>(sql`
      select ${goal.id} as id,count(*) as completions,count(events.session_id) as "identifiedCompletions",
        count(distinct events.session_id) as "convertedSessions" from events
      where events.site_id=${siteId} and events.received_at>=${start} and events.received_at<${end}
        and ${segmentFilter(filters)} and ${goalMatch(db, goal)}`),
      ),
    );
    for (const [row] of results) summarized.set(row.id, row);
  }
  return definitions.map((goal) => ({ ...goal, ...summarized.get(goal.id)! }));
}
