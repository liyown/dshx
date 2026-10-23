import { createFileRoute } from "@tanstack/react-router";

import { sessionRoute } from "@/lib/api/route";
import { createPluginClaim } from "@/lib/catalog/claims.application.server";
import { claimCreateSchema } from "@/lib/catalog/contracts";

export const Route = createFileRoute("/api/plugins/$slug/claims")({
  server: {
    handlers: {
      POST: sessionRoute(
        { body: claimCreateSchema, community: "claim" },
        async ({ db, session, params, input }) => {
          // The claim application answers with its own status code (created vs. already pending).
          const result = await createPluginClaim(db, {
            ...input,
            userId: session.user.id,
            slug: params.slug,
          });
          return Response.json(result.body, { status: result.status });
        },
      ),
    },
  },
});
