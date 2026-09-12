import { createHash } from "node:crypto";
import { conversionConditions } from "../lib/conversion-conditions";
import { createDb } from "../db";
import { HttpError, requiredString } from "../http";
import { defaultGoalIcon, validEntityIcon } from "../lib/entity-icons";
import type { Env } from "../types";

export async function saveGoal(
  env: Env,
  ownerId: string,
  siteId: string,
  body: Record<string, unknown>,
  id?: string,
) {
  const db = createDb(env);
  const site = await db.findSite(siteId, ownerId);
  if (!site) throw new HttpError(404, "Website not found");
  const values = validateGoal(body);
  let goal;
  try {
    if (id !== undefined) {
      if (typeof id !== "string" || !id || id.length > 128)
        throw new HttpError(400, "Invalid goal");
      goal = await db.updateGoal(siteId, id, values);
      if (!goal) throw new HttpError(404, "Goal not found");
    } else {
      goal = await db.createGoal({
        ...values,
        id: crypto.randomUUID(),
        siteId,
        createdAt: Date.now(),
      });
    }
  } catch (error) {
    if (
      error instanceof Error &&
      /unique constraint|UNIQUE constraint|duplicate key/.test(error.message)
    )
      throw new HttpError(
        409,
        "This definition already has a goal. Restore it if archived.",
      );
    throw error;
  }
  if (!goal)
    throw new HttpError(
      409,
      "This definition already has a goal. Restore it if archived.",
    );
  return goal;
}

export async function setGoalArchived(
  env: Env,
  ownerId: string,
  siteId: string,
  goalId: string,
  archived: boolean,
) {
  if (typeof archived !== "boolean")
    throw new HttpError(400, "Choose whether to archive this goal");
  const db = createDb(env);
  const site = await db.findSite(siteId, ownerId);
  if (!site) throw new HttpError(404, "Website not found");
  const goal = await db.archiveGoal(siteId, goalId, archived);
  if (!goal) throw new HttpError(404, "Goal not found");
  return goal;
}

export function validateGoal(body: Record<string, unknown>) {
  const name = requiredString(body, "name", 120).trim();
  const path = body.path === undefined || body.path === null ? null : body.path;
  if (
    path !== null &&
    (typeof path !== "string" ||
      !path.startsWith("/") ||
      path.startsWith("//") ||
      path.length > 1024 ||
      /[?#\x00-\x1f\x7f]/.test(path))
  )
    throw new HttpError(
      400,
      "Use an exact page path without queries or fragments",
    );
  const eventName =
    path === null ? requiredString(body, "eventName", 64) : "pageview";
  const conditions = conversionConditions(body.conditions);
  const icon = body.icon ?? defaultGoalIcon;
  if (!validEntityIcon(icon))
    throw new HttpError(400, "Choose a valid goal icon");
  if (
    !/^[a-zA-Z0-9_.-]{1,64}$/.test(eventName) ||
    (eventName === "pageview" && path === null)
  )
    throw new HttpError(
      400,
      "Use a custom event name with letters, numbers, underscores, dots or hyphens",
    );
  const definitionKey =
    path === null && !Object.keys(conditions).length
      ? null
      : "match:" +
        createHash("sha256")
          .update(JSON.stringify([eventName, path, conditions]))
          .digest("hex");
  const values = { name, eventName, icon, path, conditions, definitionKey };
  return values;
}
