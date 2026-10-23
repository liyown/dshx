import { createFileRoute } from "@tanstack/react-router";

import { tokenRoute } from "@/lib/api/route";
import { getOpsPlugin } from "@/lib/catalog/operations";

export const Route = createFileRoute("/api/ops/v1/plugins/$id")({
  server: {
    handlers: {
      GET: tokenRoute({ envelope: "operation" }, ({ db, params }) => getOpsPlugin(db, params.id)),
    },
  },
});
