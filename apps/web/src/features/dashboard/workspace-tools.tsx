import { useEffect, useState, type ReactNode } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { GraphiteIcon } from "@/components/graphite-icon";
import { HeaderAccount } from "@/components/account-menu";
import {
  ChartNoAxesCombined,
  Users,
  Filter,
  CircleDollarSign,
  Zap,
  Settings2,
  Globe,
} from "lucide-react";
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandSeparator,
  CommandItem,
} from "@/components/ui/command";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from "@/components/ui/dialog";
import type { ReportFilters } from "@/lib/report-filters";

export function WorkspaceHelp({
  siteId,
  label = false,
}: {
  siteId: string;
  label?: boolean;
}) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          type="button"
          className={label ? "workspace-help" : "workspace-icon-button"}
          aria-label="Help & documentation"
        >
          <GraphiteIcon name="help" />
          {label && "Help & documentation"}
        </button>
      </DialogTrigger>
      <DialogContent>
        <DialogTitle>Help & documentation</DialogTitle>
        <DialogDescription>
          Everything you need to understand your website’s traffic.
        </DialogDescription>
        <div className="space-y-4 text-sm">
          <p>
            Choose a date range in your website’s reporting timezone, compare
            the previous period, or click a source or page to filter your
            reports. Anonymous visits count toward pageviews; visitor and
            session reports require enabled identifiers.
          </p>
          <p>
            Open Events for your tracking snippet and recent activity. Settings
            controls bot filtering, retention and ingestion health.
          </p>
          <Link
            className="underline"
            to="/app/$siteId/events"
            search={{ days: 7 }}
            params={{ siteId }}
          >
            Installation & events
          </Link>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function WorkspaceTools({
  tabs,
  actions,
  sites,
  siteId,
  filters,
}: {
  tabs?: ReactNode;
  actions?: ReactNode;
  sites: { id: string; name: string; origin: string }[];
  siteId: string;
  filters: ReportFilters;
}) {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((value) => !value);
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);
  const pages = [
    {
      label: "Overview",
      icon: ChartNoAxesCombined,
      to: "/app/$siteId/overview",
    },
    { label: "Visitors", icon: Users, to: "/app/$siteId/visitors" },
    { label: "Funnels", icon: Filter, to: "/app/$siteId/funnels" },
    { label: "Revenue", icon: CircleDollarSign, to: "/app/$siteId/revenue" },
    { label: "Events & installation", icon: Zap, to: "/app/$siteId/events" },
    { label: "Settings", icon: Settings2, to: "/app/$siteId/settings" },
  ] as const;
  return (
    <header
      className={`workspace-topbar${tabs ? " workspace-topbar-with-tabs" : ""}`}
    >
      <div className="workspace-topbar-inner">
        {tabs}
        <div className="workspace-top-right">
          {actions}
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <button
                type="button"
                className="workspace-icon-button"
                aria-label="Search your workspace"
                title="Search (⌘K / Ctrl+K)"
              >
                <GraphiteIcon name="search" />
              </button>
            </DialogTrigger>
            <DialogContent className="gap-0 overflow-hidden rounded-xl p-0 data-[state=open]:animate-none data-[state=closed]:animate-none [&_[data-slot=dialog-close]]:top-5">
              <DialogTitle className="sr-only">
                Search your workspace
              </DialogTitle>
              <DialogDescription className="sr-only">
                Find a website or report.
              </DialogDescription>
              <Command loop>
                <CommandInput
                  aria-label="Search websites and reports"
                  placeholder="Search websites and reports…"
                />
                <CommandList>
                  <CommandEmpty>No matching websites or reports.</CommandEmpty>
                  <CommandGroup heading="Reports">
                    {pages.map((page) => (
                      <CommandItem
                        key={page.to}
                        value={page.label}
                        onSelect={() => {
                          setOpen(false);
                          void navigate({
                            to: page.to,
                            params: { siteId },
                            search: {
                              ...filters,
                              cohort: "all",
                              goalId: "",
                              page: 0,
                              mode: "live",
                            },
                          });
                        }}
                      >
                        <page.icon aria-hidden="true" />
                        {page.label}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                  <CommandSeparator />
                  <CommandGroup heading="Websites">
                    {sites.map((site) => (
                      <CommandItem
                        key={site.id}
                        value={`website:${site.id}`}
                        keywords={[site.name, site.origin]}
                        onSelect={() => {
                          setOpen(false);
                          void navigate({
                            to: "/app/$siteId/overview",
                            params: { siteId: site.id },
                            search: filters,
                          });
                        }}
                      >
                        <Globe aria-hidden="true" />
                        <span className="truncate">{site.name}</span>
                        <span className="ml-auto max-w-[45%] truncate text-xs text-muted-foreground">
                          {site.origin.replace(/^https?:\/\//, "")}
                        </span>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
                <div
                  className="flex items-center gap-4 border-t px-4 py-2.5 text-xs text-muted-foreground"
                  aria-hidden="true"
                >
                  <span>↑ ↓ Navigate</span>
                  <span>↵ Open</span>
                  <span className="ml-auto">Esc Close</span>
                </div>
              </Command>
            </DialogContent>
          </Dialog>
          <WorkspaceHelp siteId={siteId} />
          <Link
            className="workspace-icon-button"
            to="/app/$siteId/events"
            search={{ days: 7 }}
            params={{ siteId }}
            aria-label="Recent events"
          >
            <GraphiteIcon name="bell" />
          </Link>
          <HeaderAccount />
        </div>
      </div>
    </header>
  );
}
