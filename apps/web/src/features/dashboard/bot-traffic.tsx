import { useState, type ReactNode } from "react";
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { botCategories, type BotFilters } from "@/lib/bot-traffic";
import { botTrafficQuery } from "./queries";
import { botTokenFn } from "./functions";
import { timestamp } from "./journey-drawer";

function FilterSelect({
  name,
  value,
  onChange,
  children,
}: {
  name: string;
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1 text-base sm:text-sm">
      {name}
      <span className="inline-grid grid-cols-[1fr_--spacing(8)]">
        <select
          name={name}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="col-span-full row-start-1 appearance-none rounded-lg bg-control py-2 pr-8 pl-3 ring-1 ring-input focus-visible:outline-2 focus-visible:outline-ring"
        >
          {children}
        </select>
        <ChevronDown
          aria-hidden="true"
          className="pointer-events-none col-start-2 row-start-1 size-4 place-self-center"
        />
      </span>
    </label>
  );
}
function ReportTable({
  title,
  headings,
  children,
}: {
  title: string;
  headings: string[];
  children: ReactNode;
}) {
  return (
    <section className="min-w-0 space-y-3">
      <h2 className="text-lg font-medium text-balance">{title}</h2>
      <div className="overflow-x-auto">
        <div className="inline-block min-w-full align-middle">
          <table className="w-full text-left text-base sm:text-sm">
            <thead>
              <tr>
                {headings.map((heading) => (
                  <th
                    key={heading}
                    scope="col"
                    className="px-3 py-2 font-medium whitespace-nowrap first:pl-0 last:pr-0"
                  >
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="[&_tr]:border-t [&_tr]:border-border/70 [&_td]:px-3 [&_td]:py-3 [&_td:first-child]:pl-0 [&_td:last-child]:pr-0">
              {children}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
export function BotTraffic({
  siteId,
  filters,
  onChange,
  installationOrigin,
}: {
  siteId: string;
  filters: BotFilters;
  onChange: (filters: BotFilters) => void;
  installationOrigin: string;
}) {
  const { data, error, isFetching, refetch } = useSuspenseQuery(
    botTrafficQuery(siteId, filters),
  );
  const queryClient = useQueryClient();
  const [token, setToken] = useState<string | null>(null);
  const tokenMutation = useMutation({
    mutationFn: (action: "rotate" | "revoke") =>
      botTokenFn({ data: { siteId, action } }),
    onSuccess: (result) => {
      setToken(result.token);
      void queryClient.invalidateQueries({
        queryKey: ["sites", siteId, "bot-traffic"],
      });
    },
  });
  const snippet = `import { trackBotRequest } from "@yaap/client/server";

// In your server middleware, once per incoming request:
trackBotRequest(request, {
  siteId: "${siteId}",
  endpoint: "${installationOrigin}/bot-traffic",
  token: process.env.YAAP_BOT_TOKEN,
}, context); // context provides waitUntil`;
  return (
    <div className="min-w-0 space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <p className="max-w-prose text-base text-pretty text-muted-foreground sm:text-sm">
          See which crawlers request your pages. Bot detections are kept
          separately from visitor analytics.
        </p>
        <Button
          type="button"
          onClick={() => void refetch()}
          disabled={isFetching}
        >
          Refresh
        </Button>
      </div>
      {!data.excludeBots && (
        <p role="status" className="text-base text-pretty sm:text-sm">
          Bot exclusion is off. Bots that run the browser tracker can also
          appear in visitor metrics.{" "}
          <Link
            to="/app/$siteId/settings"
            params={{ siteId }}
            search={{ section: "tracking" }}
            className="underline"
          >
            Review collection controls
          </Link>
          .
        </p>
      )}
      <div className="flex flex-wrap gap-4">
        <FilterSelect
          name="Period"
          value={String(filters.days)}
          onChange={(days) => onChange({ ...filters, days: Number(days) })}
        >
          {[7, 30, 90].map((days) => (
            <option key={days} value={days}>
              Last {days} days
            </option>
          ))}
        </FilterSelect>
        <FilterSelect
          name="Category"
          value={filters.category}
          onChange={(category) => onChange({ ...filters, category })}
        >
          <option value="all">All categories</option>
          {Object.entries(botCategories).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </FilterSelect>
        <FilterSelect
          name="Collection source"
          value={filters.botSource}
          onChange={(botSource) => onChange({ ...filters, botSource })}
        >
          <option value="all">All sources</option>
          <option value="server">Server requests</option>
          <option value="browser">Browser detections</option>
        </FilterSelect>
      </div>
      {error && (
        <p role="alert">Could not refresh bot traffic. Please try again.</p>
      )}
      <div className="@container">
        <dl className="grid grid-cols-1 gap-4 @xs:grid-cols-3">
          {[
            ["Detections", data.totals.requests],
            ["Crawlers", data.totals.crawlers],
            ["HTTP errors", data.totals.errors],
          ].map(([label, value]) => (
            <div key={label}>
              <dt className="truncate text-base font-medium sm:text-sm">
                {label}
              </dt>
              <dd className="pt-1 text-3xl tabular-nums">
                {Number(value).toLocaleString()}
              </dd>
            </div>
          ))}
        </dl>
      </div>
      <p className="text-base text-pretty text-muted-foreground sm:text-sm">
        {data.from} – {data.to} · {data.site.timezone}. Counts are detections,
        not unique visitors. A crawler may trigger both server and browser
        tracking.
      </p>
      {Number(data.totals.requests) === 0 ? (
        <section className="space-y-2 border-y border-border/70 py-8">
          <h2 className="text-lg font-medium text-balance">
            No bot traffic in this view
          </h2>
          <p className="max-w-prose text-base text-pretty text-muted-foreground sm:text-sm">
            Choose another category or period, or install server tracking below.
            Most crawlers never run the browser tracker.
          </p>
        </section>
      ) : (
        <>
          <div className="grid min-w-0 gap-8 xl:grid-cols-2">
            <ReportTable
              title="Crawlers"
              headings={["Crawler", "Category", "Detections"]}
            >
              {data.crawlers.map((row) => (
                <tr key={row.name}>
                  <td>
                    <p className="font-medium">{row.name}</p>
                    <p className="text-muted-foreground">{row.provider}</p>
                  </td>
                  <td>{botCategories[row.category]}</td>
                  <td className="tabular-nums">
                    {Number(row.requests).toLocaleString()}
                  </td>
                </tr>
              ))}
            </ReportTable>
            <ReportTable
              title="Top requested pages"
              headings={["Page", "Detections"]}
            >
              {data.pages.map((row) => (
                <tr key={row.path}>
                  <td className="max-w-xs break-all">{row.path}</td>
                  <td className="tabular-nums">
                    {Number(row.requests).toLocaleString()}
                  </td>
                </tr>
              ))}
            </ReportTable>
          </div>
          <ReportTable
            title="Latest detections"
            headings={[
              "Time",
              "Crawler",
              "Page",
              "Status",
              "Source",
              "Detection",
            ]}
          >
            {data.recent.map((row) => (
              <tr key={row.id}>
                <td className="whitespace-nowrap tabular-nums">
                  {timestamp(row.receivedAt, data.site.timezone)}
                </td>
                <td>{row.name}</td>
                <td className="min-w-40 max-w-xs break-all">{row.path}</td>
                <td className="tabular-nums">{row.statusCode ?? "Unknown"}</td>
                <td>{row.source === "server" ? "Server" : "Browser"}</td>
                <td>
                  {row.detection === "cloudflare"
                    ? "Cloudflare verified bot"
                    : "User agent · unverified"}
                </td>
              </tr>
            ))}
          </ReportTable>
          <p className="text-base text-pretty text-muted-foreground sm:text-sm">
            Showing the top 50 crawlers, top 20 pages, and latest 50 detections.
            User agents can be spoofed; category labels describe a crawler’s
            stated purpose. Cloudflare verification confirms bot traffic, not
            the claimed provider.
          </p>
        </>
      )}
      <details
        className="space-y-4 border-t border-border/70 pt-4"
        open={data.recent.length === 0 && !data.tokenConfigured}
      >
        <summary className="cursor-pointer py-2 font-medium">
          Install server tracking
        </summary>
        <p className="max-w-prose text-base text-pretty sm:text-sm">
          Install @yaap/client, then add one tracking call to your backend. Keep
          the token in a server environment variable. Query strings, cookies, IP
          addresses, and visitor identifiers are not stored.
        </p>
        {data.canManage ? (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-3">
              <Button
                type="button"
                size="sm"
                disabled={tokenMutation.isPending}
                onClick={() => tokenMutation.mutate("rotate")}
              >
                {data.tokenConfigured ? "Replace token" : "Create token"}
              </Button>
              {data.tokenConfigured && (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={tokenMutation.isPending}
                  onClick={() => tokenMutation.mutate("revoke")}
                >
                  Revoke token
                </Button>
              )}
            </div>
            <p className="text-base text-pretty text-muted-foreground sm:text-sm">
              Replacing or revoking a token immediately stops requests using the
              previous token.
            </p>
            {tokenMutation.isError && (
              <p role="alert">Could not update the token. Please try again.</p>
            )}
            {token && (
              <div role="status" className="space-y-2">
                <p>Copy this token now. It is only shown once.</p>
                <pre className="overflow-x-auto rounded-lg bg-muted p-3">
                  {token}
                </pre>
              </div>
            )}
            {tokenMutation.isSuccess && !token && (
              <p role="status">Token revoked.</p>
            )}
          </div>
        ) : (
          <p>Ask the website owner to create a bot tracking token.</p>
        )}
        <pre className="overflow-x-auto rounded-lg bg-muted p-4 text-sm">
          {snippet}
        </pre>
        <p className="text-base text-pretty sm:text-sm">
          Bot history is retained for up to 90 days, or your shorter event
          retention setting.{" "}
          <Link
            to="/docs/$"
            params={{ _splat: "bot-traffic" }}
            className="underline"
          >
            Full setup guide and HTTP API
          </Link>
          .
        </p>
      </details>
    </div>
  );
}
