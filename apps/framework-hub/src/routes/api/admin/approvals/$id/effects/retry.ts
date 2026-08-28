import { createFileRoute } from "@tanstack/react-router";

import { approvalRetrySchema } from "@/lib/approvals/contracts";
import { retryApprovedEffect } from "@/lib/approvals/service.server";
import { requireAdminSession, requireSameOrigin } from "@/lib/auth/auth.server";
import { requireDatabase } from "@/lib/db/client";
import { scheduleCriticalApprovalEmail } from "@/lib/email/delivery.server";
import { HttpError, jsonError, readJson } from "@/lib/http";
import { catalogChanged, publishCatalogChanged } from "@/lib/sitemap-cache";

export const Route = createFileRoute("/api/admin/approvals/$id/effects/retry")({
  server: {
    handlers: {
      POST: async ({ request, context, params }) => {
        try {
          requireSameOrigin(request, context);
          const admin = await requireAdminSession(request, context);
          const input = await readJson(request, approvalRetrySchema);
          const result = await retryApprovedEffect(
            requireDatabase(context),
            params.id,
            admin.session.user.id,
            input.reason ?? undefined,
          );
          publishCatalogChanged(catalogChanged(request));
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
