import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FunnelSelect } from "./funnel-editor";
import { changePaymentSettingsFn } from "./functions";
import type { AttributionModel } from "@/server/payment-attribution";

export function AttributionSettings({
  siteId,
  model: initialModel,
  lookbackDays: initialDays,
}: {
  siteId: string;
  model: AttributionModel;
  lookbackDays: number;
}) {
  const [model, setModel] = useState(initialModel);
  const [days, setDays] = useState(String(initialDays));
  const [message, setMessage] = useState("");
  const client = useQueryClient();
  const mutation = useMutation({
    mutationFn: (action: "attribution" | "reconcileAttribution") =>
      changePaymentSettingsFn({
        data: {
          siteId,
          change:
            action === "attribution"
              ? { action, model, lookbackDays: Number(days) }
              : { action },
        },
      }),
    onSuccess: async (_result, action) => {
      setMessage(
        action === "attribution"
          ? "Saved for new attribution records. Existing records keep their model and window."
          : "Retained history checked in a batch of up to 200 payments. Larger backfills continue on refresh or hourly maintenance.",
      );
      await Promise.all([
        client.invalidateQueries({
          queryKey: ["sites", siteId, "payment-settings"],
        }),
        client.invalidateQueries({ queryKey: ["sites", siteId, "revenue"] }),
      ]);
    },
  });
  return (
    <section className="space-y-3 border-b border-border pb-5">
      <h3>Revenue attribution</h3>
      <p className="text-base text-muted-foreground sm:text-sm">
        Each payment keeps its model and lookback window. Attribution reconciles
        for at least 72 hours, then freezes at the next check. Refunds keep the
        same attribution.
      </p>
      <form
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          setMessage("");
          mutation.mutate("attribution");
        }}
      >
        <Label>
          Attribution model
          <FunnelSelect
            name="attributionModel"
            value={model}
            onChange={(event) =>
              setModel(event.target.value as AttributionModel)
            }
          >
            <option value="first_touch">First touch</option>
            <option value="last_non_direct">Last non-direct touch</option>
          </FunnelSelect>
        </Label>
        <Label>
          Lookback days
          <Input
            name="attributionLookbackDays"
            type="number"
            min={1}
            max={365}
            step={1}
            required
            value={days}
            onChange={(event) => setDays(event.target.value)}
          />
        </Label>
        <p className="text-base text-muted-foreground sm:text-sm">
          First touch selects the earliest pageview in the window. Last
          non-direct selects the latest campaign or referral pageview, falling
          back to the latest direct pageview.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button type="submit" size="sm" disabled={mutation.isPending}>
            Save attribution policy
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={mutation.isPending}
            onClick={() => {
              setMessage("");
              mutation.mutate("reconcileAttribution");
            }}
          >
            Reconcile retained history
          </Button>
        </div>
      </form>
      <p className="text-base text-muted-foreground sm:text-sm">
        Backfills use the current policy and retained events. Deleted history
        cannot be recovered. Finalized records are preserved.
      </p>
      {message && (
        <p role="status" className="text-base sm:text-sm">
          {message}
        </p>
      )}
      {mutation.error && (
        <p role="alert" className="text-destructive">
          {mutation.error.message}
        </p>
      )}
    </section>
  );
}
