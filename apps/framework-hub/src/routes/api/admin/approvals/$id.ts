import { createFileRoute } from "@tanstack/react-router";

import { getApproval } from "@/lib/approvals/service.server";
import { requireAdminSession } from "@/lib/auth/auth.server";
import { requireD1 } from "@/lib/db/client";
import { jsonError } from "@/lib/http";

export const Route = createFileRoute("/api/admin/approvals/$id")({
  server: {
    handlers: {
      GET: async ({ request, context, params }) => {
        try {
          await requireAdminSession(request, context);
          return Response.json(await getApproval(requireD1(context), params.id, undefined, true));
        } catch (error) {
          return jsonError(error);
        }
      },
    },
  },
});
