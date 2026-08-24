import { createFileRoute } from "@tanstack/react-router";

import { requireBindings } from "@/lib/db/context";

export const Route = createFileRoute("/api/config")({
  server: {
    handlers: {
      GET: ({ context }) => {
        const bindings = requireBindings(context);
        return Response.json(
          {
            turnstileSiteKey: bindings.TURNSTILE_SITE_KEY ?? null,
            githubAuthConfigured: Boolean(
              bindings.GITHUB_CLIENT_ID && bindings.GITHUB_CLIENT_SECRET,
            ),
          },
          { headers: { "cache-control": "public, max-age=300" } },
        );
      },
    },
  },
});
