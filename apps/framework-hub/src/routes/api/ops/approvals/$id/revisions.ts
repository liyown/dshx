import { createFileRoute } from "@tanstack/react-router";

import { approvalRevisionSchema } from "@/lib/approvals/contracts";
import { reviseApproval } from "@/lib/approvals/service.server";
import { requireApiToken } from "@/lib/auth/tokens.server";
import { requireDatabase } from "@/lib/db/client";
import { jsonError, readJson } from "@/lib/http";

export const Route = createFileRoute("/api/ops/approvals/$id/revisions")({
  server: {
    handlers: {
      POST: async ({ request, context, params }) => {
        try {
          const db = requireDatabase(context);
          const actor = await requireApiToken(db, request, "approvals:write");
          const input = await readJson(request, approvalRevisionSchema);
          return Response.json(
            await reviseApproval(requireDatabase(context), params.id, actor, input),
          );
        } catch (error) {
          return jsonError(error);
        }
      },
    },
  },
});
