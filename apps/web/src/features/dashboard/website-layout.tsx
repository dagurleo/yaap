import { ReportLink, usePublicDashboard } from "./public-context";
import type { SafeSite } from "@/server/access";
import { TimezoneSelect } from "./timezone-select";
import {
  BoardSkeleton,
  OverviewHeaderSkeleton,
  boardTitles,
  type Board,
} from "./board-skeleton";
import { useState, type FormEvent, type ReactNode } from "react";
import {
  Link,
  useRouter,
  useSearch,
  useRouterState,
  useRouteContext,
} from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, X, Settings, Check } from "lucide-react";
import { GraphiteIcon } from "@/components/graphite-icon";
import { WorkspaceTools, WorkspaceHelp } from "./workspace-tools";
import { WebsiteFavicon } from "./website-favicon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { SiteTabs } from "./site-tabs";
import { HeaderAccount } from "@/components/account-menu";
import { reportFilters } from "@/lib/report-filters";
import { sitesQuery } from "./queries";
import { addSiteFn } from "./functions";
type WebsiteLayoutProps = {
  children: ReactNode;
  title?: string;
  selectedSiteId?: string;
  hideHeading?: boolean;
  footer?: ReactNode;
  headerTabs?: ReactNode;
  headerActions?: ReactNode;
};

function WebsiteLayoutContent({
  sites,
  canAddSite = false,
  children,
  title,
  selectedSiteId,
  hideHeading = false,
  footer,
  headerTabs,
  headerActions,
}: WebsiteLayoutProps & { sites: SafeSite[]; canAddSite?: boolean }) {
  const shared = usePublicDashboard();
  selectedSiteId = shared?.site.id ?? selectedSiteId;
  const destination = useRouterState({
    select: (state) =>
      state.isLoading && state.location.href !== state.resolvedLocation?.href
        ? state.location.pathname
        : undefined,
  });
  const destinationParts = destination?.split("/");
  const pendingBoard: Board | undefined =
    (destinationParts?.[1] === "app" ||
      (shared && destinationParts?.[1] === "share")) &&
    destinationParts[2] &&
    destinationParts[2] !== "access"
      ? Object.hasOwn(boardTitles, destinationParts[3] ?? "")
        ? (destinationParts[3] as Board)
        : "overview"
      : undefined;
  if (pendingBoard) {
    selectedSiteId =
      shared?.site.id ?? decodeURIComponent(destinationParts![2]);
    title = boardTitles[pendingBoard];
    hideHeading = pendingBoard === "overview";
    headerTabs =
      pendingBoard === "overview" ? <OverviewHeaderSkeleton /> : undefined;
    headerActions = undefined;
    footer = undefined;
  }
  const search = useSearch({ strict: false });
  const [menuOpen, setMenuOpen] = useState(false);
  const client = useQueryClient();
  const router = useRouter();
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);
  const [timezone, setTimezone] = useState("UTC");
  const selected = sites.find((site) => site.id === selectedSiteId);
  const ownedSites = sites.filter(
    (site) => site.access === "owner" || site.access === "public",
  );
  const sharedSites = sites.filter((site) => site.access === "viewer");
  const mutation = useMutation({
    mutationFn: (data: { name: string; origin: string }) => addSiteFn({ data }),
  });
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const data = Object.fromEntries(new FormData(event.currentTarget)) as {
      name: string;
      origin: string;
    };
    try {
      const site = await mutation.mutateAsync(data);
      await client.invalidateQueries({ queryKey: ["sites"] });
      setOpen(false);
      await router.navigate({
        to: "/app/$siteId/setup",
        params: { siteId: site.id },
      });
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Could not add website",
      );
    }
  }
  const sitePicker = (
    <div className="website-context-control">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            className="website-switcher min-w-0 flex-1 justify-start"
            aria-label="Choose website"
            size="sm"
          >
            {selected && <WebsiteFavicon origin={selected.origin} />}
            <span className="website-context-name" title={selected?.name}>
              {selected
                ? selected.origin.replace(/^https?:\/\//, "")
                : "Your websites"}
            </span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          side="bottom"
          sideOffset={8}
          className="website-switcher-menu w-64"
        >
          <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
            {shared ? "Shared website" : "Your websites"}
          </DropdownMenuLabel>
          {ownedSites.length ? (
            ownedSites.map((site) => (
              <DropdownMenuItem key={site.id} asChild>
                <ReportLink
                  to="/app/$siteId/overview"
                  params={{ siteId: site.id }}
                  search={{ days: 7 }}
                  aria-current={site.id === selectedSiteId ? "page" : undefined}
                  className="min-w-0"
                >
                  <WebsiteFavicon origin={site.origin} />
                  <span className="min-w-0 flex-1 truncate">{site.name}</span>
                  {site.id === selectedSiteId && <Check aria-hidden="true" />}
                </ReportLink>
              </DropdownMenuItem>
            ))
          ) : (
            <DropdownMenuItem disabled>No websites yet</DropdownMenuItem>
          )}
          {sharedSites.length > 0 && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
                Shared with you
              </DropdownMenuLabel>
              {sharedSites.map((site) => (
                <DropdownMenuItem key={site.id} asChild>
                  <Link
                    to="/app/$siteId/overview"
                    params={{ siteId: site.id }}
                    search={{ days: 7 }}
                    aria-current={
                      site.id === selectedSiteId ? "page" : undefined
                    }
                    className="min-w-0"
                  >
                    <WebsiteFavicon origin={site.origin} />
                    <span className="min-w-0 flex-1 truncate">{site.name}</span>
                    <span className="website-viewer-badge">Viewer</span>
                    {site.id === selectedSiteId && <Check aria-hidden="true" />}
                  </Link>
                </DropdownMenuItem>
              ))}
            </>
          )}
          {!shared && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link to="/app">All websites</Link>
              </DropdownMenuItem>
            </>
          )}
          {canAddSite && (
            <DropdownMenuItem
              className="text-muted-foreground"
              onSelect={() => {
                setTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone);
                setOpen(true);
              }}
            >
              <span className="website-menu-icon">
                <Plus aria-hidden="true" />
              </span>{" "}
              Add website
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      {selected?.capabilities.manageSite && (
        <Link
          to="/app/$siteId/settings"
          params={{ siteId: selected.id }}
          className="website-context-settings"
          aria-label={`Settings for ${selected.name}`}
          title="Website settings"
        >
          <Settings aria-hidden="true" />
        </Link>
      )}
    </div>
  );
  return (
    <section className={selectedSiteId ? "dashboard-shell" : "space-y-5"}>
      {selectedSiteId && (
        <header className="dashboard-mobile-header">
          <Link
            to={shared ? "/" : "/app"}
            className="font-semibold tracking-tight"
          >
            <img
              className="dashboard-logo dashboard-logo-light"
              src="/brand/logo-light.svg"
              alt="Yaap"
              width="209"
              height="64"
            />
            <img
              className="dashboard-logo dashboard-logo-dark"
              src="/brand/logo-dark.svg"
              alt="Yaap"
              width="209"
              height="64"
            />
          </Link>
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              aria-expanded={menuOpen}
              aria-controls="dashboard-sidebar"
              onClick={() => setMenuOpen(!menuOpen)}
            >
              {menuOpen ? <X /> : <GraphiteIcon name="menu" />}{" "}
              {menuOpen ? "Close" : "Menu"}
            </Button>
            {shared ? (
              <Button asChild size="sm">
                <Link to="/">Get started</Link>
              </Button>
            ) : (
              <HeaderAccount />
            )}
          </div>
        </header>
      )}
      <aside
        id="dashboard-sidebar"
        className={selectedSiteId ? "dashboard-sidebar" : "sites-home-header"}
        data-open={menuOpen}
      >
        {selectedSiteId && (
          <Link to={shared ? "/" : "/app"} className="dashboard-brand">
            <img
              className="dashboard-logo dashboard-logo-light"
              src="/brand/logo-light.svg"
              alt="Yaap"
              width="209"
              height="64"
            />
            <img
              className="dashboard-logo dashboard-logo-dark"
              src="/brand/logo-dark.svg"
              alt="Yaap"
              width="209"
              height="64"
            />
          </Link>
        )}
        {!selectedSiteId && (
          <div>
            <h1>Websites</h1>
            <p>Choose one of your websites or a website shared with you.</p>
          </div>
        )}
        <div
          className={
            selectedSiteId
              ? "sidebar-site-controls"
              : "flex min-w-0 items-center gap-2"
          }
        >
          {selectedSiteId && sitePicker}
          {!shared && (
            <Dialog
              open={open}
              onOpenChange={(value) => {
                if (value)
                  setTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone);
                setOpen(value);
              }}
            >
              {!selectedSiteId && canAddSite && (
                <DialogTrigger asChild>
                  <Button aria-label="Add website" variant="primary">
                    <Plus aria-hidden="true" /> Add website
                  </Button>
                </DialogTrigger>
              )}
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Add a website</DialogTitle>
                  <DialogDescription className="sr-only">
                    Install one snippet to start collecting traffic.
                  </DialogDescription>
                </DialogHeader>
                <form onSubmit={submit}>
                  <Label>
                    Website name
                    <Input
                      name="name"
                      placeholder="My website"
                      maxLength={120}
                      required
                    />
                  </Label>
                  <Label>
                    Website origin
                    <Input
                      name="origin"
                      type="url"
                      placeholder="https://example.com"
                      required
                    />
                    <small>Include the protocol. Leave out paths.</small>
                  </Label>
                  <TimezoneSelect value={timezone} onChange={setTimezone} />
                  <Button
                    type="submit"
                    variant="primary"
                    disabled={mutation.isPending}
                  >
                    {mutation.isPending ? "Adding…" : "Add website"}
                  </Button>
                  {error && (
                    <p className="text-destructive" role="alert">
                      {error}
                    </p>
                  )}
                </form>
              </DialogContent>
            </Dialog>
          )}
        </div>
        {selectedSiteId && (
          <SiteTabs
            siteId={selectedSiteId}
            filters={reportFilters(search)}
            canManage={selected?.capabilities.manageSite ?? false}
            onNavigate={() => setMenuOpen(false)}
          />
        )}
        {selectedSiteId && (
          <div className="dashboard-account">
            <WorkspaceHelp siteId={selectedSiteId} label />
          </div>
        )}
      </aside>
      <div className={selectedSiteId ? "dashboard-scroll-area" : undefined}>
        <div className={selectedSiteId ? "dashboard-workspace" : undefined}>
          {selectedSiteId && (
            <WorkspaceTools
              tabs={
                headerTabs ??
                (!hideHeading ? (
                  <h1 className="workspace-page-title">
                    {title ?? "Events & installation"}
                  </h1>
                ) : undefined)
              }
              actions={headerActions}
              sites={sites}
              siteId={selectedSiteId}
              filters={reportFilters(search)}
              canManage={selected?.capabilities.manageSite ?? false}
            />
          )}
          <div className={selectedSiteId ? "dashboard-content" : undefined}>
            {selectedSiteId && hideHeading && (
              <h1 className="sr-only">{title}</h1>
            )}
            {pendingBoard ? <BoardSkeleton board={pendingBoard} /> : children}
            {selectedSiteId && (
              <footer className="dashboard-footer">{footer}</footer>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function AuthenticatedWebsiteLayout(props: WebsiteLayoutProps) {
  const { access } = useRouteContext({ from: "/_app" });
  const { data: sites = [] } = useQuery(sitesQuery());
  // The pending shell renders before the auth guard supplies access.
  return (
    <WebsiteLayoutContent
      {...props}
      sites={sites}
      canAddSite={access?.user?.ownsAccount ?? false}
    />
  );
}

export function WebsiteLayout(props: WebsiteLayoutProps) {
  const shared = usePublicDashboard();
  return shared ? (
    <WebsiteLayoutContent {...props} sites={[shared.site]} />
  ) : (
    <AuthenticatedWebsiteLayout {...props} />
  );
}
