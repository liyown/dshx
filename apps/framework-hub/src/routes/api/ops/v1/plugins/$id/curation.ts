import { createFileRoute } from "@tanstack/react-router";
import { pluginCurationRequestSchema } from "@becomeopc/dshx-hub-contracts";

import { tokenRoute } from "@/lib/api/route";
import { curatePlugin } from "@/lib/catalog/operations";
import { operationRequestId } from "@/lib/catalog/operations-v1.http";
import { catalogChanged, publishCatalogChanged } from "@/lib/sitemap-cache";

export const Route = createFileRoute("/api/ops/v1/plugins/$id/curation")({
  server: {
    handlers: {
      PATCH: tokenRoute(
        { envelope: "operation", body: pluginCurationRequestSchema },
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
