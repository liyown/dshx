import { and, eq } from "drizzle-orm";
import { createFileRoute } from "@tanstack/react-router";

import { requireApiToken } from "@/lib/auth/tokens.server";
import { requireDatabase } from "@/lib/db/client";
import { catalogSyncRuns } from "@/lib/db/schema";
import { HttpError, jsonError } from "@/lib/http";

export const Route = createFileRoute("/api/ops/catalog/runs/$id/abort")({
  server: {
    handlers: {
      POST: async ({ request, context, params }) => {
        try {
          const db = requireDatabase(context);
          await requireApiToken(db, request, "catalog:write");
          const rows = await db
            .update(catalogSyncRuns)
            .set({ status: "aborted", finishedAt: new Date() })
            .where(and(eq(catalogSyncRuns.id, params.id), eq(catalogSyncRuns.status, "open")))
            .returning();
          if (!rows.length)
            throw new HttpError(409, "Run is missing or already closed", "run_closed");
          return Response.json(rows[0]);
        } catch (error) {
          return jsonError(error);
        }
      },
    },
  },
});
