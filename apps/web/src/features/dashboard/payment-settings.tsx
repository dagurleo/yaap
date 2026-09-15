import {
  paymentProviders,
  type WebhookProvider,
} from "@/lib/payment-providers";
import { AttributionSettings } from "./attribution-settings";
import { useState, type FormEvent } from "react";
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { FunnelSelect } from "./funnel-editor";
import { paymentSettingsQuery } from "./queries";
import { changePaymentSettingsFn } from "./functions";
import type { IntegrationChange, PaymentMode } from "@/server/payments";
export function PaymentSettings({
  siteId,
  onClose,
  restoreFocus,
}: {
  siteId: string;
  onClose: () => void;
  restoreFocus: () => void;
}) {
  const { data } = useSuspenseQuery(paymentSettingsQuery(siteId));
  const client = useQueryClient();
  const [key, setKey] = useState<string | null>(null),
    [provider, setProvider] = useState<WebhookProvider>("stripe"),
    [mode, setMode] = useState<PaymentMode>("test"),
    [secret, setSecret] = useState(""),
    [copied, setCopied] = useState(false);
  const change = useMutation({
    mutationFn: (value: IntegrationChange) =>
      changePaymentSettingsFn({ data: { siteId, change: value } }),
    onSuccess: async (result) => {
      setKey(result.key);
      setSecret("");
      setCopied(false);
      await client.invalidateQueries({
        queryKey: ["sites", siteId, "payment-settings"],
      });
    },
  });
  const endpoint = typeof window === "undefined" ? "" : window.location.origin;
  function submit(event: FormEvent) {
    event.preventDefault();
    change.mutate({ action: provider, mode, secret });
  }
  const connected = data.providers[provider]?.[mode];
  const config = paymentProviders[provider];
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        className="max-h-[90dvh] overflow-y-auto sm:max-w-xl"
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          restoreFocus();
        }}
      >
        <DialogTitle>Payment settings</DialogTitle>
        <DialogDescription className="sr-only">
          Revenue attribution, server API keys and payment provider webhooks.
        </DialogDescription>
        <AttributionSettings
          siteId={siteId}
          model={data.attributionModel}
          lookbackDays={data.attributionLookbackDays}
        />
        <section className="space-y-3 border-b border-border pb-5">
          <h3 className="text-sm">Server API</h3>
          <code className="block break-all text-xs">
            POST {endpoint}/payments/{siteId}
          </code>
          <div className="flex flex-wrap items-center gap-2">
            <span className="mr-auto text-sm text-muted-foreground">
              {data.apiKeyHint ? `Key ending ${data.apiKeyHint}` : "No API key"}
            </span>
            <Button
              size="sm"
              disabled={change.isPending}
              onClick={() => change.mutate({ action: "rotateKey" })}
            >
              {data.apiKeyHint ? "Rotate key" : "Create key"}
            </Button>
            {data.apiKeyHint && (
              <Button
                size="sm"
                disabled={change.isPending}
                onClick={() => change.mutate({ action: "revokeKey" })}
              >
                Revoke
              </Button>
            )}
          </div>
          {key && (
            <div className="space-y-2 rounded-lg bg-muted p-3">
              <p className="text-xs">Copy now. Keep this key on your server.</p>
              <code className="block break-all text-xs">{key}</code>
              <Button
                size="sm"
                onClick={() =>
                  void navigator.clipboard.writeText(key).then(
                    () => setCopied(true),
                    () => setCopied(false),
                  )
                }
              >
                {copied ? "Copied" : "Copy key"}
              </Button>
            </div>
          )}
        </section>
        <form className="space-y-3" onSubmit={submit}>
          <div className="flex items-center justify-between gap-3">
            <Label>
              Payment provider
              <FunnelSelect
                aria-label="Payment provider"
                value={provider}
                onChange={(event) => {
                  setProvider(event.target.value as WebhookProvider);
                  setSecret("");
                }}
              >
                {Object.entries(paymentProviders).map(([id, value]) => (
                  <option key={id} value={id}>
                    {value.label}
                  </option>
                ))}
              </FunnelSelect>
            </Label>
            <FunnelSelect
              aria-label={`${config.label} mode`}
              value={mode}
              onChange={(event) => {
                setMode(event.target.value as PaymentMode);
                setSecret("");
              }}
            >
              <option value="test">
                {provider === "polar" ? "Sandbox" : "Test"}
              </option>
              <option value="live">Live</option>
            </FunnelSelect>
          </div>
          <code className="block break-all text-xs">
            {endpoint}/payments/{provider}/{siteId}/{mode}
          </code>
          <p className="text-xs text-muted-foreground">
            {config.events.join(" · ")}
          </p>
          <Label>
            Signing secret
            <Input
              name={`${provider}WebhookSecret`}
              type="password"
              autoComplete="off"
              data-1p-ignore
              placeholder={
                connected ? "•••••••• (configured)" : config.secretPlaceholder
              }
              value={secret}
              onChange={(event) => setSecret(event.target.value)}
              maxLength={262}
              required
            />
          </Label>
          <div className="flex justify-end gap-2">
            {connected && (
              <Button
                type="button"
                disabled={change.isPending}
                onClick={() =>
                  change.mutate({ action: provider, mode, secret: null })
                }
              >
                Disconnect
              </Button>
            )}
            <Button
              type="submit"
              variant="primary"
              disabled={!secret || change.isPending}
            >
              Save secret
            </Button>
          </div>
        </form>
        {change.error && (
          <p role="alert" className="text-sm text-destructive">
            {change.error.message}
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
