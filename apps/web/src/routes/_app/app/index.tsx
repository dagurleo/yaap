import { dashboardPending } from "@/features/dashboard/dashboard-pending";
import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { ArrowUpRight, Globe2, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { sitesQuery } from "@/features/dashboard/queries";
import { WebsiteLayout } from "@/features/dashboard/website-layout";
import type { SafeSite } from "@/server/access";

export const Route = createFileRoute("/_app/app/")({
  ...dashboardPending,
  loader: ({ context }) => context.queryClient.ensureQueryData(sitesQuery()),
  head: () => ({ meta: [{ title: "Your websites · Yaap" }] }),
  component: SitesHome,
});

function SitesHome() {
  const { data: sites } = useSuspenseQuery(sitesQuery());
  const { access } = Route.useRouteContext();
  const [query, setQuery] = useState("");
  const normalized = query.trim().toLowerCase();
  const visible = sites.filter((site) =>
    `${site.name} ${site.origin}`.toLowerCase().includes(normalized),
  );
  const owned = visible.filter((site) => site.access === "owner");
  const shared = visible.filter((site) => site.access === "viewer");
  return (
    <WebsiteLayout>
      {access.user?.ownsAccount && (
        <nav aria-label="Account settings" className="flex gap-4 text-sm">
          <Link to="/app/billing" className="underline">
            Billing
          </Link>
          <Link to="/app/access" className="underline">
            API & MCP access
          </Link>
        </nav>
      )}
      {sites.length > 0 ? (
        <>
          <div className="sites-home-toolbar">
            <div className="sites-home-search">
              <Search aria-hidden="true" size={16} />
              <Input
                aria-label="Search websites"
                placeholder="Search by name or domain…"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </div>
            <p role="status">
              {visible.length} {visible.length === 1 ? "website" : "websites"}
              {normalized ? ` of ${sites.length}` : ""}
            </p>
          </div>
          {visible.length ? (
            <div className="sites-home-groups">
              {owned.length > 0 && (
                <section className="sites-home-group">
                  <h2>Your websites</h2>
                  <ul className="sites-home-grid" role="list">
                    {owned.map((site) => (
                      <SiteCard key={site.id} site={site} />
                    ))}
                  </ul>
                </section>
              )}
              {shared.length > 0 && (
                <section className="sites-home-group">
                  <div className="sites-home-group-heading">
                    <h2>Shared with you</h2>
                    <p>Read-only website analytics.</p>
                  </div>
                  <ul className="sites-home-grid" role="list">
                    {shared.map((site) => (
                      <SiteCard key={site.id} site={site} />
                    ))}
                  </ul>
                </section>
              )}
            </div>
          ) : (
            <div className="sites-home-empty">
              <h2>No websites match your search.</h2>
              <p>Try another name or domain.</p>
              <button
                className="graphite-textbutton"
                onClick={() => setQuery("")}
              >
                Clear search
              </button>
            </div>
          )}
        </>
      ) : (
        <div className="sites-home-empty">
          <Globe2 aria-hidden="true" size={28} />
          <h2>
            {access.user?.ownsAccount
              ? "Add your first website"
              : "No websites shared with you"}
          </h2>
          <p>
            {access.user?.ownsAccount
              ? "Use “Add website” above, then install its tracking snippet to start collecting traffic."
              : "When an account owner shares a website, it will appear here."}
          </p>
        </div>
      )}
    </WebsiteLayout>
  );
}

function SiteCard({ site }: { site: SafeSite }) {
  return (
    <li className="sites-home-card">
      <Link
        className="sites-home-site"
        to="/app/$siteId/overview"
        params={{ siteId: site.id }}
        search={{ days: 7 }}
        aria-label={`Open ${site.name} analytics`}
      >
        <Globe2 className="sites-home-icon" aria-hidden="true" size={24} />
        <div>
          <div className="sites-home-card-title">
            <h2>{site.name}</h2>
            {site.access === "viewer" && (
              <span className="website-viewer-badge">Viewer</span>
            )}
          </div>
          <p>{site.origin.replace(/^https?:\/\//, "")}</p>
        </div>
        <ArrowUpRight
          className="sites-home-arrow"
          aria-hidden="true"
          size={16}
        />
      </Link>
      <div className="sites-home-card-footer">
        <Link
          to="/app/$siteId/events"
          search={{ days: 7 }}
          params={{ siteId: site.id }}
        >
          {site.access === "owner" ? "Tracking & events" : "View events"}
        </Link>
        {site.capabilities.manageSite && (
          <Link
            to="/app/$siteId/settings"
            params={{ siteId: site.id }}
            aria-label={`Settings for ${site.name}`}
          >
            Settings
          </Link>
        )}
      </div>
    </li>
  );
}
