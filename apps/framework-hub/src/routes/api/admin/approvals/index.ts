import { createFileRoute } from "@tanstack/react-router";

import { listApprovals } from "@/lib/approvals/service.server";
import { requireAdminSession } from "@/lib/auth/auth.server";
import { requireDatabase } from "@/lib/db/client";
import { jsonError } from "@/lib/http";

export const Route = createFileRoute("/api/admin/approvals/")({
  server: {
    handlers: {
      GET: async ({ request, context }) => {
        try {
          await requireAdminSession(request, context);
          const query = new URL(request.url).searchParams;
          return Response.json(
            await listApprovals(requireDatabase(context), {
              status: query.get("status"),
              kind: query.get("kind"),
              risk: query.get("risk"),
              limit: Number(query.get("limit") ?? 100),
            }),
          );
        } catch (error) {
          return jsonError(error);
        }
      },
    },
  },
});
