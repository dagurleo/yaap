import { reportFilters, type ReportFilters } from "../../lib/report-filters";
import { ReportLink, usePublicDashboard } from "./public-context";
import { Link } from "@tanstack/react-router";
import {
  ChartNoAxesCombined,
  Users,
  Filter,
  CircleDollarSign,
  Zap,
  Bot,
  Settings2,
  LayoutGrid,
} from "lucide-react";
export function SiteTabs({
  siteId,
  filters = { days: 7 },
  onNavigate,
  canManage = false,
}: {
  siteId: string;
  filters?: ReportFilters;
  onNavigate?: () => void;
  canManage?: boolean;
}) {
  const shared = usePublicDashboard();
  const capabilities = shared?.site.capabilities;
  const style = "dashboard-nav-link";
  return (
    <nav
      className="dashboard-nav"
      onClick={onNavigate}
      aria-label="Website reports"
    >
      <div className="dashboard-nav-label dashboard-nav-label-first">
        Analytics
      </div>
      <ReportLink
        className={style}
        to="/app/$siteId/overview"
        params={{ siteId }}
        search={reportFilters(filters)}
        activeOptions={{ includeSearch: false }}
      >
        <ChartNoAxesCombined aria-hidden="true" /> Overview
      </ReportLink>
      {(!capabilities || capabilities.visitors) && (
        <ReportLink
          className={style}
          to="/app/$siteId/visitors"
          params={{ siteId }}
          search={{
            ...reportFilters(filters),
            cohort: "all",
            goalId: "",
            page: 0,
          }}
          activeOptions={{ includeSearch: false }}
        >
          <Users aria-hidden="true" /> Visitors
        </ReportLink>
      )}
      {(!capabilities || capabilities.conversions) && (
        <ReportLink
          className={style}
          to="/app/$siteId/funnels"
          params={{ siteId }}
          search={reportFilters(filters)}
          activeOptions={{ includeSearch: false }}
        >
          <Filter aria-hidden="true" /> Funnels
        </ReportLink>
      )}
      {(!capabilities || capabilities.revenue) && (
        <ReportLink
          className={style}
          to="/app/$siteId/revenue"
          params={{ siteId }}
          search={{ ...reportFilters(filters), mode: "live", page: 0 }}
          activeOptions={{ includeSearch: false }}
        >
          <CircleDollarSign aria-hidden="true" /> Revenue
        </ReportLink>
      )}
      {(!capabilities || capabilities.events) && (
        <ReportLink
          className={style}
          to="/app/$siteId/events"
          search={{ days: 7 }}
          params={{ siteId }}
          activeOptions={{ includeSearch: false }}
        >
          <Zap aria-hidden="true" /> Events
        </ReportLink>
      )}
      {!shared && (
        <Link
          className={style}
          to="/app/$siteId/bots"
          params={{ siteId }}
          search={{ days: 7, category: "all", botSource: "all" }}
          activeOptions={{ includeSearch: false }}
        >
          <Bot aria-hidden="true" /> Bot traffic
        </Link>
      )}
      {!shared && (
        <>
          <div className="dashboard-nav-label">Workspace</div>
          <Link className={style} to="/app" activeOptions={{ exact: true }}>
            <LayoutGrid aria-hidden="true" />
            All websites
          </Link>
        </>
      )}
      {canManage && (
        <Link className={style} to="/app/$siteId/settings" params={{ siteId }}>
          <Settings2 aria-hidden="true" /> Settings
        </Link>
      )}
    </nav>
  );
}
