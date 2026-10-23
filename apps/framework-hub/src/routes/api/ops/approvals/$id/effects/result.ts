import { createFileRoute } from "@tanstack/react-router";

import { tokenRoute } from "@/lib/api/route";
import { approvalEffectResultSchema } from "@/lib/approvals/contracts";
import { completeAgentEffect } from "@/lib/approvals/service.server";
import { scheduleCriticalApprovalEmail } from "@/lib/email/delivery.server";

export const Route = createFileRoute("/api/ops/approvals/$id/effects/result")({
  server: {
    handlers: {
      POST: tokenRoute(
        { scope: "approvals:write", body: approvalEffectResultSchema },
        async ({ context, db, params, token, profile, input }) => {
          const result = await completeAgentEffect(db, params.id, { token, profile }, input);
          if (input.status === "failed" && !result.duplicate)
            scheduleCriticalApprovalEmail(context, params.id, "approval.effect_failed");
          return result;
        },
      ),
    },
  },
});
