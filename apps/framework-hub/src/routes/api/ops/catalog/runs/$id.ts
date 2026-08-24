import { createFileRoute } from "@tanstack/react-router";

import { requireApiToken } from "@/lib/auth/tokens.server";
import { getRun } from "@/lib/catalog/sync.server";
import { requireDatabase } from "@/lib/db/client";
import { jsonError } from "@/lib/http";

export const Route = createFileRoute("/api/ops/catalog/runs/$id")({
  server: {
    handlers: {
      GET: async ({ request, context, params }) => {
        try {
          const db = requireDatabase(context);
          await requireApiToken(db, request, "catalog:write");
          return Response.json(await getRun(db, params.id));
        } catch (error) {
          return jsonError(error);
        }
      },
    },
  },
});
