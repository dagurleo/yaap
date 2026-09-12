import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { eventsQuery, sitesQuery } from "@/features/dashboard/queries";
import { Installation } from "@/features/dashboard/site-settings";
import { WebsiteLayout } from "@/features/dashboard/website-layout";

export const Route = createFileRoute("/_app/app/$siteId/setup")({
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(sitesQuery());
  },
  component: Setup,
});

function Setup() {
  const { siteId } = Route.useParams();
  const { access } = Route.useRouteContext();
  return (
    <WebsiteSetup key={siteId} siteId={siteId} appOrigin={access.origin} />
  );
}

function WebsiteSetup({
  siteId,
  appOrigin,
}: {
  siteId: string;
  appOrigin: string;
}) {
  const status = useQuery({
    ...eventsQuery(siteId),
    refetchInterval: (query) => (query.state.data?.total ? false : 5000),
    retry: false,
  });
  const connected = (status.data?.total ?? 0) > 0;
  return (
    <WebsiteLayout selectedSiteId={siteId} title="Website setup">
      <div className="site-settings grid max-w-3xl gap-6 text-base sm:text-sm">
        <header className="grid gap-2">
          <h2 className="text-balance text-2xl font-semibold tracking-tight">
            Connect your website
          </h2>
          <p className="text-pretty text-muted-foreground">
            Install tracking, then visit your website to send your first event.
          </p>
        </header>
        <section
          className="grid gap-4 rounded-xl border border-border/70 p-5"
          aria-label="Connection status"
        >
          <div
            role="status"
            aria-live="polite"
            aria-atomic="true"
            className="grid gap-2"
          >
            <h3 className="flex items-center gap-2 font-medium">
              <span
                aria-hidden="true"
                className={`size-2 shrink-0 rounded-full ${connected ? "bg-emerald-500" : "bg-muted-foreground"}`}
              />
              {connected
                ? "First event received"
                : status.isError
                  ? "Couldn’t check for events"
                  : status.isPending
                    ? "Checking for events…"
                    : "Waiting for first event"}
            </h3>
            <p className="text-pretty text-muted-foreground">
              {connected
                ? "Tracking is working. Your website’s activity is ready to explore."
                : status.isError
                  ? "We couldn’t reach your event history. Try again to check the connection."
                  : "After installing, open your website in a new tab. We’ll check automatically every few seconds; events may take a moment to appear."}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {connected ? (
              <Button asChild variant="primary">
                <Link
                  to="/app/$siteId/overview"
                  params={{ siteId }}
                  search={{ days: 7 }}
                >
                  Open dashboard
                </Link>
              </Button>
            ) : (
              <>
                {status.data?.site.origin && (
                  <Button asChild variant="primary">
                    <a
                      href={status.data.site.origin}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Visit website ↗
                    </a>
                  </Button>
                )}
                <Button
                  disabled={status.isFetching}
                  onClick={() => void status.refetch()}
                >
                  {status.isFetching ? "Checking…" : "Check again"}
                </Button>
              </>
            )}
          </div>
        </section>
        <Installation siteId={siteId} appOrigin={appOrigin} compact />
        {!connected && (
          <details className="border-t border-border/70 pt-4">
            <summary className="cursor-pointer py-2 font-medium">
              Still waiting?
            </summary>
            <ul className="list-disc space-y-2 pl-5 text-muted-foreground">
              <li>
                Publish the snippet and reload a page on your registered
                website.
              </li>
              <li>
                Try a browser without an ad blocker, and check your domain and
                exclusion settings.
              </li>
              <li>
                If you chose “Wait for consent”, grant consent through your
                banner to start tracking.
              </li>
            </ul>
          </details>
        )}
        <div className="flex flex-wrap gap-4">
          {!connected && (
            <Link
              to="/app/$siteId/overview"
              params={{ siteId }}
              search={{ days: 7 }}
              className="text-muted-foreground underline underline-offset-4"
            >
              Skip for now
            </Link>
          )}
          <Link
            to="/app/$siteId/settings"
            params={{ siteId }}
            search={{ section: "installation" }}
            className="text-muted-foreground underline underline-offset-4"
          >
            All installation options
          </Link>
        </div>
        {!connected && (
          <p className="text-muted-foreground">
            You can return from Settings → Installation → Check installation.
          </p>
        )}
      </div>
    </WebsiteLayout>
  );
}
