import { useParams } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { sitesQuery } from "./queries";
export function useReportingTimezone() {
  const { siteId } = useParams({ strict: false });
  const { data } = useQuery(sitesQuery());
  return data?.find((site) => site.id === siteId)?.timezone ?? "UTC";
}
