import {
  ConditionEditor,
  conditionDrafts,
  parseConditions,
} from "./condition-editor";
import { FunnelSelect } from "./funnel-editor";
import { conditionsLabel } from "@/lib/conversion-conditions";
import type { EventProperties } from "@/lib/event-properties";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Archive as ArchiveIcon,
  ArchiveRestore,
  Plus,
  Pencil,
} from "lucide-react";
import { addGoalFn, archiveGoalFn, type overviewFn } from "./functions";
import {
  defaultGoalIcon,
  validEntityIcon,
  type EntityIconName,
} from "@/lib/entity-icons";
import { EntityIcon, EntityIconPicker } from "./entity-icon-picker";

type Report = Awaited<ReturnType<typeof overviewFn>>;

export function GoalDialog({
  data,
  open,
  onOpenChange,
  onCreated,
  initial,
}: {
  data: Report;
  initial?: Report["goals"][number];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: () => void;
}) {
  const client = useQueryClient();
  const [icon, setIcon] = useState<EntityIconName>(
    validEntityIcon(initial?.icon) ? initial.icon : defaultGoalIcon,
  );
  const [kind, setKind] = useState(initial?.path ? "page" : "event");
  const [conditions, setConditions] = useState(() =>
    conditionDrafts(initial?.conditions),
  );
  const [error, setError] = useState("");
  const create = useMutation({
    mutationFn: (values: {
      name: string;
      eventName: string;
      icon: EntityIconName;
      path: string | null;
      conditions: EventProperties;
    }) =>
      addGoalFn({ data: { siteId: data.site.id, id: initial?.id, ...values } }),
    onSuccess: () =>
      client.invalidateQueries({
        queryKey: ["sites", data.site.id],
      }),
  });

  function changeOpen(nextOpen: boolean) {
    if (!nextOpen) {
      create.reset();
      setIcon(validEntityIcon(initial?.icon) ? initial.icon : defaultGoalIcon);
      setKind(initial?.path ? "page" : "event");
      setConditions(conditionDrafts(initial?.conditions));
      setError("");
    }
    onOpenChange(nextOpen);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    setError("");
    try {
      await create.mutateAsync({
        name: String(values.get("name")).trim(),
        eventName:
          kind === "page" ? "pageview" : String(values.get("eventName")).trim(),
        path: kind === "page" ? String(values.get("path")) : null,
        conditions: parseConditions(conditions),
        icon,
      });
      onCreated?.();
      changeOpen(false);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Could not save goal");
    }
  }

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{initial ? "Edit goal" : "Create a goal"}</DialogTitle>
          <DialogDescription className="text-base sm:text-sm">
            Count matching events or page visits. Changes apply to retained
            history.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_10rem]">
            <Label>
              Goal name
              <Input
                name="name"
                defaultValue={initial?.name}
                placeholder="Create an account"
                maxLength={120}
                required
              />
            </Label>
            <Label>
              Icon
              <EntityIconPicker value={icon} onChange={setIcon} />
            </Label>
          </div>
          <Label>
            Goal type
            <FunnelSelect
              value={kind}
              onChange={(e) => setKind(e.target.value)}
            >
              <option value="event">Custom event</option>
              <option value="page">Page path</option>
            </FunnelSelect>
          </Label>
          <Label>
            {kind === "page" ? "Exact page path" : "Custom event name"}
            <Input
              key={kind}
              name={kind === "page" ? "path" : "eventName"}
              defaultValue={
                kind === "page"
                  ? (initial?.path ?? "")
                  : initial?.eventName === "pageview"
                    ? ""
                    : initial?.eventName
              }
              placeholder={kind === "page" ? "/thank-you" : "signup"}
              maxLength={kind === "page" ? 1024 : 64}
              list={kind === "event" ? "goal-event-names" : undefined}
              required
            />
            <small>
              {kind === "page"
                ? "Case-sensitive path without queries or fragments."
                : "Exact event name, case-sensitive."}
            </small>
          </Label>
          <ConditionEditor rows={conditions} onChange={setConditions} />
          <p className="text-xs text-muted-foreground">
            Completions include anonymous events. Session conversion is
            converted sessions divided by all identified sessions in the report.
          </p>
          <datalist id="goal-event-names">
            {data.customEvents.map((event) => (
              <option key={event.name} value={event.name} />
            ))}
          </datalist>
          {error && (
            <p className="text-destructive" role="alert">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button type="button" onClick={() => changeOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" disabled={create.isPending}>
              {create.isPending
                ? "Saving…"
                : initial
                  ? "Save goal"
                  : "Create goal"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function GoalsPanel({
  data,
  initialCreating = data.goals.length === 0,
  onRequestCreate,
}: {
  data: Report;
  initialCreating?: boolean;
  onRequestCreate?: () => void;
}) {
  const canManage = data.site.capabilities.manageSite;
  const client = useQueryClient();
  const [message, setMessage] = useState("");
  const [creating, setCreating] = useState(canManage && initialCreating);
  const [editing, setEditing] = useState<Report["goals"][number] | null>(null);
  const refresh = () =>
    client.invalidateQueries({ queryKey: ["sites", data.site.id] });
  const archive = useMutation({
    mutationFn: (values: { goalId: string; archived: boolean }) =>
      archiveGoalFn({ data: { siteId: data.site.id, ...values } }),
    onSuccess: refresh,
  });
  function requestCreate() {
    setMessage("");
    if (onRequestCreate) onRequestCreate();
    else setCreating(true);
  }
  const active = data.goals.filter((goal) => !goal.archived);
  const archived = data.goals.filter((goal) => goal.archived);
  function toggle(goalId: string, archived: boolean) {
    setMessage("");
    archive.mutate({ goalId, archived });
  }
  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h3>Goals &amp; conversions</h3>
          <p className="pt-1 text-sm text-muted-foreground">
            Track matching events and page visits as conversions.
          </p>
        </div>
        {canManage && !creating && (
          <Button size="sm" type="button" onClick={requestCreate}>
            <Plus aria-hidden="true" />
            New goal
          </Button>
        )}
      </div>
      {active.length ? (
        <div className="@container">
          {active.map((goal) => (
            <article
              className="space-y-4 border-b py-5 first:pt-0 last:border-0 last:pb-0"
              key={goal.id}
            >
              <div className="flex flex-wrap items-center justify-between gap-3 [&>div]:min-w-0">
                <div className="flex min-w-0 items-start gap-2">
                  <EntityIcon name={goal.icon} className="mt-0.5" />
                  <div className="min-w-0">
                    <h4 className="wrap-anywhere">{goal.name}</h4>
                    <code className="wrap-anywhere">
                      {goal.path ?? goal.eventName}
                    </code>
                    {!!Object.keys(goal.conditions).length && (
                      <p className="text-xs text-muted-foreground wrap-anywhere">
                        {conditionsLabel(goal.conditions)}
                      </p>
                    )}
                  </div>
                </div>
                {canManage && (
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      aria-label={`Edit ${goal.name}`}
                      onClick={() => setEditing(goal)}
                    >
                      <Pencil aria-hidden="true" />
                      Edit
                    </Button>
                    <Button
                      size="sm"
                      type="button"
                      disabled={archive.isPending}
                      aria-label={`Archive ${goal.name}`}
                      onClick={() => toggle(goal.id, true)}
                    >
                      <ArchiveIcon aria-hidden="true" />
                      Archive
                    </Button>
                  </div>
                )}
              </div>
              <dl className="grid grid-cols-2 gap-5 @lg:grid-cols-3 [&_dt]:truncate [&_dt]:text-xs [&_dt]:text-muted-foreground [&_dd]:pt-1 [&_dd]:text-2xl [&_dd]:font-semibold [&_dd]:tabular-nums">
                <div>
                  <dt>Completions</dt>
                  <dd>{goal.completions}</dd>
                </div>
                <div>
                  <dt>Converted sessions</dt>
                  <dd>{goal.convertedSessions}</dd>
                </div>
                <div>
                  <dt>Session conversion</dt>
                  <dd>
                    {goal.conversionRate === null
                      ? "—"
                      : `${(goal.conversionRate * 100).toFixed(1)}%`}
                  </dd>
                </div>
              </dl>
            </article>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          {canManage
            ? "No goals yet. Create one from a custom event such as signup or purchase."
            : "No goals have been created for this website yet."}
        </p>
      )}
      {canManage && editing && (
        <GoalDialog
          key={editing.id}
          data={data}
          initial={editing}
          open
          onOpenChange={(open) => {
            if (!open) setEditing(null);
          }}
          onCreated={() => setMessage("Goal updated.")}
        />
      )}
      {canManage && !onRequestCreate && (
        <GoalDialog
          data={data}
          open={creating}
          onOpenChange={setCreating}
          onCreated={() => setMessage("Goal added.")}
        />
      )}
      {archived.length > 0 && (
        <details className="space-y-3 [&_form]:max-w-sm">
          <summary>Archived goals ({archived.length})</summary>
          {archived.map((goal) => (
            <div
              className="flex flex-wrap items-center justify-between gap-3 [&>div]:min-w-0"
              key={goal.id}
            >
              <div className="flex min-w-0 items-start gap-2">
                <EntityIcon name={goal.icon} className="mt-0.5" />
                <p className="min-w-0 wrap-anywhere">
                  {goal.name} · <code>{goal.path ?? goal.eventName}</code>
                  {conditionsLabel(goal.conditions) && (
                    <small className="block">
                      {conditionsLabel(goal.conditions)}
                    </small>
                  )}
                </p>
              </div>
              {canManage && (
                <Button
                  size="sm"
                  type="button"
                  disabled={archive.isPending}
                  aria-label={`Restore ${goal.name}`}
                  onClick={() => toggle(goal.id, false)}
                >
                  <ArchiveRestore aria-hidden="true" />
                  Restore
                </Button>
              )}
            </div>
          ))}
        </details>
      )}
      {archive.error && (
        <p className="text-destructive" role="alert">
          {archive.error.message || "Could not save goal. Try again."}
        </p>
      )}
      {message && <p role="status">{message}</p>}
    </Card>
  );
}
