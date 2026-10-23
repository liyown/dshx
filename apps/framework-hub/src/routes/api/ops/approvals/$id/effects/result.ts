import { createFileRoute } from "@tanstack/react-router";

import { adminOperations } from "@/lib/api/operations/admin";
import { completeAgentEffect } from "@/lib/approvals/service.server";
import { scheduleCriticalApprovalEmail } from "@/lib/email/delivery.server";

export const Route = createFileRoute("/api/ops/approvals/$id/effects/result")({
  server: {
    handlers: {
      POST: adminOperations.completeAgentEffect.route(
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
