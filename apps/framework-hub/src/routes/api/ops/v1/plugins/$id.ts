import { createFileRoute } from "@tanstack/react-router";

import { v1PluginOperations } from "@/lib/api/operations/v1-plugins";
import { getOpsPlugin } from "@/lib/catalog/operations";

export const Route = createFileRoute("/api/ops/v1/plugins/$id")({
  server: {
    handlers: {
      GET: v1PluginOperations.getOperationalPlugin.route(({ db, params }) =>
        getOpsPlugin(db, params.id),
      ),
    },
  },
});
