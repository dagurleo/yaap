import {
  ConditionEditor,
  conditionDrafts,
  parseConditions,
} from "./condition-editor";
import { useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowUp, ArrowDown, X, Plus, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { validateFunnel, type FunnelInput } from "@/lib/funnels";
import {
  defaultFunnelIcon,
  validEntityIcon,
  type EntityIconName,
} from "@/lib/entity-icons";
import { EntityIconPicker } from "./entity-icon-picker";
import { saveFunnelFn } from "./functions";
export function FunnelSelect(props: React.ComponentProps<"select">) {
  return (
    <div className="inline-grid min-w-0 max-w-full grid-cols-[1fr_2rem]">
      <select
        {...props}
        className="col-span-full row-start-1 h-9 min-w-0 appearance-none rounded-lg bg-control pr-8 pl-3 text-sm ring-1 ring-input shadow-xs dark:shadow-none focus-visible:outline-2 focus-visible:outline-ring"
      />
      <ChevronDown
        aria-hidden="true"
        className="pointer-events-none col-start-2 row-start-1 size-4 shrink-0 place-self-center stroke-muted-foreground"
      />
    </div>
  );
}
export function FunnelEditor({
  siteId,
  initial,
  onClose,
  onSaved,
  restoreFocus,
}: {
  siteId: string;
  initial?: FunnelInput & { id: string };
  onClose: () => void;
  onSaved: (id: string) => void;
  restoreFocus: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [icon, setIcon] = useState<EntityIconName>(() =>
    validEntityIcon(initial?.icon) ? initial.icon : defaultFunnelIcon,
  );
  const [scope, setScope] = useState(initial?.scope ?? "visitor");
  const [windowHours, setWindowHours] = useState(initial?.windowHours ?? 168);
  const [steps, setSteps] = useState(() =>
    (
      initial?.steps ?? [
        { kind: "page" as const, value: "/" },
        { kind: "event" as const, value: "signup" },
      ]
    ).map((step, index) => ({
      ...step,
      drafts: conditionDrafts(step.conditions),
      key: String(index),
    })),
  );
  const [error, setError] = useState("");
  const client = useQueryClient();
  const save = useMutation({
    mutationFn: (funnel: FunnelInput) =>
      saveFunnelFn({ data: { siteId, id: initial?.id, funnel } }),
  });
  function move(index: number, delta: number) {
    setSteps((items) => {
      const next = [...items];
      [next[index], next[index + delta]] = [next[index + delta], next[index]];
      return next;
    });
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    try {
      const funnel = validateFunnel({
        name,
        icon,
        scope,
        windowHours,
        steps: steps.map((step) => ({
          ...step,
          conditions: parseConditions(step.drafts),
        })),
      });
      const saved = await save.mutateAsync(funnel);
      await client.invalidateQueries({
        queryKey: ["sites", siteId, "funnels"],
      });
      onSaved(saved.id);
      onClose();
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Could not save funnel",
      );
    }
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl"
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          restoreFocus();
        }}
      >
        <DialogTitle>{initial ? "Edit funnel" : "New funnel"}</DialogTitle>
        <DialogDescription className="sr-only">
          Ordered page and event steps.
        </DialogDescription>
        <form onSubmit={submit} className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_10rem]">
            <Label>
              Name
              <Input
                name="funnelName"
                autoComplete="off"
                data-1p-ignore
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Visitor to signup"
                maxLength={120}
                required
              />
            </Label>
            <Label>
              Icon
              <EntityIconPicker value={icon} onChange={setIcon} />
            </Label>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Label>
              Count
              <FunnelSelect
                name="scope"
                value={scope}
                onChange={(event) =>
                  setScope(event.target.value as FunnelInput["scope"])
                }
              >
                <option value="visitor">Visitors</option>
                <option value="session">Sessions</option>
              </FunnelSelect>
            </Label>
            <Label>
              Conversion window
              <FunnelSelect
                name="windowHours"
                value={windowHours}
                onChange={(event) => setWindowHours(Number(event.target.value))}
              >
                {[
                  [1, "1 hour"],
                  [24, "24 hours"],
                  [168, "7 days"],
                  [720, "30 days"],
                ].map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </FunnelSelect>
            </Label>
          </div>
          <ol role="list" className="space-y-4">
            {steps.map((step, index) => (
              <li
                key={step.key}
                className="space-y-2 border-t border-border pt-4"
              >
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-sm">Step {index + 1}</h3>
                  <div className="flex gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label={`Move step ${index + 1} up`}
                      disabled={index === 0}
                      onClick={() => move(index, -1)}
                    >
                      <ArrowUp aria-hidden="true" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label={`Move step ${index + 1} down`}
                      disabled={index === steps.length - 1}
                      onClick={() => move(index, 1)}
                    >
                      <ArrowDown aria-hidden="true" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label={`Remove step ${index + 1}`}
                      disabled={steps.length <= 2}
                      onClick={() =>
                        setSteps((items) => items.filter((_, i) => i !== index))
                      }
                    >
                      <X aria-hidden="true" />
                    </Button>
                  </div>
                </div>
                <div className="grid gap-2 sm:grid-cols-[8rem_minmax(0,1fr)]">
                  <FunnelSelect
                    name={`kind-${index}`}
                    aria-label={`Step ${index + 1} type`}
                    value={step.kind}
                    onChange={(event) =>
                      setSteps((items) =>
                        items.map((item, i) =>
                          i === index
                            ? {
                                ...item,
                                kind: event.target.value as "page" | "event",
                                value:
                                  event.target.value === "page"
                                    ? "/"
                                    : "signup",
                              }
                            : item,
                        ),
                      )
                    }
                  >
                    <option value="page">Page</option>
                    <option value="event">Event</option>
                  </FunnelSelect>
                  <Input
                    name={`value-${index}`}
                    aria-label={`Step ${index + 1} value`}
                    value={step.value}
                    maxLength={step.kind === "page" ? 1024 : 64}
                    placeholder={step.kind === "page" ? "/pricing" : "signup"}
                    required
                    onChange={(event) =>
                      setSteps((items) =>
                        items.map((item, i) =>
                          i === index
                            ? { ...item, value: event.target.value }
                            : item,
                        ),
                      )
                    }
                  />
                </div>
                <ConditionEditor
                  label={`Step ${index + 1} conditions`}
                  rows={step.drafts}
                  onChange={(drafts) =>
                    setSteps((items) =>
                      items.map((item, i) =>
                        i === index ? { ...item, drafts } : item,
                      ),
                    )
                  }
                />
              </li>
            ))}
          </ol>
          <Button
            size="sm"
            disabled={steps.length >= 8}
            onClick={() =>
              setSteps((items) => [
                ...items,
                {
                  kind: "page",
                  value: "/",
                  drafts: [],
                  key: crypto.randomUUID(),
                },
              ])
            }
          >
            <Plus aria-hidden="true" />
            Add step
          </Button>
          {error && (
            <p role="alert" className="text-destructive">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button onClick={onClose}>Cancel</Button>
            <Button type="submit" variant="primary" disabled={save.isPending}>
              {save.isPending ? "Saving…" : "Save funnel"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
