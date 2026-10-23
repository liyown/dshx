import { createFileRoute } from "@tanstack/react-router";

import { sessionRoute } from "@/lib/api/route";
import { verifyPluginClaim } from "@/lib/catalog/claims.application.server";
import { claimVerifySchema } from "@/lib/catalog/contracts";

export const Route = createFileRoute("/api/claims/$id/verify")({
  server: {
    handlers: {
      POST: sessionRoute({ body: claimVerifySchema }, ({ db, session, params, input }) =>
        verifyPluginClaim(db, { ...input, userId: session.user.id, claimId: params.id }),
      ),
    },
  },
});
