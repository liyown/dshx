import { createFileRoute } from "@tanstack/react-router";

import { approvalEffectResultSchema } from "@/lib/approvals/contracts";
import { completeAgentEffect } from "@/lib/approvals/service.server";
import { requireApiToken } from "@/lib/auth/tokens.server";
import { requireDatabase } from "@/lib/db/client";
import { scheduleCriticalApprovalEmail } from "@/lib/email/delivery.server";
import { jsonError, readJson } from "@/lib/http";

export const Route = createFileRoute("/api/ops/approvals/$id/effects/result")({
  server: {
    handlers: {
      POST: async ({ request, context, params }) => {
        try {
          const db = requireDatabase(context);
          const actor = await requireApiToken(db, request, "approvals:write");
          const input = await readJson(request, approvalEffectResultSchema);
          const result = await completeAgentEffect(
            requireDatabase(context),
            params.id,
            actor,
            input,
          );
          if (input.status === "failed" && !result.duplicate) {
            scheduleCriticalApprovalEmail(context, params.id, "approval.effect_failed");
          }
          return Response.json(result);
        } catch (error) {
          return jsonError(error);
        }
      },
    },
  },
});
