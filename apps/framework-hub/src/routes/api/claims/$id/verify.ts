import { createFileRoute } from "@tanstack/react-router";

import { requireSession } from "@/lib/auth/auth.server";
import { verifyPluginClaim } from "@/lib/catalog/claims.application.server";
import { claimVerifySchema } from "@/lib/catalog/contracts";
import { jsonError, readJson } from "@/lib/http";

export const Route = createFileRoute("/api/claims/$id/verify")({
  server: {
    handlers: {
      POST: async ({ request, context, params }) => {
        try {
          const { session, db } = await requireSession(request, context);
          const input = await readJson(request, claimVerifySchema);
          const result = await verifyPluginClaim(db, {
            ...input,
            userId: session.user.id,
            claimId: params.id,
          });
          return Response.json(result);
        } catch (error) {
          return jsonError(error);
        }
      },
    },
  },
});
