import { createFileRoute } from "@tanstack/react-router";

import { v1PluginOperations } from "@/lib/api/operations/v1-plugins";
import { auditOperations } from "@/lib/catalog/operations";
import { requireBindings } from "@/lib/db/context";

export const Route = createFileRoute("/api/ops/v1/audit")({
  server: {
    handlers: {
      GET: v1PluginOperations.auditOperations.route(({ db, context, query }) =>
        auditOperations(db, requireBindings(context).PLUGIN_MEDIA, query.scope),
      ),
    },
  },
});
