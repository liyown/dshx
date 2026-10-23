import { createFileRoute } from "@tanstack/react-router";

import { v1ReportOperations } from "@/lib/api/operations/v1-reports";
import { withMeta } from "@/lib/api/route";
import {
  latestOperationReport,
  publishOperationReport,
} from "@/lib/catalog/operation-reports.server";

export const Route = createFileRoute("/api/ops/v1/reports/")({
  server: {
    handlers: {
      GET: v1ReportOperations.getLatestOperationsReport.route(({ db }) =>
        latestOperationReport(db),
      ),
      POST: v1ReportOperations.publishOperationsReport.route(async ({ db, token, input }) => {
        const result = await publishOperationReport(db, token.id, input);
        return withMeta(result, { status: result.status === "created" ? 201 : 200 });
      }),
    },
  },
});
