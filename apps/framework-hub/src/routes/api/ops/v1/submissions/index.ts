import { createFileRoute } from "@tanstack/react-router";

import { v1ReportOperations } from "@/lib/api/operations/v1-reports";
import { listOpsSubmissions } from "@/lib/catalog/operations";

export const Route = createFileRoute("/api/ops/v1/submissions/")({
  server: {
    handlers: {
      GET: v1ReportOperations.listOperationalSubmissions.route(({ db, query }) =>
        listOpsSubmissions(db, query),
      ),
    },
  },
});
