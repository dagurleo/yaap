import { usePublicDashboard } from "./public-context";
import { useParams } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { sitesQuery } from "./queries";
export function useReportingTimezone() {
  const { siteId } = useParams({ strict: false });
  const shared = usePublicDashboard();
  const { data } = useQuery({ ...sitesQuery(), enabled: !shared });
  return (
    shared?.site.timezone ??
    data?.find((site) => site.id === siteId)?.timezone ??
    "UTC"
  );
}
