import { createFileRoute } from "@tanstack/react-router";

import type { PublicConfig } from "@/lib/config.contracts";
import { requireBindings } from "@/lib/db/context";

// A protocol adapter rather than an API handler: it answers the browser's
// feature probe and owns the edge cache header for it.
export const Route = createFileRoute("/api/config")({
  server: {
    handlers: {
      GET: ({ context }) => {
        const bindings = requireBindings(context);
        const config: PublicConfig = {
          turnstileSiteKey: bindings.TURNSTILE_SITE_KEY ?? null,
          githubAuthConfigured: Boolean(bindings.GITHUB_CLIENT_ID && bindings.GITHUB_CLIENT_SECRET),
        };
        return Response.json(config, { headers: { "cache-control": "public, max-age=300" } });
      },
    },
  },
});
