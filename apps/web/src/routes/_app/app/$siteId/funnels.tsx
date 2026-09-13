import { useReportQueries } from "@/features/dashboard/report-queries";
import { dashboardPending } from "@/features/dashboard/dashboard-pending";
import { conditionsLabel } from "@/lib/conversion-conditions";
import { useState, useRef } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  useSuspenseQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { Plus, RefreshCw } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { WebsiteLayout } from "@/features/dashboard/website-layout";
import {
  ReportDates,
  ActiveFilters,
} from "@/features/dashboard/report-controls";
import { FunnelEditor, FunnelSelect } from "@/features/dashboard/funnel-editor";
import { sitesQuery, funnelsQuery } from "@/features/dashboard/queries";
import { archiveFunnelFn } from "@/features/dashboard/functions";
import { reportFilters, type ReportFilters } from "@/lib/report-filters";
import type { FunnelInput } from "@/lib/funnels";
import { EntityIcon } from "@/features/dashboard/entity-icon-picker";
export const Route = createFileRoute("/_app/app/$siteId/funnels")({
  ...dashboardPending,
  validateSearch: (
    search: Record<string, unknown>,
  ): ReportFilters & { funnelId?: string } => ({
    ...reportFilters(search),
    ...(typeof search.funnelId === "string" && search.funnelId.length <= 128
      ? { funnelId: search.funnelId }
      : {}),
  }),
  loaderDeps: ({ search }) => search,
  loader: async ({ context, params, deps }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(sitesQuery()),
      context.queryClient.ensureQueryData(funnelsQuery(params.siteId, deps)),
    ]);
  },
  component: Funnels,
});
const percent = (value: number | null) =>
  value === null ? "—" : `${(value * 100).toFixed(1)}%`;
function Funnels() {
  const { siteId } = Route.useParams();
  const filters = Route.useSearch();
  const navigate = Route.useNavigate();
  return (
    <FunnelsReport siteId={siteId} filters={filters} navigate={navigate} />
  );
}
export function FunnelsReport({
  siteId,
  filters,
  navigate,
}: {
  siteId: string;
  filters: ReturnType<typeof Route.useSearch>;
  navigate: ReturnType<typeof Route.useNavigate>;
}) {
  const { funnelsQuery } = useReportQueries();
  const { data, error, refetch, isFetching } = useSuspenseQuery(
    funnelsQuery(siteId, filters),
  );
  const [editor, setEditor] = useState<{
    initial?: FunnelInput & { id: string };
  } | null>(null);
  const editorTrigger = useRef<HTMLButtonElement | null>(null);
  const client = useQueryClient();
  const archive = useMutation({
    mutationFn: (values: { id: string; archived: boolean }) =>
      archiveFunnelFn({ data: { siteId, ...values } }),
    onSuccess: async (result) => {
      await client.invalidateQueries({
        queryKey: ["sites", siteId, "funnels"],
      });
      await navigate({ search: { ...filters, funnelId: result.id } });
    },
  });
  const changeFilters = (next: ReportFilters) =>
    void navigate({ search: { ...next, funnelId: filters.funnelId } });
  const selected = data.selected;
  const results = data.results;
  const canManage = data.site.capabilities.manageSite;
  return (
    <WebsiteLayout title="Funnels" selectedSiteId={siteId}>
      <section className="space-y-5" aria-label="Conversion funnels">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <ReportDates
              filters={filters}
              onChange={changeFilters}
              comparison
            />
            <Button
              size="icon"
              aria-label="Refresh funnels"
              disabled={isFetching}
              onClick={() => void refetch()}
            >
              <RefreshCw
                className={isFetching ? "motion-safe:animate-spin" : ""}
              />
            </Button>
          </div>
        </div>
        <ActiveFilters filters={filters} onChange={changeFilters} />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg">Funnels</h2>
          {canManage && (
            <Button
              variant="primary"
              onClick={(event) => {
                editorTrigger.current = event.currentTarget;
                setEditor({});
              }}
            >
              <Plus aria-hidden="true" />
              New funnel
            </Button>
          )}
        </div>
        {!!data.definitions.length && (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2">
              {selected && <EntityIcon name={selected.icon} />}
              <FunnelSelect
                name="funnel"
                aria-label="Choose funnel"
                value={selected?.id ?? ""}
                onChange={(event) =>
                  void navigate({
                    search: { ...filters, funnelId: event.target.value },
                  })
                }
              >
                {!selected && <option value="">Choose funnel</option>}
                {data.definitions.map((funnel) => (
                  <option key={funnel.id} value={funnel.id}>
                    {funnel.name}
                    {funnel.archived ? " (archived)" : ""}
                  </option>
                ))}
              </FunnelSelect>
            </div>
            {selected && canManage && (
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={(event) => {
                    editorTrigger.current = event.currentTarget;
                    setEditor({ initial: selected });
                  }}
                >
                  Edit
                </Button>
                <Button
                  size="sm"
                  disabled={archive.isPending}
                  onClick={() =>
                    archive.mutate({
                      id: selected.id,
                      archived: !selected.archived,
                    })
                  }
                >
                  {selected.archived ? "Restore" : "Archive"}
                </Button>
              </div>
            )}
          </div>
        )}
        {(error || archive.error) && (
          <p role="alert" className="text-destructive">
            {archive.error?.message ?? "Could not refresh funnels."}
          </p>
        )}
        {selected && results ? (
          <Card>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex min-w-0 items-start gap-2">
                <EntityIcon name={selected.icon} className="mt-0.5" />
                <h3 className="min-w-0 wrap-anywhere">
                  {selected.name}
                  {selected.archived ? " (archived)" : ""}
                </h3>
              </div>
              <p className="text-xs">
                {selected.scope === "visitor" ? "Visitors" : "Sessions"} ·{" "}
                {selected.windowHours >= 24
                  ? `${selected.windowHours / 24} days`
                  : "1 hour"}{" "}
                · {data.site.timezone}
              </p>
            </div>
            <div className="@container">
              <dl className="grid grid-cols-3 gap-4 [&>div]:min-w-0 [&_dt]:truncate [&_dt]:text-sm [&_dt]:text-muted-foreground [&_dd]:pt-1 [&_dd]:text-2xl [&_dd]:font-semibold [&_dd]:tabular-nums">
                <div>
                  <dt>Entered</dt>
                  <dd>{results.entrants}</dd>
                </div>
                <div>
                  <dt>Completed</dt>
                  <dd>{results.completed}</dd>
                </div>
                <div>
                  <dt>Conversion</dt>
                  <dd>{percent(results.conversionRate)}</dd>
                </div>
              </dl>
            </div>
            {data.comparison && (
              <p className="text-sm">
                Previous: {data.comparison.completed} completed ·{" "}
                {percent(data.comparison.conversionRate)}
              </p>
            )}
            <ol role="list" className="space-y-6 pt-3">
              {results.steps.map((step, index) => (
                <li key={index} className="space-y-2">
                  <div className="flex items-start justify-between gap-4 text-sm">
                    <div className="min-w-0">
                      <div className="font-medium wrap-anywhere">
                        {index + 1}. {step.value}
                        {step.conditions && (
                          <small className="block pt-1 font-normal text-muted-foreground wrap-anywhere">
                            {conditionsLabel(step.conditions)}
                          </small>
                        )}
                      </div>
                      <div className="pt-1 text-xs text-muted-foreground">
                        {step.kind === "page" ? "Page" : "Event"}
                      </div>
                    </div>
                    <div className="shrink-0 text-right tabular-nums">
                      <div className="font-medium">{step.reached}</div>
                      <div className="pt-1 text-xs text-muted-foreground">
                        {percent(step.conversionRate)}
                      </div>
                    </div>
                  </div>
                  <div
                    className="h-8 overflow-hidden rounded-lg bg-muted"
                    aria-hidden="true"
                  >
                    <div
                      className="h-full w-(--completion) rounded-lg bg-chart-1"
                      style={
                        {
                          "--completion": `${(step.conversionRate ?? 0) * 100}%`,
                        } as React.CSSProperties
                      }
                    />
                  </div>
                  {index > 0 && (
                    <div className="flex flex-wrap justify-between gap-2 text-xs text-muted-foreground tabular-nums">
                      <p>
                        {step.dropOff} dropped · {percent(step.dropOffRate)}
                      </p>
                      <p>
                        {percent(step.stepConversionRate)} from previous step
                      </p>
                    </div>
                  )}
                </li>
              ))}
            </ol>
          </Card>
        ) : (
          <p className="py-16 text-center">
            {data.definitions.length ? "No active funnels" : "No funnels yet"}
          </p>
        )}
        {canManage && editor && (
          <FunnelEditor
            restoreFocus={() => editorTrigger.current?.focus()}
            siteId={siteId}
            initial={editor.initial}
            onClose={() => setEditor(null)}
            onSaved={(id) =>
              void navigate({ search: { ...filters, funnelId: id } })
            }
          />
        )}
      </section>
    </WebsiteLayout>
  );
}
