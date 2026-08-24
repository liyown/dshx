import { createFileRoute } from "@tanstack/react-router";

import { approvalEffectClaimSchema } from "@/lib/approvals/contracts";
import { claimAgentEffect } from "@/lib/approvals/service.server";
import { requireApiToken } from "@/lib/auth/tokens.server";
import { requireD1, requireDatabase } from "@/lib/db/client";
import { jsonError, readJson } from "@/lib/http";

export const Route = createFileRoute("/api/ops/approvals/$id/effects/claim")({
  server: {
    handlers: {
      POST: async ({ request, context, params }) => {
        try {
          const db = requireDatabase(context);
          const actor = await requireApiToken(db, request, "approvals:write");
          const input = await readJson(request, approvalEffectClaimSchema);
          return Response.json(
            await claimAgentEffect(requireD1(context), params.id, actor, input.runId),
          );
        } catch (error) {
          return jsonError(error);
        }
      },
    },
  },
});
