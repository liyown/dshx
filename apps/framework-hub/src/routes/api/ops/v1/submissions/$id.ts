import { createFileRoute } from "@tanstack/react-router";

import { tokenRoute } from "@/lib/api/route";
import { getOpsSubmission } from "@/lib/catalog/operations";

export const Route = createFileRoute("/api/ops/v1/submissions/$id")({
  server: {
    handlers: {
      GET: tokenRoute({ envelope: "operation" }, ({ db, params }) =>
        getOpsSubmission(db, params.id),
      ),
    },
  },
});
