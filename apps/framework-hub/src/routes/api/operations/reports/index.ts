import { createFileRoute } from "@tanstack/react-router";

import { listPublicOperationReports } from "@/lib/catalog/operation-reports.server";
import { requireDatabase } from "@/lib/db/client";
import { jsonError } from "@/lib/http";
import { publicOperationReportQuerySchema } from "@becomeopc/dshx-hub-contracts";

export const Route = createFileRoute("/api/operations/reports/")({
  server: {
    handlers: {
      GET: async ({ request, context }) => {
        try {
          const params = new URL(request.url).searchParams;
          const query = publicOperationReportQuerySchema.parse({
            locale: params.get("locale") ?? undefined,
            limit: params.has("limit") ? Number(params.get("limit")) : undefined,
            cursor: params.get("cursor") ?? undefined,
          });
          return Response.json(await listPublicOperationReports(requireDatabase(context), query));
        } catch (error) {
          return jsonError(error);
        }
      },
    },
  },
});
