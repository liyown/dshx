import { createFileRoute } from "@tanstack/react-router";

import { adminRoute } from "@/lib/api/route";
import { approvalRetrySchema } from "@/lib/approvals/contracts";
import { retryApprovedEffect } from "@/lib/approvals/service.server";
import { scheduleCriticalApprovalEmail } from "@/lib/email/delivery.server";
import { HttpError } from "@/lib/http";
import { catalogChanged, publishCatalogChanged } from "@/lib/sitemap-cache";

export const Route = createFileRoute("/api/admin/approvals/$id/effects/retry")({
  server: {
    handlers: {
      POST: adminRoute(
        { body: approvalRetrySchema },
        async ({ request, context, db, params, session, input }) => {
          try {
            const result = await retryApprovedEffect(
              db,
              params.id,
              session.user.id,
              input.reason ?? undefined,
            );
            publishCatalogChanged(catalogChanged(request));
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
