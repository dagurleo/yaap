import { useRouterState } from "@tanstack/react-router";
import { Skeleton } from "@/components/ui/skeleton";
import { WebsiteLayout } from "./website-layout";

import {
  BoardSkeleton,
  OverviewHeaderSkeleton,
  boardTitles,
  type Board,
} from "./board-skeleton";

export function DashboardPending() {
  // Read the destination, including while the parent auth guard is pending.
  // A pending component must not depend on its route's loader data.
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  const [, , encodedSiteId, page] = pathname.split("/");
  const board: Board =
    page && Object.hasOwn(boardTitles, page) ? (page as Board) : "overview";
  const siteId =
    encodedSiteId && !["access", "billing"].includes(encodedSiteId)
      ? decodeURIComponent(encodedSiteId)
      : undefined;
  return (
    <WebsiteLayout
      selectedSiteId={siteId}
      title={boardTitles[board]}
      hideHeading={!!siteId && board === "overview"}
      headerTabs={
        siteId && board === "overview" ? <OverviewHeaderSkeleton /> : undefined
      }
    >
      {siteId ? (
        <BoardSkeleton board={board} />
      ) : (
        <section
          aria-label="Loading websites"
          aria-busy="true"
          className="space-y-5"
        >
          <p role="status" className="sr-only">
            Loading websites…
          </p>
          <div className="sites-home-toolbar" aria-hidden="true">
            <Skeleton className="h-10 w-80 max-w-full" />
            <Skeleton className="h-3 w-20" />
          </div>
          <div className="sites-home-grid" aria-hidden="true">
            {[0, 1, 2].map((card) => (
              <div key={card} className="sites-home-card">
                <div className="sites-home-site">
                  <div className="sites-home-card-header">
                    <Skeleton className="size-6 shrink-0" />
                    <div className="space-y-3">
                      <Skeleton className="h-4 w-32" />
                      <Skeleton className="h-3 w-44 max-w-full" />
                    </div>
                  </div>
                  <div className="sites-home-activity">
                    <div className="space-y-2">
                      <Skeleton className="h-3 w-16" />
                      <Skeleton className="h-5 w-24" />
                      <Skeleton className="h-3 w-20" />
                    </div>
                    <Skeleton className="h-10 w-28" />
                  </div>
                </div>
                <div className="sites-home-card-footer">
                  <Skeleton className="h-3 w-24" />
                  <Skeleton className="h-3 w-14" />
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </WebsiteLayout>
  );
}

export const dashboardPending = {
  pendingComponent: DashboardPending,
  pendingMs: 0,
  pendingMinMs: 150,
};
