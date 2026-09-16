import { HttpError } from "../http";
export const botCategories = {
  ai_answers: "AI answers",
  indexing: "Indexing",
  training: "Training",
  other: "Other automation",
} as const;
export type BotFilters = { days: number; category: string; botSource: string };
export function botFilters(input: Record<string, unknown>): BotFilters {
  const days = input.days === undefined ? 7 : Number(input.days);
  const category = input.category ?? "all";
  const botSource = input.botSource ?? "all";
  if (
    ![7, 30, 90].includes(days) ||
    typeof category !== "string" ||
    (category !== "all" && !Object.hasOwn(botCategories, category)) ||
    typeof botSource !== "string" ||
    !["all", "server", "browser"].includes(botSource)
  )
    throw new HttpError(400, "Invalid bot traffic filters");
  return { days, category, botSource };
}
