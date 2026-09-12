import { dashboardPending } from "@/features/dashboard/dashboard-pending";
import { Button } from "@/components/ui/button";
import {
  createFileRoute,
  Link,
  stripSearchParams,
} from "@tanstack/react-router";
import { useState } from "react";
import { eventExplorerQuery, sitesQuery } from "@/features/dashboard/queries";
import { EventExplorer } from "@/features/dashboard/event-explorer";
import { WebsiteLayout } from "@/features/dashboard/website-layout";
import { eventFilters } from "@/lib/event-filters";

export const Route = createFileRoute("/_app/app/$siteId/events")({
  ...dashboardPending,
  validateSearch: eventFilters,
  search: { middlewares: [stripSearchParams({ days: 7 })] },
  loaderDeps: ({ search }) => search,
  loader: async ({ context, params, deps }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(sitesQuery()),
      context.queryClient.ensureQueryData(
        eventExplorerQuery(params.siteId, deps),
      ),
    ]);
  },
  component: Events,
});
function Events() {
  const { siteId } = Route.useParams();
  const filters = Route.useSearch();
  const navigate = Route.useNavigate();
  const { access } = Route.useRouteContext();
  const [message, setMessage] = useState("");
  const snippet = `<script defer src="${access.origin}/script.js" data-site-id="${siteId}"></script>`;
  return (
    <WebsiteLayout selectedSiteId={siteId}>
      <EventExplorer
        siteId={siteId}
        filters={filters}
        onChange={(next) => void navigate({ search: next })}
      />
      <details className="min-w-0 border-t border-border/70 pt-4 text-base sm:text-sm">
        <summary className="cursor-pointer py-2 font-medium">
          Installation & tracking API
        </summary>
        <div className="space-y-3 py-3">
          <p>Add this snippet to your website’s head.</p>
          <pre className="overflow-x-auto">{snippet}</pre>
          <Button
            size="sm"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(snippet);
                setMessage("Snippet copied.");
              } catch {
                setMessage("Select and copy the snippet above.");
              }
            }}
          >
            Copy snippet
          </Button>
          {message && <p role="status">{message}</p>}
          <pre className="overflow-x-auto">
            {'window.osAnalytics?.track("signup", { plan: "pro", seats: 3 });'}
          </pre>
          <p className="text-muted-foreground">
            Send up to 20 text, number, or boolean properties. Use non-sensitive
            categories such as plan or button location.
          </p>
          <Link
            className="underline"
            to="/app/$siteId/settings"
            params={{ siteId }}
            search={{ section: "installation" }}
          >
            Installation options and collection controls
          </Link>
        </div>
      </details>
    </WebsiteLayout>
  );
}
