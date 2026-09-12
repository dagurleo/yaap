import { useRef, useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { KeyRound, Copy, ArrowLeft } from "lucide-react";
import { scopes, type Scope } from "@/lib/api-access";
import { sitesQuery } from "./queries";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { HeaderAccount } from "@/components/account-menu";

type Key = {
  id: string;
  name: string;
  hint: string;
  scopes: Scope[];
  siteIds: string[];
  allSites: boolean;
  expiresAt: number;
  revokedAt: number | null;
  kind: string;
};
type Client = { id: string; name: string; redirectUris: string[] };
type Collection<T> = { data: T[]; pagination?: { nextCursor: string | null } };
async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, init);
  const body = (await response.json()) as T & {
    error_description?: string;
    error?: { message?: string };
  };
  if (!response.ok)
    throw new Error(
      body.error_description ?? body.error?.message ?? "Request failed",
    );
  return body;
}
export function ApiAccess() {
  const client = useQueryClient();
  const { data: sites = [] } = useQuery(sitesQuery());
  const [cursor, setCursor] = useState<string>();
  const keys = useQuery({
    queryKey: ["api-keys", cursor],
    queryFn: () =>
      api<Collection<Key>>(
        "/api/v1/api-keys" +
          (cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""),
      ),
  });
  const clients = useQuery({
    queryKey: ["oauth-clients"],
    queryFn: () => api<Collection<Client>>("/oauth/clients"),
  });
  const [selected, setSelected] = useState<Scope[]>([
    "sites:read",
    "reports:read",
  ]);
  const [siteIds, setSiteIds] = useState<string[]>([]),
    [allSites, setAllSites] = useState(false);
  const [token, setToken] = useState(""),
    [error, setError] = useState(""),
    [status, setStatus] = useState("");
  const [pending, setPending] = useState(false);
  const retry = useRef<{ body: string; id: string } | null>(null);
  async function work(action: () => Promise<void>) {
    setPending(true);
    setError("");
    setStatus("");
    try {
      await action();
    } catch (error) {
      setError(error instanceof Error ? error.message : "Request failed");
    } finally {
      setPending(false);
    }
  }
  function createKey(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget,
      values = new FormData(form);
    void work(async () => {
      const body = JSON.stringify({
        name: values.get("name"),
        expiresAt: Date.parse(String(values.get("expires")) + "T23:59:59Z"),
        scopes: selected,
        allSites,
        siteIds: allSites ? [] : siteIds,
      });
      if (retry.current?.body !== body)
        retry.current = { body, id: crypto.randomUUID() };
      const result = await api<{ data: { token: string } }>(
        "/api/v1/api-keys",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Idempotency-Key": retry.current.id,
          },
          body,
        },
      );
      setToken(result.data.token);
      retry.current = null;
      await client.invalidateQueries({ queryKey: ["api-keys"] });
      setStatus("Credential created. Copy the token before leaving this page.");
    });
  }
  function createClient(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget,
      values = new FormData(form);
    void work(async () => {
      const result = await api<{ data: { client_id: string } }>(
        "/oauth/clients",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: values.get("name"),
            redirectUris: String(values.get("redirectUris"))
              .split("\n")
              .map((s) => s.trim())
              .filter(Boolean),
          }),
        },
      );
      await client.invalidateQueries({ queryKey: ["oauth-clients"] });
      form.reset();
      setStatus(`MCP client registered: ${result.data.client_id}`);
    });
  }
  return (
    <section className="mx-auto max-w-4xl space-y-8 px-4 pt-5 pb-12 sm:px-8">
      <header className="flex items-center justify-between gap-4">
        <Link to="/app" className="inline-flex items-center gap-2 text-sm">
          <ArrowLeft size={16} /> All websites
        </Link>
        <HeaderAccount />
      </header>
      <div>
        <h1 className="flex items-center gap-3 text-2xl font-semibold">
          <KeyRound aria-hidden="true" /> API & MCP access
        </h1>
        <p className="mt-2 text-muted-foreground">
          Connect scripts and agents to your analytics. Choose what each
          connection can read and change.
        </p>
      </div>
      <div className="rounded-xl border bg-card p-5 text-sm">
        <p>
          REST API: <code>/api/v1</code> · MCP: <code>/mcp</code>
        </p>
        <p className="mt-2">
          Use your YAAP installation URL with either path. Personal tokens use
          the <code>Authorization: Bearer</code> header. OAuth clients connect
          through owner consent.
        </p>
        <a
          className="mt-2 inline-block underline"
          href="/api/v1/openapi.json"
          target="_blank"
          rel="noreferrer"
        >
          OpenAPI specification
        </a>
      </div>
      {(error || keys.error || clients.error) && (
        <p
          role="alert"
          className="rounded-lg border border-destructive p-3 text-destructive"
        >
          {error || keys.error?.message || clients.error?.message}
        </p>
      )}
      {status && (
        <p role="status" className="text-sm">
          {status}
        </p>
      )}
      {token && (
        <div className="space-y-3 rounded-xl border bg-card p-5">
          <h2 className="font-semibold">Save your access token</h2>
          <p className="text-sm text-muted-foreground">
            It will not appear in the credential list. Store it in your client’s
            secret settings.
          </p>
          <code className="block break-all rounded bg-muted p-3 text-sm">
            {token}
          </code>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              onClick={() =>
                void work(async () => {
                  await navigator.clipboard.writeText(token);
                  setStatus("Token copied.");
                })
              }
            >
              <Copy size={16} /> Copy token
            </Button>
            <Button variant="ghost" onClick={() => setToken("")}>
              Dismiss
            </Button>
          </div>
        </div>
      )}
      <form
        onSubmit={createKey}
        className="space-y-5 rounded-xl border bg-card p-5"
      >
        <h2 className="text-lg font-semibold">Create a personal token</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Label>
            Name
            <Input
              name="name"
              placeholder="My analytics agent"
              maxLength={120}
              required
            />
          </Label>
          <Label>
            Expires (UTC)
            <Input
              name="expires"
              type="date"
              min={new Date().toISOString().slice(0, 10)}
              max={new Date(Date.now() + 365 * 86400000)
                .toISOString()
                .slice(0, 10)}
              defaultValue={new Date(Date.now() + 90 * 86400000)
                .toISOString()
                .slice(0, 10)}
              required
            />
          </Label>
        </div>
        <fieldset className="space-y-2">
          <legend className="mb-2 font-medium">Websites</legend>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={allSites}
              onChange={(e) => setAllSites(e.target.checked)}
            />{" "}
            All current and future websites
          </label>
          <div className="grid gap-2 sm:grid-cols-2">
            {sites.map((site) => (
              <label
                key={site.id}
                className="flex min-w-0 items-center gap-2 text-sm"
              >
                <input
                  type="checkbox"
                  disabled={allSites}
                  checked={allSites || siteIds.includes(site.id)}
                  onChange={(e) =>
                    setSiteIds(
                      e.target.checked
                        ? [...siteIds, site.id]
                        : siteIds.filter((id) => id !== site.id),
                    )
                  }
                />
                <span className="truncate">{site.name}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <fieldset>
          <legend className="mb-3 font-medium">Permissions</legend>
          <div className="mb-3 flex flex-wrap gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() =>
                setSelected([
                  "sites:read",
                  "reports:read",
                  "goals:read",
                  "funnels:read",
                ])
              }
            >
              Reporting
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setSelected([...scopes])}
            >
              Reporting & management
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setSelected([])}
            >
              Clear
            </Button>
          </div>
          <div className="grid gap-2 sm:grid-cols-3">
            {scopes.map((scope) => (
              <label key={scope} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={selected.includes(scope)}
                  onChange={(e) =>
                    setSelected(
                      e.target.checked
                        ? [...selected, scope]
                        : selected.filter((s) => s !== scope),
                    )
                  }
                />
                {scope}
              </label>
            ))}
          </div>
          <p className="mt-3 text-sm text-muted-foreground">
            Retention permission allows changes that delete expired history.
            Visitor and payment permissions expose individual records.
          </p>
        </fieldset>
        <Button
          type="submit"
          variant="primary"
          disabled={
            pending ||
            !selected.length ||
            (!allSites && !siteIds.length && !selected.includes("sites:create"))
          }
        >
          {pending ? "Working…" : "Create token"}
        </Button>
      </form>
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Credentials</h2>
        {keys.isPending ? (
          <p>Loading credentials…</p>
        ) : !keys.data?.data.length ? (
          <p className="text-muted-foreground">No credentials yet.</p>
        ) : (
          <ul className="divide-y rounded-xl border bg-card">
            {keys.data.data.map((key) => (
              <li
                key={key.id}
                className="flex flex-wrap items-center justify-between gap-3 p-4"
              >
                <div className="min-w-0">
                  <p className="font-medium">
                    {key.name}{" "}
                    <span className="text-xs text-muted-foreground">
                      {key.kind}
                    </span>
                  </p>
                  <p className="break-words text-sm text-muted-foreground">
                    …{key.hint} ·{" "}
                    {key.allSites
                      ? "All websites"
                      : `${key.siteIds.length} websites`}{" "}
                    ·{" "}
                    {key.revokedAt
                      ? "Revoked"
                      : key.expiresAt < Date.now()
                        ? "Expired"
                        : `Expires ${new Date(key.expiresAt).toISOString().slice(0, 10)}`}
                  </p>
                  <details className="mt-1 text-sm">
                    <summary className="cursor-pointer">Permissions</summary>
                    <p className="mt-1 break-words text-muted-foreground">
                      {key.scopes.join(", ")}
                    </p>
                  </details>
                </div>
                {!key.revokedAt && (
                  <Button
                    variant="secondary"
                    disabled={pending}
                    onClick={() =>
                      void work(async () => {
                        await api(`/api/v1/api-keys/${key.id}`, {
                          method: "DELETE",
                        });
                        await client.invalidateQueries({
                          queryKey: ["api-keys"],
                        });
                        setStatus("Credential revoked.");
                      })
                    }
                  >
                    Revoke {key.name}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
        <div className="flex gap-2">
          {cursor && (
            <Button variant="ghost" onClick={() => setCursor(undefined)}>
              First page
            </Button>
          )}
          {keys.data?.pagination?.nextCursor && (
            <Button
              variant="secondary"
              onClick={() => setCursor(keys.data!.pagination!.nextCursor!)}
            >
              Next page
            </Button>
          )}
        </div>
      </section>
      <form
        onSubmit={createClient}
        className="space-y-4 rounded-xl border bg-card p-5"
      >
        <h2 className="text-lg font-semibold">Register an OAuth MCP client</h2>
        <p className="text-sm text-muted-foreground">
          Use this for clients that support OAuth with a configured client ID.
          Copy the exact callback URL from your client. It will ask you to
          approve websites and permissions when connecting.
        </p>
        <Label>
          Client name
          <Input name="name" required maxLength={120} />
        </Label>
        <Label>
          Redirect URIs (one per line)
          <textarea
            name="redirectUris"
            required
            rows={3}
            className="w-full rounded-md border bg-background p-3 text-sm"
            placeholder="https://your-client.example/oauth/callback"
          />
        </Label>
        <Button type="submit" variant="primary" disabled={pending}>
          Register client
        </Button>
      </form>
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Registered MCP clients</h2>
        {clients.isPending ? (
          <p>Loading clients…</p>
        ) : !clients.data?.data.length ? (
          <p className="text-muted-foreground">No OAuth clients registered.</p>
        ) : (
          <ul className="divide-y rounded-xl border bg-card">
            {clients.data.data.map((item) => (
              <li key={item.id} className="space-y-2 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="font-medium">{item.name}</p>
                  <Button
                    variant="secondary"
                    disabled={pending}
                    onClick={() =>
                      void work(async () => {
                        await api(`/oauth/clients/${item.id}`, {
                          method: "DELETE",
                        });
                        await Promise.all([
                          client.invalidateQueries({
                            queryKey: ["oauth-clients"],
                          }),
                          client.invalidateQueries({ queryKey: ["api-keys"] }),
                        ]);
                        setStatus("Client removed and its access revoked.");
                      })
                    }
                  >
                    Remove {item.name}
                  </Button>
                </div>
                <p className="break-all text-sm">
                  Client ID: <code>{item.id}</code>
                </p>
                {item.redirectUris.map((uri) => (
                  <p
                    key={uri}
                    className="break-all text-sm text-muted-foreground"
                  >
                    {uri}
                  </p>
                ))}
              </li>
            ))}
          </ul>
        )}
      </section>
    </section>
  );
}
