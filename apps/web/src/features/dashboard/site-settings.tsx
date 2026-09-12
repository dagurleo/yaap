import { TimezoneSelect } from "./timezone-select";
import { Suspense, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import {
  ArrowLeft,
  ArrowUpRight,
  Check,
  Code2,
  Copy,
  Globe2,
  Settings2,
  ShieldCheck,
  Database,
  Activity,
  CircleDollarSign,
  X,
  Plus,
  UsersRound,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { WebsiteLayout } from "./website-layout";
import { operationsQuery, paymentSettingsQuery, peopleQuery } from "./queries";
import {
  saveSiteDetailsFn,
  saveTrackingRulesFn,
  saveOperationsFn,
  inviteViewerFn,
  removeViewerFn,
  resendInvitationFn,
  revokeInvitationFn,
} from "./functions";
import { PaymentSettings } from "./payment-settings";
import { IngestionSettings } from "./ingestion-settings";
import { FunnelSelect } from "./funnel-editor";
import { retentionOptions, type OperationsSettings } from "@/lib/operations";
import { validateTrackingRules, type TrackingRules } from "@/lib/site-settings";
import "./site-settings.css";

export const settingsSections = [
  {
    id: "general",
    label: "General",
    icon: Settings2,
    description: "The essentials for your website.",
  },
  {
    id: "people",
    label: "People",
    icon: UsersRound,
    description: "Choose who can view this website's analytics.",
  },
  {
    id: "installation",
    label: "Installation",
    icon: Code2,
    description: "Connect your website and start collecting visits.",
  },
  {
    id: "revenue",
    label: "Revenue",
    icon: CircleDollarSign,
    description: "Connect payments to see what brings in revenue.",
  },
  {
    id: "tracking",
    label: "Domains & exclusions",
    icon: ShieldCheck,
    description: "Choose where your data comes from and what to leave out.",
  },
  {
    id: "retention",
    label: "Data retention",
    icon: Database,
    description: "Choose how long to keep your analytics history.",
  },
  {
    id: "ingestion",
    label: "Ingestion",
    icon: Activity,
    description: "Check the health of your incoming events.",
  },
] as const;
export type SettingsSection = (typeof settingsSections)[number]["id"];

function Panel({
  title,
  description,
  children,
  footer,
}: {
  title: string;
  description: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <section className="settings-panel">
      <header>
        <h3>{title}</h3>
        <p>{description}</p>
      </header>
      <div className="settings-panel-body">{children}</div>
      {footer && <footer>{footer}</footer>}
    </section>
  );
}
function SaveState({ error, saved }: { error?: Error | null; saved: boolean }) {
  return (
    <div aria-live="polite" className="settings-save-state">
      {error ? (
        <p role="alert" className="text-destructive">
          {error.message}
        </p>
      ) : saved ? (
        <span className="flex items-center gap-2">
          <Check size={16} aria-hidden="true" /> Changes saved
        </span>
      ) : null}
    </div>
  );
}
function Toggle({
  id,
  checked,
  onChange,
  label,
  description,
}: {
  id: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
  description: string;
}) {
  return (
    <div className="settings-toggle-row">
      <label htmlFor={id}>
        <span>{label}</span>
        <p>{description}</p>
      </label>
      <div className="settings-switch">
        <input
          id={id}
          type="checkbox"
          role="switch"
          checked={checked}
          onChange={(event) => onChange(event.target.checked)}
        />
        <span aria-hidden="true" />
      </div>
    </div>
  );
}
function CodeBlock({
  code,
  label = "Copy code",
}: {
  code: string;
  label?: string;
}) {
  const [message, setMessage] = useState("");
  return (
    <div className="settings-code-wrap">
      <div className="settings-code">
        <pre>
          <code>{code}</code>
        </pre>
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label={label}
          title={label}
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(code);
              setMessage("Copied to clipboard");
            } catch {
              setMessage("Could not copy. Select and copy the code manually.");
            }
          }}
        >
          {message === "Copied to clipboard" ? <Check /> : <Copy />}
        </Button>
      </div>
      {message && (
        <p role="status" className="settings-code-message">
          {message}
        </p>
      )}
    </div>
  );
}
export function SiteSettings({
  siteId,
  section,
  appOrigin,
}: {
  siteId: string;
  section: SettingsSection;
  appOrigin: string;
}) {
  const { data } = useSuspenseQuery(operationsQuery(siteId));
  const current = settingsSections.find((item) => item.id === section)!;
  return (
    <WebsiteLayout selectedSiteId={siteId} title="Website settings">
      <div className="site-settings">
        <header className="settings-heading">
          <Link
            to="/app/$siteId/overview"
            params={{ siteId }}
            search={{ days: 7 }}
            className="settings-back"
          >
            <ArrowLeft size={16} aria-hidden="true" /> Back to overview
          </Link>
          <p>
            Manage tracking, integrations, and data for{" "}
            <span className="text-foreground">
              {data.site.origin.replace(/^https?:\/\//, "")}
            </span>
            .
          </p>
        </header>
        <div className="settings-layout">
          <nav className="settings-nav" aria-label="Website settings">
            <div className="settings-nav-label">Configuration</div>
            {settingsSections.map((item) => (
              <Link
                key={item.id}
                to="/app/$siteId/settings"
                params={{ siteId }}
                search={{ section: item.id }}
                aria-current={section === item.id ? "page" : undefined}
              >
                <item.icon size={16} aria-hidden="true" />
                <span>{item.label}</span>
              </Link>
            ))}
            <div className="settings-nav-note">
              <Globe2 size={16} aria-hidden="true" />
              <span>Changes apply only to this website.</span>
            </div>
          </nav>
          <div className="settings-main">
            <div className="settings-section-heading">
              <h2>{current.label}</h2>
              <p>{current.description}</p>
            </div>
            <div hidden={section !== "general"}>
              <GeneralSettings site={data.site} />
            </div>
            {section === "people" && (
              <Suspense fallback={<p role="status">Loading people…</p>}>
                <PeopleSettings siteId={siteId} />
              </Suspense>
            )}
            <div hidden={section !== "installation"}>
              <Button asChild size="sm" className="mb-4">
                <Link to="/app/$siteId/setup" params={{ siteId }}>
                  Check installation
                </Link>
              </Button>
              <Installation siteId={siteId} appOrigin={appOrigin} />
            </div>
            {section === "revenue" && (
              <Suspense
                fallback={<p role="status">Loading payment settings…</p>}
              >
                <RevenueSettings siteId={siteId} appOrigin={appOrigin} />
              </Suspense>
            )}
            <div hidden={section !== "tracking"}>
              <TrackingSettings
                siteId={siteId}
                initial={data.site.trackingRules}
                excludeBots={data.site.excludeBots}
              />
            </div>
            <div hidden={section !== "retention"}>
              <RetentionSettings siteId={siteId} initial={data.site} />
            </div>
            {section === "ingestion" && <IngestionSettings siteId={siteId} />}
          </div>
        </div>
      </div>
    </WebsiteLayout>
  );
}

function PeopleSettings({ siteId }: { siteId: string }) {
  const { data } = useSuspenseQuery(peopleQuery(siteId));
  const client = useQueryClient();
  const [message, setMessage] = useState("");
  const refresh = () =>
    client.invalidateQueries({ queryKey: ["sites", siteId, "people"] });
  const invite = useMutation({
    mutationFn: (email: string) => inviteViewerFn({ data: { siteId, email } }),
    onSuccess: async (result) => {
      setMessage(
        result.status === "already_has_access"
          ? "This person already has access."
          : "Invitation sent.",
      );
      await refresh();
    },
  });
  const action = useMutation({
    mutationFn: async (
      input:
        | { kind: "resend"; invitationId: string }
        | { kind: "revoke"; invitationId: string }
        | { kind: "remove"; userId: string },
    ) => {
      if (input.kind === "resend")
        return resendInvitationFn({
          data: { siteId, invitationId: input.invitationId },
        });
      if (input.kind === "revoke")
        return revokeInvitationFn({
          data: { siteId, invitationId: input.invitationId },
        });
      return removeViewerFn({ data: { siteId, userId: input.userId } });
    },
    onSuccess: refresh,
  });
  const error = invite.error ?? action.error;
  return (
    <div className="settings-stack">
      <Panel
        title="Invite a viewer"
        description="Viewers can view all analytics for this website, including visitor details and revenue. They cannot change settings or invite other people."
      >
        {data.emailConfigured ? (
          <form
            className="people-invite-form"
            onSubmit={async (event) => {
              event.preventDefault();
              setMessage("");
              const form = event.currentTarget;
              const email = String(new FormData(form).get("email") ?? "");
              const result = await invite.mutateAsync(email).catch(() => null);
              if (result?.status === "sent") form.reset();
            }}
          >
            <Label htmlFor="viewer-email">
              Email address
              <Input
                id="viewer-email"
                name="email"
                type="email"
                autoComplete="email"
                placeholder="teammate@example.com"
                required
              />
            </Label>
            <div className="people-invite-action">
              <span className="website-viewer-badge">Viewer</span>
              <Button
                type="submit"
                variant="primary"
                disabled={invite.isPending}
              >
                {invite.isPending ? "Sending…" : "Send invitation"}
              </Button>
            </div>
          </form>
        ) : (
          <div className="settings-notice">
            <p>
              Email sending is not configured. Add the EMAIL binding and
              EMAIL_FROM before inviting viewers.
            </p>
          </div>
        )}
        {(message || error) && (
          <p
            className={error ? "text-destructive" : undefined}
            role={error ? "alert" : "status"}
          >
            {error instanceof Error ? error.message : message}
          </p>
        )}
      </Panel>
      <Panel
        title="People with access"
        description={`Access listed here applies only to ${data.site.name}.`}
      >
        <ul className="people-list" role="list">
          <li>
            <div className="people-identity">
              <strong>{data.owner.name}</strong>
              <p>{data.owner.email}</p>
            </div>
            <span className="people-role">Owner</span>
          </li>
          {data.members.map((member) => (
            <li key={member.userId}>
              <div className="people-identity">
                <strong>{member.name}</strong>
                <p>{member.email}</p>
              </div>
              <div className="people-row-actions">
                <span className="website-viewer-badge">Viewer</span>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  aria-label={`Remove ${member.name} from ${data.site.name}`}
                  title="Remove access"
                  disabled={action.isPending}
                  onClick={() => {
                    if (
                      window.confirm(
                        `Remove ${member.email} from ${data.site.name}? They will lose access to this website only.`,
                      )
                    )
                      action.mutate({ kind: "remove", userId: member.userId });
                  }}
                >
                  <Trash2 aria-hidden="true" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      </Panel>
      {data.invitations.length > 0 && (
        <Panel
          title="Invitations"
          description="Pending and recent invitations for this website."
        >
          <ul className="people-list" role="list">
            {data.invitations.map((invitation) => (
              <li key={invitation.id}>
                <div className="people-identity">
                  <strong>{invitation.email}</strong>
                  <p>
                    {invitation.status === "pending"
                      ? invitation.sendStatus === "sent"
                        ? `Sent ${new Date(invitation.lastSentAt ?? invitation.createdAt).toLocaleDateString()}`
                        : invitation.sendStatus === "failed"
                          ? "Sending failed"
                          : invitation.sendStatus === "unknown"
                            ? "Delivery not confirmed"
                            : "Sending"
                      : invitation.status === "expired"
                        ? "Expired"
                        : "Revoked"}
                  </p>
                </div>
                {(invitation.status === "pending" ||
                  invitation.status === "expired") && (
                  <div className="people-row-actions">
                    <Button
                      size="sm"
                      disabled={action.isPending}
                      onClick={() =>
                        action.mutate({
                          kind: "resend",
                          invitationId: invitation.id,
                        })
                      }
                    >
                      <RefreshCw aria-hidden="true" /> Resend
                    </Button>
                    {invitation.status === "pending" && (
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={action.isPending}
                        onClick={() =>
                          action.mutate({
                            kind: "revoke",
                            invitationId: invitation.id,
                          })
                        }
                      >
                        Revoke
                      </Button>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </div>
  );
}
function GeneralSettings({
  site,
}: {
  site: { id: string; name: string; origin: string; timezone: string };
}) {
  const [name, setName] = useState(site.name),
    [origin, setOrigin] = useState(site.origin),
    [timezone, setTimezone] = useState(site.timezone);
  const client = useQueryClient();
  const mutation = useMutation({
    mutationFn: () =>
      saveSiteDetailsFn({ data: { siteId: site.id, name, origin, timezone } }),
    onSuccess: async (value) => {
      setName(value.name);
      setOrigin(value.origin);
      setTimezone(value.timezone);
      await client.invalidateQueries({ queryKey: ["sites"] });
    },
  });
  const dirty =
    name !== site.name || origin !== site.origin || timezone !== site.timezone;
  return (
    <div className="settings-stack">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          mutation.mutate();
        }}
      >
        <Panel
          title="Website identity"
          description="A familiar name and the main origin you want to track."
          footer={
            <>
              <SaveState
                error={mutation.error}
                saved={mutation.isSuccess && !dirty}
              />
              <Button
                type="submit"
                variant="primary"
                disabled={!dirty || mutation.isPending}
              >
                {mutation.isPending ? "Saving…" : "Save changes"}
              </Button>
            </>
          }
        >
          <fieldset disabled={mutation.isPending} className="settings-fields">
            <Label htmlFor="website-name">
              Website name
              <Input
                id="website-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                maxLength={120}
                required
              />
            </Label>
            <Label htmlFor="website-origin">
              Website origin
              <Input
                id="website-origin"
                type="url"
                value={origin}
                onChange={(event) => setOrigin(event.target.value)}
                maxLength={512}
                required
              />
              <small>
                Include https://, without a path. Add other origins in Domains &
                exclusions.
              </small>
            </Label>
            <TimezoneSelect value={timezone} onChange={setTimezone} />
            {origin !== site.origin && (
              <p className="settings-notice">
                Changing the origin stops collection from {site.origin} unless
                you add it as an additional origin.
              </p>
            )}
          </fieldset>
        </Panel>
      </form>
      <Panel
        title="Website ID"
        description="Your public identifier connects this website to the tracking script."
      >
        <CodeBlock code={site.id} label="Copy website ID" />
      </Panel>
    </div>
  );
}
export function Installation({
  siteId,
  appOrigin,
  compact = false,
}: {
  siteId: string;
  appOrigin: string;
  compact?: boolean;
}) {
  const [tab, setTab] = useState("script");
  const [mode, setMode] = useState("full");
  const options =
    mode === "paused"
      ? '\n  data-tracking="paused"\n  data-identifiers="false"'
      : mode === "anonymous"
        ? '\n  data-identifiers="false"'
        : "";
  const snippet = `<script\n  defer\n  src="${appOrigin}/script.js"\n  data-site-id="${siteId}"${options}\n></script>`;
  const npmOptions =
    mode === "paused"
      ? '\n  tracking: "paused",\n  identifiers: false,'
      : mode === "anonymous"
        ? "\n  identifiers: false,"
        : "";
  const npmSnippet = `import { init } from "@yaap/client";\n\nconst analytics = init({\n  siteId: ${JSON.stringify(siteId)},\n  host: ${JSON.stringify(appOrigin)},${npmOptions}\n});`;
  const api = tab === "npm" ? "analytics" : "window.osAnalytics";
  return (
    <div className="settings-stack">
      <Panel
        title="Install tracking"
        description={
          tab === "npm"
            ? "Install the package and initialize it once in your website’s browser code."
            : "Add this snippet once, inside the <head> of every page you want to track."
        }
      >
        <div
          className="settings-install-tabs"
          role="group"
          aria-label="Installation guide"
        >
          {[
            ["script", "Script"],
            ["npm", "npm"],
            ["wordpress", "WordPress"],
            ["shopify", "Shopify"],
          ].map(([id, label]) => (
            <button
              type="button"
              key={id}
              aria-pressed={tab === id}
              onClick={() => setTab(id)}
            >
              {label}
            </button>
          ))}
        </div>
        {tab === "npm" && (
          <>
            <CodeBlock
              code="npm install @yaap/client"
              label="Copy npm install command"
            />
            <p>
              Your website ID and this Yaap server’s URL are filled in below.
              Use one installation method per page to avoid initializing the
              tracker twice.
            </p>
          </>
        )}
        {tab === "wordpress" && (
          <p>
            Use a header script plugin or your theme’s header to insert the
            snippet site-wide. Avoid adding it more than once.
          </p>
        )}
        {tab === "shopify" && (
          <p>
            In your theme’s code editor, open layout/theme.liquid and paste this
            before the closing &lt;/head&gt; tag. This tracks storefront pages
            where the theme is rendered.
          </p>
        )}
        <Label htmlFor="tracking-mode">
          Tracking mode
          <FunnelSelect
            id="tracking-mode"
            value={mode}
            onChange={(event) => setMode(event.target.value)}
          >
            <option value="full">Full analytics (default)</option>
            <option value="anonymous">Anonymous analytics</option>
            <option value="paused">Wait for consent</option>
          </FunnelSelect>
        </Label>
        <p>
          This updates the snippet below. Install the updated snippet on your
          website to apply this choice.
        </p>
        <CodeBlock
          key={tab === "npm" ? npmSnippet : snippet}
          code={tab === "npm" ? npmSnippet : snippet}
          label={
            tab === "npm" ? "Copy npm initialization" : "Copy tracking snippet"
          }
        />
        {tab === "npm" && (
          <p>
            In React, call init inside useEffect and return a cleanup function
            that calls analytics?.destroy(). Keep the returned analytics
            instance for the controls and custom events below.
          </p>
        )}
        <div className="settings-inline-note">
          <ShieldCheck size={16} aria-hidden="true" />
          <p>
            {mode === "full"
              ? "Visitor and session tracking is enabled by default. Configure consent and privacy controls to suit your website."
              : mode === "anonymous"
                ? "Collect pageviews and custom events without visitor or session identifiers. Visitor journeys, returning visitors, and visitor-based attribution are unavailable."
                : "No events are sent and no visitor/session storage is accessed until your integration resumes tracking."}
          </p>
        </div>
      </Panel>
      {!compact && (
        <>
          <Panel
            title="Connect your consent banner"
            description="Use the Wait for consent snippet above to block collection before the first event."
          >
            <CodeBlock
              code={`// After consent is granted\n${api}?.setIdentifiers(true);\n${api}?.resume();\n\n// When consent is withdrawn\n${api}?.pause();\n${api}?.setIdentifiers(false);`}
            />
            <p>
              {tab === "npm"
                ? "Call after init and restore the visitor’s choice on every page load."
                : "Call after the tracking script has loaded and restore the visitor’s choice on every page load."}{" "}
              Resuming tracks the current page; activity while paused is never
              replayed.
            </p>
          </Panel>
          <Panel
            title="Control identifiers independently"
            description="Switch to anonymous collection while keeping pageviews and custom events running."
          >
            <CodeBlock
              code={`${api}?.setIdentifiers(false); // Clear this site's stored IDs\n${api}?.setIdentifiers(true);  // Enable IDs for future events`}
            />
            <p>
              Changing identifiers does not pause or resume collection. Your
              integration controls both settings.
            </p>
          </Panel>
          <Panel
            title="Track a custom event"
            description="Measure meaningful actions such as signups, downloads, or purchases."
          >
            <CodeBlock code={`${api}?.track("signup", { plan: "pro" });`} />
            <Button asChild size="sm">
              <Link
                to="/app/$siteId/events"
                search={{ days: 7 }}
                params={{ siteId }}
              >
                View recent events <ArrowUpRight aria-hidden="true" />
              </Link>
            </Button>
          </Panel>
        </>
      )}
    </div>
  );
}
function RevenueSettings({
  siteId,
  appOrigin,
}: {
  siteId: string;
  appOrigin: string;
}) {
  const { data } = useSuspenseQuery(paymentSettingsQuery(siteId));
  const [open, setOpen] = useState(false);
  return (
    <div className="settings-stack">
      <Panel
        title="Payment integrations"
        description="Attribute revenue to the visits and campaigns that bring customers to your website."
        footer={
          <>
            <p>Keep live and test payments separate.</p>
            <Button id="configure-payments" onClick={() => setOpen(true)}>
              Configure payments <ArrowUpRight />
            </Button>
          </>
        }
      >
        <div className="settings-integration">
          <div>
            <h4>Stripe</h4>
            <p>Receive payments and refunds through a webhook.</p>
          </div>
          <div className="settings-status">
            {data.stripeLive
              ? "Live connected"
              : data.stripeTest
                ? "Test connected"
                : "Not connected"}
          </div>
        </div>
        <div className="settings-integration">
          <div>
            <h4>Server API</h4>
            <p>Send payments directly from your backend.</p>
          </div>
          <div className="settings-status">
            {data.apiKeyHint
              ? `Key ending ${data.apiKeyHint}`
              : "No key created"}
          </div>
        </div>
      </Panel>
      <Panel
        title="Payment endpoint"
        description="Use a server API key to authenticate payment requests. Never expose it in browser code."
      >
        <CodeBlock code={`POST ${appOrigin}/payments/${siteId}`} />
      </Panel>
      {open && (
        <PaymentSettings
          siteId={siteId}
          onClose={() => setOpen(false)}
          restoreFocus={() =>
            document.getElementById("configure-payments")?.focus()
          }
        />
      )}
    </div>
  );
}
function RuleList({
  label,
  description,
  values,
  onChange,
  placeholder,
  normalize = (value) => value,
}: {
  label: string;
  description: string;
  values: string[];
  onChange: (values: string[]) => void;
  placeholder: string;
  normalize?: (value: string) => string;
}) {
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const id = label.toLowerCase().replaceAll(" ", "-");
  function add() {
    const next = normalize(draft.trim());
    if (!next) return;
    if (values.includes(next)) {
      setError("This rule is already in the list.");
      return;
    }
    onChange([...values, next]);
    setDraft("");
    setError("");
  }
  return (
    <div className="settings-rule-list">
      <Label htmlFor={id}>{label}</Label>
      <p>{description}</p>
      {values.length > 0 && (
        <ul role="list">
          {values.map((value) => (
            <li key={value}>
              <code>{value}</code>
              <Button
                size="icon-sm"
                variant="ghost"
                aria-label={`Remove ${value}`}
                onClick={() =>
                  onChange(values.filter((item) => item !== value))
                }
              >
                <X />
              </Button>
            </li>
          ))}
        </ul>
      )}
      <div className="settings-add-row">
        <Input
          id={id}
          placeholder={placeholder}
          value={draft}
          maxLength={512}
          onChange={(event) => {
            setDraft(event.target.value);
            setError("");
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              add();
            }
          }}
        />
        <Button
          size="sm"
          disabled={!draft.trim() || values.length >= 50}
          onClick={add}
        >
          <Plus /> Add
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
function TrackingSettings({
  siteId,
  initial,
  excludeBots,
}: {
  siteId: string;
  initial: TrackingRules;
  excludeBots: boolean;
}) {
  const [rules, setRules] = useState(initial),
    [bots, setBots] = useState(excludeBots);
  const client = useQueryClient();
  const mutation = useMutation({
    mutationFn: async () => {
      const validated = validateTrackingRules(rules);
      await saveTrackingRulesFn({
        data: { siteId, rules: validated, excludeBots: bots },
      });
      setRules(validated);
    },
    onSuccess: () => client.invalidateQueries({ queryKey: ["sites"] }),
  });
  const dirty =
    JSON.stringify(rules) !== JSON.stringify(initial) || bots !== excludeBots;
  const change = (value: Partial<TrackingRules>) => {
    mutation.reset();
    setRules((current) => ({ ...current, ...value }));
  };
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        mutation.mutate();
      }}
    >
      <fieldset disabled={mutation.isPending} className="settings-stack">
        <Panel
          title="Allowed domains"
          description="Your main origin is always allowed. Explicitly add each extra origin, including subdomains."
        >
          <Toggle
            id="allow-all-domains"
            label="Allow all domains"
            description="Accept events from any HTTP or HTTPS origin. Useful for embedded widgets and customer domains."
            checked={rules.allowAllDomains}
            onChange={(allowAllDomains) => change({ allowAllDomains })}
          />
          <RuleList
            label="Additional origins"
            description="Include the protocol and port, if any. HTTPS is used when you enter a bare domain."
            values={rules.additionalOrigins}
            onChange={(additionalOrigins) => change({ additionalOrigins })}
            placeholder="https://app.example.com"
            normalize={(value) =>
              value && !value.includes("://") ? `https://${value}` : value
            }
          />
        </Panel>
        <Panel
          title="Traffic exclusions"
          description="These rules apply to new events and live presence. Existing analytics history is kept."
        >
          <Toggle
            id="exclude-bots"
            label="Exclude known bots"
            description="Filter known crawlers, automated tools, and verified bots."
            checked={bots}
            onChange={(value) => {
              mutation.reset();
              setBots(value);
            }}
          />
          <RuleList
            label="Excluded paths"
            description="Use * to match any characters. /admin/* excludes pages under /admin/."
            values={rules.excludedPaths}
            onChange={(excludedPaths) => change({ excludedPaths })}
            placeholder="/admin/*"
          />
          <RuleList
            label="Excluded hostnames"
            description="Exact hostnames only. An exclusion takes precedence over allowed domains."
            values={rules.excludedHostnames}
            onChange={(excludedHostnames) => change({ excludedHostnames })}
            placeholder="staging.example.com"
            normalize={(value) => value.toLowerCase()}
          />
        </Panel>
      </fieldset>
      <div className="settings-form-footer">
        <SaveState
          error={mutation.error}
          saved={mutation.isSuccess && !dirty}
        />
        <Button
          type="submit"
          variant="primary"
          disabled={!dirty || mutation.isPending}
        >
          {mutation.isPending ? "Saving…" : "Save tracking rules"}
        </Button>
      </div>
    </form>
  );
}
function RetentionSettings({
  siteId,
  initial,
}: {
  siteId: string;
  initial: OperationsSettings;
}) {
  const [events, setEvents] = useState(initial.eventRetentionDays),
    [payments, setPayments] = useState(initial.paymentRetentionDays);
  const client = useQueryClient();
  const mutation = useMutation({
    mutationFn: () =>
      saveOperationsFn({
        data: {
          siteId,
          settings: {
            ...initial,
            eventRetentionDays: events,
            paymentRetentionDays: payments,
          },
        },
      }),
    onSuccess: () => client.invalidateQueries({ queryKey: ["sites"] }),
  });
  const dirty =
    events !== initial.eventRetentionDays ||
    payments !== initial.paymentRetentionDays;
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        mutation.mutate();
      }}
    >
      <Panel
        title="Keep the history you need"
        description="Set independent retention periods for analytics events and payments."
        footer={
          <>
            <SaveState
              error={mutation.error}
              saved={mutation.isSuccess && !dirty}
            />
            <Button
              type="submit"
              variant="primary"
              disabled={!dirty || mutation.isPending}
            >
              {mutation.isPending ? "Saving…" : "Save retention"}
            </Button>
          </>
        }
      >
        <fieldset disabled={mutation.isPending} className="settings-fields">
          {[
            {
              id: "event-retention",
              label: "Event history",
              value: events,
              set: setEvents,
            },
            {
              id: "payment-retention",
              label: "Payment history",
              value: payments,
              set: setPayments,
            },
          ].map((field) => (
            <Label key={field.id} htmlFor={field.id}>
              {field.label}
              <FunnelSelect
                id={field.id}
                value={field.value}
                onChange={(event) => field.set(Number(event.target.value))}
              >
                {retentionOptions.map((days) => (
                  <option key={days} value={days}>
                    {days ? `${days} days` : "Keep indefinitely"}
                  </option>
                ))}
              </FunnelSelect>
            </Label>
          ))}
        </fieldset>
        {(events > 0 || payments > 0) && (
          <p className="settings-notice">
            Hourly cleanup permanently deletes records older than the selected
            period. This changes historical reports and attribution. Increasing
            retention later cannot restore deleted records.
          </p>
        )}
      </Panel>
    </form>
  );
}
