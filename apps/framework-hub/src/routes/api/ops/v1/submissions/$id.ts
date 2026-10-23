import { createFileRoute } from "@tanstack/react-router";

import { v1ReportOperations } from "@/lib/api/operations/v1-reports";
import { getOpsSubmission } from "@/lib/catalog/operations";

export const Route = createFileRoute("/api/ops/v1/submissions/$id")({
  server: {
    handlers: {
      GET: v1ReportOperations.getOperationalSubmission.route(({ db, params }) =>
        getOpsSubmission(db, params.id),
      ),
    },
  },
});
