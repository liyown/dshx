import { createFileRoute } from "@tanstack/react-router";
import { publicOperationReportQuerySchema } from "@becomeopc/dshx-hub-contracts";

import { publicRoute } from "@/lib/api/route";
import { listPublicOperationReports } from "@/lib/catalog/operation-reports.server";

export const Route = createFileRoute("/api/operations/reports/")({
  server: {
    handlers: {
      GET: publicRoute(
        {
          query: (params) => ({
            locale: params.get("locale") ?? undefined,
            limit: params.has("limit") ? Number(params.get("limit")) : undefined,
            cursor: params.get("cursor") ?? undefined,
          }),
          querySchema: publicOperationReportQuerySchema,
        },
        ({ db, query }) => listPublicOperationReports(db, query),
      ),
    },
  },
});
