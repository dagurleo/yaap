import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { test } from "node:test";
import { build } from "esbuild";

const mocks = {
  "@tanstack/react-router": `
    import { createElement } from "react";
    let access;
    export const setAccess = (value) => { access = value; };
    export const useRouteContext = () => ({ access });
    export const useMatches = ({ select }) => select([]);
    export const useRouterState = ({ select }) => select({
      location: { pathname: "/app", href: "/app" }, isLoading: true,
    });
    export const useSearch = () => ({});
    export const useRouter = () => ({});
    export const useNavigate = () => () => {};
    export const Link = ({ children, to }) =>
      createElement("a", { href: to }, children);
  `,
  "./queries": `
    export const sitesQuery = () => ({
      queryKey: ["sites"], queryFn: async () => [],
    });
  `,
  "./functions": "export const addSiteFn = async () => {};",
};
const { outputFiles } = await build({
  stdin: {
    contents: `
      import { createElement } from "react";
      import { renderToStaticMarkup } from "react-dom/server";
      import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
      import { setAccess } from "@tanstack/react-router";
      import { DashboardPending } from "./src/features/dashboard/dashboard-pending";
      export function render(access) {
        setAccess(access);
        const client = new QueryClient();
        try {
          return renderToStaticMarkup(createElement(QueryClientProvider,
            { client }, createElement(DashboardPending)));
        } finally {
          client.clear();
        }
      }
    `,
    resolveDir: process.cwd(),
  },
  bundle: true,
  write: false,
  platform: "node",
  format: "cjs",
  packages: "external",
  loader: { ".css": "empty" },
  plugins: [
    {
      name: "dashboard-loading-state",
      setup(builder) {
        builder.onResolve({ filter: /./ }, ({ path, importer }) => {
          if (
            path in mocks &&
            (path.startsWith("@") || importer.includes("/features/dashboard/"))
          )
            return { path, namespace: "mock" };
        });
        builder.onLoad({ filter: /./, namespace: "mock" }, ({ path }) => ({
          contents: mocks[path],
          resolveDir: process.cwd(),
        }));
      },
    },
  ],
});
const mod = { exports: {} };
new Function("require", "module", "exports", outputFiles[0].text)(
  createRequire(import.meta.url),
  mod,
  mod.exports,
);
const { render } = mod.exports;

test("dashboard loading shell renders before the auth guard resolves", () => {
  const html = render(undefined);
  assert.match(html, /Loading websites/);
  assert.doesNotMatch(html, /Add website/);
});

test("dashboard loading shell only offers site creation to account owners", () => {
  for (const user of [null, { ownsAccount: false }]) {
    assert.doesNotMatch(render({ user }), /Add website/);
  }
  assert.match(render({ user: { ownsAccount: true } }), /Add website/);
});
