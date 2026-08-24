import { createFileRoute } from "@tanstack/react-router";

import { getApproval } from "@/lib/approvals/service.server";
import { requireApiToken } from "@/lib/auth/tokens.server";
import { requireD1, requireDatabase } from "@/lib/db/client";
import { jsonError } from "@/lib/http";

export const Route = createFileRoute("/api/ops/approvals/$id")({
  server: {
    handlers: {
      GET: async ({ request, context, params }) => {
        try {
          const db = requireDatabase(context);
          const actor = await requireApiToken(db, request, "approvals:write");
          return Response.json(await getApproval(requireD1(context), params.id, actor, false));
        } catch (error) {
          return jsonError(error);
        }
      },
    },
  },
});
