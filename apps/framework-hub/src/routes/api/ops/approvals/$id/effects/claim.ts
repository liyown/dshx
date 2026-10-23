import { createFileRoute } from "@tanstack/react-router";

import { adminOperations } from "@/lib/api/operations/admin";
import { claimAgentEffect } from "@/lib/approvals/service.server";

export const Route = createFileRoute("/api/ops/approvals/$id/effects/claim")({
  server: {
    handlers: {
      POST: adminOperations.claimAgentEffect.route(({ db, params, token, profile, input }) =>
        claimAgentEffect(db, params.id, { token, profile }, input.runId),
      ),
    },
  },
});
