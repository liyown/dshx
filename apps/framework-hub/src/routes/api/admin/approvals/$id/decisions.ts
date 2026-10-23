import { createFileRoute } from "@tanstack/react-router";

import { adminRoute } from "@/lib/api/route";
import { approvalDecisionSchema, approvalDetailSchema } from "@/lib/approvals/contracts";
import { decideApproval } from "@/lib/approvals/service.server";
import { scheduleCriticalApprovalEmail } from "@/lib/email/delivery.server";
import { HttpError } from "@/lib/http";
import { catalogChanged, publishCatalogChanged } from "@/lib/sitemap-cache";

export const Route = createFileRoute("/api/admin/approvals/$id/decisions")({
  server: {
    handlers: {
      POST: adminRoute(
        { body: approvalDecisionSchema, response: approvalDetailSchema },
        async ({ request, context, db, params, session, input }) => {
          try {
            const result = await decideApproval(db, params.id, session.user.id, input);
            if (input.action === "approve") publishCatalogChanged(catalogChanged(request));
            scheduleCriticalApprovalEmail(context, params.id, decisionEmail(input.action));
            return result;
          } catch (error) {
            if (error instanceof HttpError && error.code === "approval_effect_failed")
              scheduleCriticalApprovalEmail(context, params.id, "approval.effect_failed");
            throw error;
          }
        },
      ),
    },
  },
});

function decisionEmail(action: string) {
  if (action === "request_changes") return "approval.changes_requested";
  return action === "reject" ? "approval.rejected" : "approval.approved";
}
