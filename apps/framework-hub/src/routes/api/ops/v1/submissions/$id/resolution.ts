import { createFileRoute } from "@tanstack/react-router";

import { v1ReportOperations } from "@/lib/api/operations/v1-reports";
import { resolveOpsSubmission } from "@/lib/catalog/operations";
import { operationRequestId } from "@/lib/catalog/operations-v1.http";

export const Route = createFileRoute("/api/ops/v1/submissions/$id/resolution")({
  server: {
    handlers: {
      PUT: v1ReportOperations.resolveSubmission.route(({ request, db, token, params, input }) =>
        resolveOpsSubmission(db, token.id, operationRequestId(request), params.id, input),
      ),
    },
  },
});
