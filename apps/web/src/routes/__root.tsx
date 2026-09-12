import { ThemeProvider, themeScript } from "@/components/theme-provider";
import { HeaderAccount } from "@/components/account-menu";
import { Button } from "@/components/ui/button";
import { SelfTracking } from "@/components/self-tracking";
import {
  createRootRouteWithContext,
  HeadContent,
  Outlet,
  Scripts,
  Link,
  useMatches,
  useRouterState,
} from "@tanstack/react-router";
import type { QueryClient } from "@tanstack/react-query";
import styles from "../styles.css?url";
export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()(
  {
    head: () => ({
      meta: [
        { charSet: "utf-8" },
        { name: "viewport", content: "width=device-width, initial-scale=1" },
        { title: "Yaap" },
      ],
      links: [
        { rel: "stylesheet", href: styles },
        { rel: "icon", type: "image/svg+xml", href: "/brand/favicon.svg" },
        { rel: "icon", sizes: "any", href: "/brand/favicon.ico" },
        { rel: "apple-touch-icon", href: "/brand/apple-touch-icon.png" },
        {
          rel: "api-catalog",
          href: "/.well-known/api-catalog",
          type: "application/linkset+json",
        },
        {
          rel: "ai-catalog",
          href: "/.well-known/ai-catalog.json",
          type: "application/ai-catalog+json",
        },
        {
          rel: "service-desc",
          href: "/api/v1/openapi.json",
          type: "application/json",
        },
        { rel: "service-doc", href: "/docs/api.md", type: "text/markdown" },
        { rel: "sitemap", href: "/sitemap.xml", type: "application/xml" },
      ],
    }),
    shellComponent: ({ children }) => (
      <html lang="en" suppressHydrationWarning>
        <head>
          <script dangerouslySetInnerHTML={{ __html: themeScript }} />
          <HeadContent />
        </head>
        <body>
          <SelfTracking />
          {children}
          <Scripts />
        </body>
      </html>
    ),
    component: RootLayout,
    notFoundComponent: () => (
      <section>
        <h1>Page not found.</h1>
        <Link to="/app">Back to your websites</Link>
      </section>
    ),
    errorComponent: ({ error, reset }) => (
      <section role="alert">
        <h1>Something went wrong.</h1>
        <p>{error instanceof Error ? error.message : "Please try again."}</p>
        <Button onClick={reset}>Try again</Button>
        <p>
          <Link to="/login">Sign in</Link>
        </p>
      </section>
    ),
  },
);

function RootLayout() {
  const isLanding = useMatches({
    select: (matches) =>
      matches.some((match) =>
        [
          "/",
          "/pricing",
          "/privacy",
          "/terms",
          "/security",
          "/contact",
        ].includes(match.routeId),
      ),
  });
  const isDashboard = useRouterState({
    select: (state) => /^\/app\/[^/]+/.test(state.location.pathname),
  });
  if (isLanding) return <Outlet />;
  return (
    <ThemeProvider>
      <div className={isDashboard ? "dashboard-root" : undefined}>
        <header className="site-header mx-auto flex h-20 max-w-6xl items-center justify-between px-5 sm:px-8">
          <Link
            to="/"
            aria-label="Yaap homepage"
            className="flex items-center gap-2.5 font-semibold"
          >
            <img
              className="dashboard-logo dashboard-logo-light"
              src="/brand/logo-light.svg"
              alt=""
              width="209"
              height="64"
            />
            <img
              className="dashboard-logo dashboard-logo-dark"
              src="/brand/logo-dark.svg"
              alt=""
              width="209"
              height="64"
            />
          </Link>
          {!isDashboard && <HeaderAccount />}
        </header>
        <main className="site-main isolate mx-auto min-h-[75vh] max-w-6xl px-5 pb-14 sm:px-8">
          <Outlet />
        </main>
        {/* <footer className="site-footer mx-auto max-w-6xl px-5 py-6 text-xs text-muted-foreground sm:px-8">
          Your analytics. Your Cloudflare account.
        </footer> */}
      </div>
    </ThemeProvider>
  );
}
