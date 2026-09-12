import { dashboardPending } from "@/features/dashboard/dashboard-pending";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { reportFilters } from "@/lib/report-filters";

export const Route = createFileRoute("/_app/app/$siteId/")({
  ...dashboardPending,
  validateSearch: reportFilters,
  beforeLoad: ({ params, search }) => {
    throw redirect({
      to: "/app/$siteId/overview",
      params,
      search,
      replace: true,
    });
  },
});
