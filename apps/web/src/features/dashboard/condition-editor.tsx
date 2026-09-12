import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { conversionConditions } from "@/lib/conversion-conditions";
import type { EventProperties } from "@/lib/event-properties";
import { Plus, X } from "lucide-react";

export type ConditionDraft = {
  key: string;
  type: "string" | "number" | "boolean";
  value: string;
};
export function conditionDrafts(
  conditions: EventProperties = {},
): ConditionDraft[] {
  return Object.entries(conditions).map(([key, value]) => ({
    key,
    type: typeof value as ConditionDraft["type"],
    value: String(value),
  }));
}
export function parseConditions(rows: ConditionDraft[]) {
  const keys = rows.map((row) => row.key);
  if (new Set(keys).size !== keys.length)
    throw new Error("Use each property key once");
  return conversionConditions(
    Object.fromEntries(
      rows.map(({ key, type, value }) => {
        if (
          type === "number" &&
          !/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(value)
        )
          throw new Error("Enter a valid number for each numeric condition");
        return [
          key,
          type === "number"
            ? Number(value)
            : type === "boolean"
              ? value === "true"
              : value,
        ];
      }),
    ),
  );
}
export function ConditionEditor({
  rows,
  onChange,
  label = "Property conditions",
}: {
  rows: ConditionDraft[];
  onChange: (rows: ConditionDraft[]) => void;
  label?: string;
}) {
  const update = (index: number, change: Partial<ConditionDraft>) =>
    onChange(rows.map((row, i) => (i === index ? { ...row, ...change } : row)));
  return (
    <fieldset className="min-w-0 space-y-3">
      <legend className="text-sm font-medium">{label}</legend>
      {!!rows.length && (
        <p className="text-xs text-muted-foreground">
          All conditions must match the same event. Text, numbers and booleans
          are distinct.
        </p>
      )}
      {rows.map((row, index) => (
        <div
          key={index}
          className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_2rem] items-end gap-2 sm:grid-cols-[minmax(0,1fr)_6rem_minmax(0,1fr)_2rem]"
        >
          <Label className="col-span-2 sm:col-span-1">
            Property key
            <Input
              aria-label={`${label} ${index + 1} key`}
              value={row.key}
              required
              maxLength={64}
              placeholder="plan"
              onChange={(e) => update(index, { key: e.target.value })}
            />
          </Label>
          <Label className="col-start-1 sm:col-start-auto">
            Type
            <select
              className="h-9 min-w-0 rounded-lg bg-control px-2 text-sm ring-1 ring-input"
              aria-label={`${label} ${index + 1} type`}
              value={row.type}
              onChange={(e) =>
                update(index, {
                  type: e.target.value as ConditionDraft["type"],
                  value: e.target.value === "boolean" ? "true" : "",
                })
              }
            >
              <option value="string">Text</option>
              <option value="number">Number</option>
              <option value="boolean">Boolean</option>
            </select>
          </Label>
          <Label>
            Equals
            {row.type === "boolean" ? (
              <select
                className="h-9 min-w-0 rounded-lg bg-control px-2 text-sm ring-1 ring-input"
                aria-label={`${label} ${index + 1} value`}
                value={row.value}
                onChange={(e) => update(index, { value: e.target.value })}
              >
                <option value="true">true</option>
                <option value="false">false</option>
              </select>
            ) : (
              <Input
                aria-label={`${label} ${index + 1} value`}
                value={row.value}
                maxLength={256}
                placeholder={row.type === "number" ? "1" : "pro"}
                onChange={(e) => update(index, { value: e.target.value })}
              />
            )}
          </Label>
          <Button
            variant="ghost"
            size="sm"
            aria-label={`Remove ${label.toLowerCase()} ${index + 1}`}
            onClick={() => onChange(rows.filter((_, i) => i !== index))}
          >
            <X aria-hidden="true" />
          </Button>
        </div>
      ))}
      <Button
        size="sm"
        disabled={rows.length >= 3}
        onClick={() =>
          onChange([...rows, { key: "", type: "string", value: "" }])
        }
      >
        <Plus aria-hidden="true" />
        Add condition
      </Button>
    </fieldset>
  );
}
