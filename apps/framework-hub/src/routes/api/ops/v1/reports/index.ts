import { createFileRoute } from "@tanstack/react-router";
import { operationReportInputSchema } from "@becomeopc/dshx-hub-contracts";

import { tokenRoute, withMeta } from "@/lib/api/route";
import {
  latestOperationReport,
  publishOperationReport,
} from "@/lib/catalog/operation-reports.server";

export const Route = createFileRoute("/api/ops/v1/reports/")({
  server: {
    handlers: {
      GET: tokenRoute({ envelope: "operation" }, ({ db }) => latestOperationReport(db)),
      POST: tokenRoute(
        { envelope: "operation", body: operationReportInputSchema },
        async ({ db, token, input }) => {
          const result = await publishOperationReport(db, token.id, input);
          return withMeta(result, { status: result.status === "created" ? 201 : 200 });
        },
      ),
    },
  },
});
