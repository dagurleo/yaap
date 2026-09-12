import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import { cloudflare } from "@cloudflare/vite-plugin";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";
export default defineConfig(({ command, isPreview }) => ({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  plugins: [
    tailwindcss(),
    cloudflare({
      // Cloudflare provisions the root template. Local development keeps its
      // own database state and .dev.vars in this workspace.
      configPath:
        command === "build" || isPreview
          ? "../../wrangler.jsonc"
          : "wrangler.jsonc",
      viteEnvironment: { name: "ssr" },
    }),
    tanstackStart(),
    react(),
  ],
}));
