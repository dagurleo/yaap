import { reportFilters, type ReportFilters } from "../../lib/report-filters";
import { Link } from "@tanstack/react-router";
import {
  ChartNoAxesCombined,
  Users,
  Filter,
  CircleDollarSign,
  Zap,
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
      <Link
        className={style}
        to="/app/$siteId/overview"
        params={{ siteId }}
        search={reportFilters(filters)}
        activeOptions={{ includeSearch: false }}
      >
        <ChartNoAxesCombined aria-hidden="true" /> Overview
      </Link>
      <Link
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
      </Link>
      <Link
        className={style}
        to="/app/$siteId/funnels"
        params={{ siteId }}
        search={reportFilters(filters)}
        activeOptions={{ includeSearch: false }}
      >
        <Filter aria-hidden="true" /> Funnels
      </Link>
      <Link
        className={style}
        to="/app/$siteId/revenue"
        params={{ siteId }}
        search={{ ...reportFilters(filters), mode: "live", page: 0 }}
        activeOptions={{ includeSearch: false }}
      >
        <CircleDollarSign aria-hidden="true" /> Revenue
      </Link>
      <Link
        className={style}
        to="/app/$siteId/events"
        search={{ days: 7 }}
        params={{ siteId }}
      >
        <Zap aria-hidden="true" /> Events
      </Link>
      <div className="dashboard-nav-label">Workspace</div>
      <Link className={style} to="/app" activeOptions={{ exact: true }}>
        <LayoutGrid aria-hidden="true" />
        All websites
      </Link>
      {canManage && (
        <Link className={style} to="/app/$siteId/settings" params={{ siteId }}>
          <Settings2 aria-hidden="true" /> Settings
        </Link>
      )}
    </nav>
  );
}
