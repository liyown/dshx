import { createFileRoute } from "@tanstack/react-router";

import { requireApiToken } from "@/lib/auth/tokens.server";
import { requireD1, requireDatabase } from "@/lib/db/client";
import { jsonError } from "@/lib/http";

export const Route = createFileRoute("/api/ops/catalog/submissions")({
  server: {
    handlers: {
      GET: async ({ request, context }) => {
        try {
          const db = requireDatabase(context);
          await requireApiToken(db, request, "catalog:write");
          const result = await requireD1(context)
            .prepare(
              `select id,repository_url repositoryUrl,repository_full_name repositoryFullName,
                      status,source_hash sourceHash,created_at createdAt
               from plugin_submissions where status in ('queued','discovered')
               order by created_at asc limit 500`,
            )
            .all<Record<string, unknown>>();
          return Response.json({ items: result.results ?? [] });
        } catch (error) {
          return jsonError(error);
        }
      },
    },
  },
});
