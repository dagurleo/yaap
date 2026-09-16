import { build } from "esbuild";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { rm } from "node:fs/promises";

const root = fileURLToPath(new URL("../", import.meta.url));
await rm(new URL("../dist", import.meta.url), { recursive: true, force: true });
for (const [entry, format] of [
  ["index", "esm"],
  ["server", "esm"],
  ["script", "iife"],
]) {
  await build({
    absWorkingDir: root,
    entryPoints: [`src/${entry}.ts`],
    outfile: `dist/${entry}.js`,
    bundle: true,
    format,
    platform: "browser",
    target: "es2020",
    minify: entry === "script",
    legalComments: "none",
  });
}
execFileSync(
  process.execPath,
  [
    fileURLToPath(
      new URL("bin/tsc", import.meta.resolve("typescript/package.json")),
    ),
    "--project",
    "tsconfig.json",
    "--emitDeclarationOnly",
  ],
  { cwd: root, stdio: "inherit" },
);
