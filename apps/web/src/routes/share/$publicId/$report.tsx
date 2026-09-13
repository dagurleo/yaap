import type { VisitorFilters } from "@/server/visitors";
import { createReportQueries } from "@/features/dashboard/report-queries";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Suspense, type ComponentProps } from "react";
import { publicSiteFn } from "@/features/dashboard/public-functions";
import { PublicDashboardContext } from "@/features/dashboard/public-context";
import { OverviewReport } from "@/routes/_app/app/$siteId/overview";
import { VisitorsReport } from "@/routes/_app/app/$siteId/visitors";
import { FunnelsReport } from "@/routes/_app/app/$siteId/funnels";
import { RevenueReport } from "@/routes/_app/app/$siteId/revenue";
import { EventsReport } from "@/routes/_app/app/$siteId/events";
import { WebsiteLayout } from "@/features/dashboard/website-layout";
import { overviewSearch, conversionFilters } from "@/lib/conversion-filters";
import { eventFilters } from "@/lib/event-filters";
import { revenueFilters } from "@/lib/revenue-filters";
import { reportFilters } from "@/lib/report-filters";
export const Route = createFileRoute("/share/$publicId/$report")({
  validateSearch: (
    search: Record<string, unknown>,
  ): Record<string, unknown> & ReturnType<typeof reportFilters> => ({
    ...search,
    ...reportFilters(search),
  }),
  loaderDeps: ({ search }) => search,
  loader: async ({ params, context, deps }) => {
    const shared = await publicSiteFn({ data: { publicId: params.publicId } });
    const queries = createReportQueries(shared);
    const siteId = shared.site.id;
    // Resolve report reads within the request database scope, before streaming SSR.
    switch (params.report) {
      case "overview":
        await context.queryClient.fetchQuery(
          queries.overviewQuery(siteId, overviewSearch(deps)),
        );
        if (shared.site.capabilities.visitors)
          await context.queryClient.fetchQuery(
            queries.liveQuery(siteId, reportFilters({})),
          );
        if (deps.view === "conversions" && shared.site.capabilities.conversions)
          await context.queryClient.fetchQuery(
            queries.conversionsQuery(
              siteId,
              conversionFilters({
                ...overviewSearch(deps),
                goalId: deps.goalId ?? "",
                dimension: "source",
                sort: "sessions",
                direction: "desc",
                page: 0,
              }),
            ),
          );
        break;
      case "events":
        if (shared.site.capabilities.events)
          await context.queryClient.fetchQuery(
            queries.eventExplorerQuery(siteId, eventFilters(deps)),
          );
        break;
      case "visitors":
        if (shared.site.capabilities.visitors)
          await context.queryClient.fetchQuery(
            queries.visitorsQuery(siteId, visitorSearch(deps)),
          );
        break;
      case "revenue":
        if (shared.site.capabilities.revenue)
          await context.queryClient.fetchQuery(
            queries.revenueQuery(siteId, revenueFilters(deps)),
          );
        break;
      case "funnels":
        if (shared.site.capabilities.conversions)
          await context.queryClient.fetchQuery(
            queries.funnelsQuery(siteId, funnelSearch(deps)),
          );
        break;
    }
    return shared;
  },
  staleTime: 0,
  head: () => ({
    meta: [
      { name: "robots", content: "noindex, nofollow" },
      { title: "Public dashboard · Yaap" },
    ],
  }),
  errorComponent: () => (
    <section className="mx-auto max-w-lg py-20">
      <h1 className="text-2xl font-semibold">Public dashboard unavailable</h1>
      <p className="mt-3 text-muted-foreground">
        This link may have been disabled or the report is no longer shared.
      </p>
      <Link to="/" className="mt-6 inline-block underline">
        Back to Yaap
      </Link>
    </section>
  ),
  component: PublicDashboard,
});
function PublicDashboard() {
  const shared = Route.useLoaderData();
  const { report } = Route.useParams();
  const search = Route.useSearch();
  const routeNavigate = Route.useNavigate();
  const siteId = shared.site.id;
  const navigate: ComponentProps<typeof OverviewReport>["navigate"] = (
    options,
  ) => {
    const destination =
      typeof options.to === "string"
        ? (options.to.split("/").at(-1) ?? report)
        : report;
    return routeNavigate({
      to: "/share/$publicId/$report",
      params: { publicId: shared.publicId, report: destination },
      search: options.search as unknown as typeof search,
    });
  };
  const allowed =
    report === "overview" ||
    (report === "funnels"
      ? shared.site.capabilities.conversions
      : ["events", "visitors", "revenue"].includes(report) &&
        shared.site.capabilities[report as "events" | "visitors" | "revenue"]);
  const content = !allowed ? (
    <WebsiteLayout title="Report unavailable">
      <p>This report is not shared by the website owner.</p>
    </WebsiteLayout>
  ) : report === "overview" ? (
    <OverviewReport
      siteId={siteId}
      filters={overviewSearch(search)}
      navigate={navigate}
    />
  ) : report === "funnels" ? (
    <FunnelsReport
      siteId={siteId}
      filters={funnelSearch(search)}
      navigate={navigate as ComponentProps<typeof FunnelsReport>["navigate"]}
    />
  ) : report === "revenue" ? (
    <RevenueReport
      siteId={siteId}
      filters={revenueFilters(search)}
      navigate={navigate as ComponentProps<typeof RevenueReport>["navigate"]}
    />
  ) : report === "visitors" ? (
    <VisitorsReport
      siteId={siteId}
      filters={visitorSearch(search)}
      navigate={navigate as ComponentProps<typeof VisitorsReport>["navigate"]}
    />
  ) : (
    <EventsReport
      siteId={siteId}
      filters={eventFilters(search)}
      onChange={(next) => void routeNavigate({ search: next })}
    />
  );
  return (
    <PublicDashboardContext value={shared}>
      <Suspense
        fallback={
          <p role="status" className="p-8">
            Loading report…
          </p>
        }
      >
        {content}
      </Suspense>
    </PublicDashboardContext>
  );
}

function visitorSearch(search: Record<string, unknown>): VisitorFilters {
  return {
    ...reportFilters(search),
    cohort:
      search.cohort === "new" || search.cohort === "returning"
        ? search.cohort
        : ("all" as const),
    goalId: typeof search.goalId === "string" ? search.goalId : "",
    page: Number(search.page ?? 0),
  };
}
function funnelSearch(search: Record<string, unknown>) {
  return {
    ...reportFilters(search),
    funnelId: typeof search.funnelId === "string" ? search.funnelId : undefined,
  };
}
