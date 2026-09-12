import { sql } from "drizzle-orm";
import type { createDb } from "../db";
import type { EventProperties } from "../lib/event-properties";

export function propertyMatch(
  db: ReturnType<typeof createDb>,
  conditions: EventProperties = {},
  alias = "events",
) {
  const column = sql`${sql.identifier(alias)}.properties`;
  return sql.join(
    [
      sql`1=1`,
      ...Object.entries(conditions).map(([key, value]) => {
        if (db.provider === "postgres")
          return sql`(${column}::jsonb -> ${key}) = ${JSON.stringify(value)}::jsonb`;
        const equality =
          typeof value === "boolean"
            ? sql`prop.type=${value ? "true" : "false"}`
            : sql`prop.type in (${typeof value === "number" ? sql`'integer','real'` : sql`'text'`}) and prop.atom=${value}`;
        return sql`exists(select 1 from json_each(${column}) prop where prop.key=${key} and ${equality})`;
      }),
    ],
    sql` and `,
  );
}

export function goalMatch(
  db: ReturnType<typeof createDb>,
  goal: { eventName: string; path: string | null; conditions: EventProperties },
) {
  return sql`events.name=${goal.eventName} ${goal.path === null ? sql`` : sql`and events.path=${goal.path}`} and ${propertyMatch(db, goal.conditions)}`;
}
