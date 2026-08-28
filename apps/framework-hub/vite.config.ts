import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig(({ mode }) => ({
  envPrefix: ["VITE_", "GOOGLE_SITE_VERIFICATION", "BING_SITE_VERIFICATION"],
  resolve: {
    tsconfigPaths: true,
    ...(mode === "test"
      ? { alias: { "cloudflare:workers": "/src/test/cloudflare-workers.ts" } }
      : {}),
  },
  plugins: [
    ...(mode === "test" ? [] : [cloudflare({ viteEnvironment: { name: "ssr" } })]),
    tanstackStart({ server: { entry: "server" } }),
    tailwindcss(),
    react(),
  ],
}));
