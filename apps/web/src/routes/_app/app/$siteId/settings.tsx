import { publicSharingFn } from "@/features/dashboard/public-functions";
import { dashboardPending } from "@/features/dashboard/dashboard-pending";
import { createFileRoute } from "@tanstack/react-router";
import {
  operationsQuery,
  peopleQuery,
  sitesQuery,
} from "@/features/dashboard/queries";
import {
  SiteSettings,
  settingsSections,
  type SettingsSection,
} from "@/features/dashboard/site-settings";

export const Route = createFileRoute("/_app/app/$siteId/settings")({
  ...dashboardPending,
  validateSearch: (
    search: Record<string, unknown>,
  ): { section?: SettingsSection } => ({
    section: settingsSections.some((item) => item.id === search.section)
      ? (search.section as SettingsSection)
      : "general",
  }),
  loaderDeps: ({ search }) => ({ section: search.section }),
  loader: async ({ context, params, deps }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(sitesQuery()),
      context.queryClient.ensureQueryData(operationsQuery(params.siteId)),
      deps.section === "sharing"
        ? context.queryClient.ensureQueryData({
            queryKey: ["sites", params.siteId, "public-sharing"],
            queryFn: () => publicSharingFn({ data: { siteId: params.siteId } }),
          })
        : Promise.resolve(),
      deps.section === "people"
        ? context.queryClient.ensureQueryData(peopleQuery(params.siteId))
        : Promise.resolve(),
    ]);
  },
  component: Settings,
});
function Settings() {
  const { siteId } = Route.useParams();
  const { section } = Route.useSearch();
  const { access } = Route.useRouteContext();
  return (
    <SiteSettings
      key={siteId}
      siteId={siteId}
      section={section ?? "general"}
      appOrigin={access.origin}
    />
  );
}
