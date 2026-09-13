import * as queries from "./queries";
import { publicReportFn, type publicSiteFn } from "./public-functions";
import { usePublicDashboard } from "./public-context";
import type { PublicReport } from "../../server/access";
import type { JourneyCursor } from "../../server/visitors";

/** Public reports have separate cache keys and never call authenticated functions. */
export function createReportQueries(
  shared: Awaited<ReturnType<typeof publicSiteFn>> | null,
) {
  function scope<T extends { queryKey: readonly unknown[] }>(
    options: T,
    report: PublicReport,
    filters: Record<string, unknown>,
  ): T {
    if (!shared) return options;
    return {
      ...options,
      queryKey: ["public", shared.publicId, ...options.queryKey],
      staleTime: 1000,
      retry: false,
      queryFn: ({ pageParam }: { pageParam?: JourneyCursor }) =>
        publicReportFn({
          data: {
            publicId: shared.publicId,
            report,
            filters: {
              ...filters,
              ...(pageParam ? { cursor: pageParam } : {}),
            },
          },
        }),
    };
  }
  return {
    overviewQuery: (...args: Parameters<typeof queries.overviewQuery>) =>
      scope(
        queries.overviewQuery(...args),
        "overview",
        typeof args[1] === "number" ? { days: args[1] } : { ...args[1] },
      ),
    eventExplorerQuery: (
      ...args: Parameters<typeof queries.eventExplorerQuery>
    ) => scope(queries.eventExplorerQuery(...args), "events", { ...args[1] }),
    visitorsQuery: (...args: Parameters<typeof queries.visitorsQuery>) =>
      scope(queries.visitorsQuery(...args), "visitors", { ...args[1] }),
    journeyQuery: (...args: Parameters<typeof queries.journeyQuery>) =>
      scope(queries.journeyQuery(...args), "journey", {
        visitorId: args[1],
        asOf: args[2],
      }),
    liveQuery: (...args: Parameters<typeof queries.liveQuery>) =>
      scope(queries.liveQuery(...args), "live", { ...args[1] }),
    funnelsQuery: (...args: Parameters<typeof queries.funnelsQuery>) =>
      scope(queries.funnelsQuery(...args), "funnels", { ...args[1] }),
    revenueQuery: (...args: Parameters<typeof queries.revenueQuery>) =>
      scope(queries.revenueQuery(...args), "revenue", { ...args[1] }),
    conversionsQuery: (...args: Parameters<typeof queries.conversionsQuery>) =>
      scope(queries.conversionsQuery(...args), "conversions", { ...args[1] }),
  };
}

export function useReportQueries() {
  return createReportQueries(usePublicDashboard());
}
