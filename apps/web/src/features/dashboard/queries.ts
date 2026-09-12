import type { ConversionFilters } from "../../lib/conversion-filters";
import { conversionsFn } from "./functions";
import type { RevenueFilters } from "../../lib/revenue-filters";
import type { EventFilters } from "../../lib/event-filters";
import type { ReportFilters } from "../../lib/report-filters";
import type { VisitorFilters, JourneyCursor } from "../../server/visitors";
import { queryOptions, infiniteQueryOptions } from "@tanstack/react-query";
import {
  sitesFn,
  eventsFn,
  eventExplorerFn,
  overviewFn,
  visitorsFn,
  journeyFn,
  liveFn,
  funnelsFn,
  operationsFn,
  revenueFn,
  paymentSettingsFn,
  peopleFn,
  billingFn,
} from "./functions";
export const sitesQuery = () =>
  queryOptions({ queryKey: ["sites"], queryFn: () => sitesFn() });
export const billingQuery = () =>
  queryOptions({
    queryKey: ["billing"],
    queryFn: () => billingFn(),
    staleTime: 15_000,
    retry: false,
    refetchOnWindowFocus: false,
  });
export const eventExplorerQuery = (siteId: string, filters: EventFilters) =>
  queryOptions({
    queryKey: ["sites", siteId, "event-explorer", filters],
    queryFn: () => eventExplorerFn({ data: { siteId, ...filters } }),
    refetchInterval: filters.asOf ? false : 5000,
  });
export const eventsQuery = (siteId: string) =>
  queryOptions({
    queryKey: ["sites", siteId, "events"],
    queryFn: () => eventsFn({ data: { siteId } }),
    refetchInterval: 5000,
  });

export const overviewQuery = (
  siteId: string,
  filters: number | ReportFilters,
) =>
  queryOptions({
    queryKey: ["sites", siteId, "overview", filters],
    queryFn: () =>
      overviewFn({
        data: {
          siteId,
          ...(typeof filters === "number" ? { days: filters } : filters),
        },
      }),
    staleTime: 60_000,
    refetchInterval: (query) => {
      const data = query.state.data;
      return data && data.end <= data.asOf ? false : 60_000;
    },
    refetchOnWindowFocus: false,
  });

export const visitorsQuery = (siteId: string, filters: VisitorFilters) =>
  queryOptions({
    queryKey: ["sites", siteId, "visitors", filters],
    queryFn: () => visitorsFn({ data: { siteId, ...filters } }),
  });
export const journeyQuery = (siteId: string, visitorId: string, asOf: number) =>
  infiniteQueryOptions({
    queryKey: ["sites", siteId, "journey", visitorId, asOf],
    queryFn: ({ pageParam }) =>
      journeyFn({ data: { siteId, visitorId, asOf, cursor: pageParam } }),
    initialPageParam: undefined as JourneyCursor | undefined,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });

export const liveQuery = (siteId: string, filters: ReportFilters) =>
  queryOptions({
    queryKey: ["sites", siteId, "live", filters],
    queryFn: () => liveFn({ data: { siteId, ...filters } }),
    refetchInterval: 5000,
  });

export const funnelsQuery = (
  siteId: string,
  filters: ReportFilters & { funnelId?: string },
) =>
  queryOptions({
    queryKey: ["sites", siteId, "funnels", filters],
    queryFn: () => funnelsFn({ data: { siteId, ...filters } }),
    staleTime: 60_000,
    retry: false,
    refetchOnWindowFocus: false,
  });

export const revenueQuery = (siteId: string, filters: RevenueFilters) =>
  queryOptions({
    queryKey: ["sites", siteId, "revenue", filters],
    queryFn: () => revenueFn({ data: { siteId, ...filters } }),
    staleTime: 60_000,
    retry: false,
    refetchOnWindowFocus: false,
  });
export const paymentSettingsQuery = (siteId: string) =>
  queryOptions({
    queryKey: ["sites", siteId, "payment-settings"],
    queryFn: () => paymentSettingsFn({ data: { siteId } }),
  });

export const operationsQuery = (siteId: string) =>
  queryOptions({
    queryKey: ["sites", siteId, "operations"],
    queryFn: () => operationsFn({ data: { siteId } }),
    refetchInterval: 15000,
  });

export const peopleQuery = (siteId: string) =>
  queryOptions({
    queryKey: ["sites", siteId, "people"],
    queryFn: () => peopleFn({ data: { siteId } }),
  });

export const conversionsQuery = (siteId: string, filters: ConversionFilters) =>
  queryOptions({
    queryKey: ["sites", siteId, "conversions", filters],
    queryFn: () => conversionsFn({ data: { siteId, ...filters } }),
    staleTime: 60000,
    retry: false,
    refetchOnWindowFocus: false,
  });
