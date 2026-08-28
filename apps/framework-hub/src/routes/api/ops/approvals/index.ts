import { createFileRoute } from "@tanstack/react-router";

import { approvalCreateSchema } from "@/lib/approvals/contracts";
import { createApproval, listActorApprovals } from "@/lib/approvals/service.server";
import { requireApiToken } from "@/lib/auth/tokens.server";
import { requireDatabase } from "@/lib/db/client";
import { jsonError, readJson } from "@/lib/http";

export const Route = createFileRoute("/api/ops/approvals/")({
  server: {
    handlers: {
      GET: async ({ request, context }) => {
        try {
          const db = requireDatabase(context);
          const actor = await requireApiToken(db, request, "approvals:write");
          return Response.json(await listActorApprovals(requireDatabase(context), actor));
        } catch (error) {
          return jsonError(error);
        }
      },
      POST: async ({ request, context }) => {
        try {
          const db = requireDatabase(context);
          const actor = await requireApiToken(db, request, "approvals:write");
          const input = await readJson(request, approvalCreateSchema);
          return Response.json(await createApproval(requireDatabase(context), actor, input), {
            status: 201,
          });
        } catch (error) {
          return jsonError(error);
        }
      },
    },
  },
});
