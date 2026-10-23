import { createFileRoute } from "@tanstack/react-router";

import { tokenRoute } from "@/lib/api/route";
import { approvalEffectClaimSchema } from "@/lib/approvals/contracts";
import { claimAgentEffect } from "@/lib/approvals/service.server";

export const Route = createFileRoute("/api/ops/approvals/$id/effects/claim")({
  server: {
    handlers: {
      POST: tokenRoute(
        { scope: "approvals:write", body: approvalEffectClaimSchema },
        ({ db, params, token, profile, input }) =>
          claimAgentEffect(db, params.id, { token, profile }, input.runId),
      ),
    },
  },
});
