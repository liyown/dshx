import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig(({ mode, isPreview }) => ({
  envPrefix: ["VITE_", "GOOGLE_SITE_VERIFICATION", "BING_SITE_VERIFICATION"],
  resolve: {
    tsconfigPaths: true,
    ...(mode === "test"
      ? { alias: { "cloudflare:workers": "/src/test/cloudflare-workers.ts" } }
      : {}),
  },
  plugins: [
    ...(mode === "test"
      ? []
      : [
          cloudflare({
            viteEnvironment: { name: "ssr" },
            // `db:migrate:preview` and `db:seed:preview` write to this state
            // directory, so the production-like preview must read the same D1.
            ...(isPreview ? { persistState: { path: ".wrangler/preview-state" } } : {}),
          }),
        ]),
    tanstackStart({ server: { entry: "server" } }),
    tailwindcss(),
    react(),
  ],
}));
