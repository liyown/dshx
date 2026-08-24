import { createFileRoute } from "@tanstack/react-router";

import { requireApiToken } from "@/lib/auth/tokens.server";
import { promoteRun } from "@/lib/catalog/sync.server";
import { requireD1, requireDatabase } from "@/lib/db/client";
import { jsonError } from "@/lib/http";

export const Route = createFileRoute("/api/ops/catalog/runs/$id/commit")({
  server: {
    handlers: {
      POST: async ({ request, context, params }) => {
        try {
          const db = requireDatabase(context);
          await requireApiToken(db, request, "catalog:write");
          return Response.json(await promoteRun(requireD1(context), db, params.id));
        } catch (error) {
          return jsonError(error);
        }
      },
    },
  },
});
