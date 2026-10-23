import { createFileRoute } from "@tanstack/react-router";

import { v1PluginOperations } from "@/lib/api/operations/v1-plugins";
import { listOpsPlugins } from "@/lib/catalog/operations";

export const Route = createFileRoute("/api/ops/v1/plugins/")({
  server: {
    handlers: {
      GET: v1PluginOperations.listOperationalPlugins.route(({ db, query }) =>
        listOpsPlugins(db, query),
      ),
    },
  },
});
