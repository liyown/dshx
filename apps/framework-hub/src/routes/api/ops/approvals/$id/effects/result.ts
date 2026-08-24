import { createFileRoute } from "@tanstack/react-router";

import { approvalEffectResultSchema } from "@/lib/approvals/contracts";
import { completeAgentEffect } from "@/lib/approvals/service.server";
import { requireApiToken } from "@/lib/auth/tokens.server";
import { requireD1, requireDatabase } from "@/lib/db/client";
import { jsonError, readJson } from "@/lib/http";

export const Route = createFileRoute("/api/ops/approvals/$id/effects/result")({
  server: {
    handlers: {
      POST: async ({ request, context, params }) => {
        try {
          const db = requireDatabase(context);
          const actor = await requireApiToken(db, request, "approvals:write");
          const input = await readJson(request, approvalEffectResultSchema);
          return Response.json(
            await completeAgentEffect(requireD1(context), params.id, actor, input),
          );
        } catch (error) {
          return jsonError(error);
        }
      },
    },
  },
});
