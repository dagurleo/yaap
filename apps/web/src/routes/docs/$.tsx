import { publicSeo } from "@/lib/seo";
import { createFileRoute, notFound } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { RootProvider } from "fumadocs-ui/provider/tanstack";
import { DocsLayout } from "fumadocs-ui/layouts/docs";
import {
  DocsBody,
  DocsDescription,
  DocsPage,
  DocsTitle,
} from "fumadocs-ui/layouts/docs/page";
import defaultMdxComponents from "fumadocs-ui/mdx";
import { useFumadocsLoader } from "fumadocs-core/source/client";
import { Suspense, use } from "react";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/components/theme-provider";
import { docs, source } from "@/lib/docs-source";

const serverLoader = createServerFn({ method: "GET" })
  .validator((slugs: string[]) => slugs)
  .handler(async ({ data }) => {
    const page = source.getPage(data);
    if (!page) throw notFound();
    return {
      path: page.path,
      url: page.url,
      title: page.data.title,
      description: page.data.description,
      pageTree: await source.serializePageTree(source.getPageTree()),
    };
  });

export const Route = createFileRoute("/docs/$")({
  loader: async ({ params }) => {
    const data = await serverLoader({
      data: params._splat?.split("/").filter(Boolean) ?? [],
    });
    await docs.getPage(data.path)?.preload();
    return data;
  },
  head: ({ loaderData, match }) => {
    if (!loaderData)
      return {
        meta: [
          { title: "Guide not found — Yaap" },
          { name: "robots", content: "noindex, follow" },
        ],
      };
    const seo = publicSeo({
      origin: match.context.seoOrigin,
      path: loaderData.url,
      title: `${loaderData.title} — Yaap Docs`,
      description:
        loaderData.description ??
        "Set up Yaap and understand your website analytics.",
      breadcrumbs: [
        { name: "Home", path: "/" },
        { name: "Documentation", path: "/docs" },
        ...(loaderData.url === "/docs"
          ? []
          : [{ name: loaderData.title, path: loaderData.url }]),
      ],
    });
    return {
      ...seo,
      links: [
        ...seo.links,
        {
          rel: "alternate",
          type: "text/markdown",
          href: `${loaderData.url}.md`,
        },
        { rel: "describedby", type: "text/plain", href: "/llms.txt" },
      ],
    };
  },
  component: Documentation,
  notFoundComponent: () => (
    <main className="mx-auto max-w-3xl px-6 py-24">
      <h1 className="text-3xl font-semibold">Guide not found</h1>
      <p className="mt-4">
        <a href="/docs">Return to the documentation</a>
      </p>
    </main>
  ),
});

function ThemeToggle() {
  const { setTheme } = useTheme();
  return (
    <button
      type="button"
      className="docs-theme-toggle"
      aria-label="Switch color theme"
      onClick={() =>
        setTheme(
          document.documentElement.dataset.theme === "dark" ? "light" : "dark",
        )
      }
    >
      <Sun className="hidden size-4 dark:block" aria-hidden="true" />
      <Moon className="size-4 dark:hidden" aria-hidden="true" />
    </button>
  );
}

function Content({ path, url }: { path: string; url: string }) {
  const page = docs.getPage(path)!;
  const { toc } = use(page.load());
  const MDX = page.body;
  return (
    <DocsPage toc={toc}>
      <DocsTitle>{page.title}</DocsTitle>
      <DocsDescription>{page.description}</DocsDescription>
      <div className="flex gap-4 text-sm text-muted-foreground">
        <a href={`${url}.md`}>View as Markdown</a>
        <a href="/llms-full.txt">All docs for LLMs</a>
      </div>
      <DocsBody>
        <MDX components={defaultMdxComponents} />
      </DocsBody>
    </DocsPage>
  );
}

function Documentation() {
  const data = useFumadocsLoader(Route.useLoaderData());
  return (
    <RootProvider
      theme={{ enabled: false }}
      search={{ options: { api: "/docs-search" } }}
    >
      <div className="yaap-docs isolate min-h-dvh antialiased">
        <DocsLayout
          tree={data.pageTree}
          nav={{
            url: "/",
            title: (
              <div className="flex items-center gap-3">
                <img
                  src="/brand/logo-light.svg"
                  alt="Yaap homepage"
                  className="h-7 w-auto dark:hidden"
                  width="209"
                  height="64"
                />
                <img
                  src="/brand/logo-dark.svg"
                  alt="Yaap homepage"
                  className="hidden h-7 w-auto dark:block"
                  width="209"
                  height="64"
                />
                <span className="docs-wordmark-label">Docs</span>
              </div>
            ),
          }}
          links={[{ text: "Open dashboard", url: "/app" }]}
          githubUrl="https://github.com/dagurleo/yaap"
          themeSwitch={{ component: <ThemeToggle /> }}
        >
          <Suspense fallback={<p className="p-8">Loading guide…</p>}>
            <Content path={data.path} url={data.url} />
          </Suspense>
        </DocsLayout>
      </div>
    </RootProvider>
  );
}
