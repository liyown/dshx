import { createFileRoute } from "@tanstack/react-router";

import { getApprovalDetail } from "@/lib/approvals/service.server";
import { requireAdminSession } from "@/lib/auth/auth.server";
import { requireDatabase } from "@/lib/db/client";
import { jsonError } from "@/lib/http";

export const Route = createFileRoute("/api/admin/approvals/$id")({
  server: {
    handlers: {
      GET: async ({ request, context, params }) => {
        try {
          await requireAdminSession(request, context);
          return Response.json(await getApprovalDetail(requireDatabase(context), params.id));
        } catch (error) {
          return jsonError(error);
        }
      },
    },
  },
});
