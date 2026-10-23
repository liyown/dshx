import { createFileRoute } from "@tanstack/react-router";

import { v1PluginOperations } from "@/lib/api/operations/v1-plugins";
import { curatePlugin } from "@/lib/catalog/operations";
import { operationRequestId } from "@/lib/catalog/operations-v1.http";
import { catalogChanged, publishCatalogChanged } from "@/lib/sitemap-cache";

export const Route = createFileRoute("/api/ops/v1/plugins/$id/curation")({
  server: {
    handlers: {
      PATCH: v1PluginOperations.curatePlugin.route(
        async ({ request, db, token, params, input }) => {
          const result = await curatePlugin(
            db,
            token.id,
            operationRequestId(request),
            params.id,
            input.content,
            input.ifRevision,
          );
          publishCatalogChanged(catalogChanged(request));
          return result;
        },
      ),
    },
  },
});
