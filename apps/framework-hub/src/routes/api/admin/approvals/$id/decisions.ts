import { createFileRoute } from "@tanstack/react-router";

import { approvalDecisionSchema } from "@/lib/approvals/contracts";
import { decideApproval } from "@/lib/approvals/service.server";
import { requireAdminSession, requireSameOrigin } from "@/lib/auth/auth.server";
import { requireD1 } from "@/lib/db/client";
import { scheduleCriticalApprovalEmail } from "@/lib/email/delivery.server";
import { HttpError, jsonError, readJson } from "@/lib/http";

export const Route = createFileRoute("/api/admin/approvals/$id/decisions")({
  server: {
    handlers: {
      POST: async ({ request, context, params }) => {
        try {
          requireSameOrigin(request, context);
          const admin = await requireAdminSession(request, context);
          const input = await readJson(request, approvalDecisionSchema);
          const result = await decideApproval(
            requireD1(context),
            params.id,
            admin.session.user.id,
            input,
          );
          scheduleCriticalApprovalEmail(
            context,
            params.id,
            input.action === "request_changes"
              ? "approval.changes_requested"
              : input.action === "reject"
                ? "approval.rejected"
                : "approval.approved",
          );
          return Response.json(result);
        } catch (error) {
          if (error instanceof HttpError && error.code === "approval_effect_failed") {
            scheduleCriticalApprovalEmail(context, params.id, "approval.effect_failed");
          }
          return jsonError(error);
        }
      },
    },
  },
});
