import { createFileRoute } from "@tanstack/react-router";

import { requireApiToken } from "@/lib/auth/tokens.server";
import { syncItemPageSchema } from "@/lib/catalog/contracts";
import { stageItems } from "@/lib/catalog/sync.server";
import { requireD1, requireDatabase } from "@/lib/db/client";
import { jsonError, readJson } from "@/lib/http";

export const Route = createFileRoute("/api/ops/catalog/runs/$id/items")({
  server: {
    handlers: {
      PUT: async ({ request, context, params }) => {
        try {
          const db = requireDatabase(context);
          await requireApiToken(db, request, "catalog:write");
          const input = await readJson(request, syncItemPageSchema);
          return Response.json(await stageItems(requireD1(context), db, params.id, input.items));
        } catch (error) {
          return jsonError(error);
        }
      },
    },
  },
});
