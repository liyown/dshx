import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

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
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          include: ["src/**/*.test.{ts,tsx}"],
          exclude: ["**/*.integration.test.ts"],
        },
      },
      {
        extends: true,
        test: {
          name: "integration",
          include: ["src/**/*.integration.test.ts"],
          // Each suite boots Miniflare and migrates nothing — it copies a
          // migrated template — but the first query on a cold database still
          // takes seconds under load. The default 5s turned that into a flake;
          // a real hang still surfaces long before anyone waits for it.
          testTimeout: 30_000,
          hookTimeout: 30_000,
        },
      },
    ],
  },
}));
