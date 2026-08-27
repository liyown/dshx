import { createFileRoute } from "@tanstack/react-router";

import { publicOperationReportQuerySchema } from "@/lib/catalog/operations-v1.contracts";
import { listPublicOperationReports } from "@/lib/catalog/operation-reports.server";
import { requireD1 } from "@/lib/db/client";
import { jsonError } from "@/lib/http";

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
          return Response.json(await listPublicOperationReports(requireD1(context), query));
        } catch (error) {
          return jsonError(error);
        }
      },
    },
  },
});
