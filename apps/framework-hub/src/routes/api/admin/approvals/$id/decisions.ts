import { createFileRoute } from "@tanstack/react-router";

import { approvalDecisionSchema } from "@/lib/approvals/contracts";
import { decideApproval } from "@/lib/approvals/service.server";
import { requireAdminSession, requireSameOrigin } from "@/lib/auth/auth.server";
import { requireD1 } from "@/lib/db/client";
import { jsonError, readJson } from "@/lib/http";

export const Route = createFileRoute("/api/admin/approvals/$id/decisions")({
  server: {
    handlers: {
      POST: async ({ request, context, params }) => {
        try {
          requireSameOrigin(request, context);
          const admin = await requireAdminSession(request, context);
          const input = await readJson(request, approvalDecisionSchema);
          return Response.json(
            await decideApproval(requireD1(context), params.id, admin.session.user.id, input),
          );
        } catch (error) {
          return jsonError(error);
        }
      },
    },
  },
});
