import { createFileRoute } from "@tanstack/react-router";
import { submissionResolutionSchema } from "@becomeopc/dshx-hub-contracts";

import { tokenRoute } from "@/lib/api/route";
import { resolveOpsSubmission } from "@/lib/catalog/operations";
import { operationRequestId } from "@/lib/catalog/operations-v1.http";

export const Route = createFileRoute("/api/ops/v1/submissions/$id/resolution")({
  server: {
    handlers: {
      PUT: tokenRoute(
        { envelope: "operation", body: submissionResolutionSchema },
        ({ request, db, token, params, input }) =>
          resolveOpsSubmission(db, token.id, operationRequestId(request), params.id, input),
      ),
    },
  },
});
