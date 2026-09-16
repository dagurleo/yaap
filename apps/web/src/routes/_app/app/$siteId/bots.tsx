import { createFileRoute } from "@tanstack/react-router";
import { dashboardPending } from "@/features/dashboard/dashboard-pending";
import { WebsiteLayout } from "@/features/dashboard/website-layout";
import { BotTraffic } from "@/features/dashboard/bot-traffic";
import { botTrafficQuery, sitesQuery } from "@/features/dashboard/queries";
import { botFilters } from "@/lib/bot-traffic";

export const Route = createFileRoute("/_app/app/$siteId/bots")({
  ...dashboardPending,
  validateSearch: botFilters,
  loaderDeps: ({ search }) => search,
  loader: async ({ context, params, deps }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(sitesQuery()),
      context.queryClient.ensureQueryData(botTrafficQuery(params.siteId, deps)),
    ]);
  },
  component: Bots,
});
function Bots() {
  const { siteId } = Route.useParams();
  const filters = Route.useSearch();
  const navigate = Route.useNavigate();
  const { access } = Route.useRouteContext();
  return (
    <WebsiteLayout selectedSiteId={siteId} title="Bot traffic">
      <BotTraffic
        key={siteId}
        siteId={siteId}
        filters={filters}
        onChange={(search) => void navigate({ search })}
        installationOrigin={access.origin}
      />
    </WebsiteLayout>
  );
}
