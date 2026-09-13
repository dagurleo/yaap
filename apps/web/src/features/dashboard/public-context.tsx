import { reportFilters } from "@/lib/report-filters";
import {
  createContext,
  useContext,
  type ComponentPropsWithoutRef,
} from "react";
import { Link } from "@tanstack/react-router";
import type { publicSiteFn } from "./public-functions";
export const PublicDashboardContext = createContext<Awaited<
  ReturnType<typeof publicSiteFn>
> | null>(null);
export const usePublicDashboard = () => useContext(PublicDashboardContext);
export function ReportLink({
  to,
  params,
  search = {},
  ...props
}: Omit<ComponentPropsWithoutRef<"a">, "href"> & {
  to:
    | "/app/$siteId/overview"
    | "/app/$siteId/visitors"
    | "/app/$siteId/funnels"
    | "/app/$siteId/revenue"
    | "/app/$siteId/events";
  activeOptions?: { includeSearch?: boolean; exact?: boolean };
  params: { siteId: string };
  search?: Record<string, unknown>;
}) {
  const shared = usePublicDashboard();
  const normalized = {
    ...search,
    ...reportFilters(search),
  };
  if (shared)
    return (
      <Link
        {...props}
        to="/share/$publicId/$report"
        params={{ publicId: shared.publicId, report: to.split("/").at(-1)! }}
        search={normalized}
      />
    );
  if (to === "/app/$siteId/visitors")
    return (
      <Link
        {...props}
        to={to}
        params={params}
        search={{
          ...normalized,
          cohort:
            search.cohort === "new" || search.cohort === "returning"
              ? search.cohort
              : "all",
          goalId: typeof search.goalId === "string" ? search.goalId : "",
          page: Number(search.page ?? 0),
        }}
      />
    );
  if (to === "/app/$siteId/revenue")
    return (
      <Link
        {...props}
        to={to}
        params={params}
        search={{
          ...normalized,
          mode: search.mode === "test" ? "test" : "live",
          page: Number(search.page ?? 0),
        }}
      />
    );
  return <Link {...props} to={to} params={params} search={normalized} />;
}
