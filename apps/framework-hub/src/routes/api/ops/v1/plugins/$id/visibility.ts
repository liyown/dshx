import { createFileRoute } from "@tanstack/react-router";
import { pluginVisibilityRequestSchema } from "@becomeopc/dshx-hub-contracts";

import { tokenRoute } from "@/lib/api/route";
import { setPluginVisibility } from "@/lib/catalog/operations";
import { operationRequestId } from "@/lib/catalog/operations-v1.http";
import { catalogChanged, publishCatalogChanged } from "@/lib/sitemap-cache";

export const Route = createFileRoute("/api/ops/v1/plugins/$id/visibility")({
  server: {
    handlers: {
      PUT: tokenRoute(
        { envelope: "operation", body: pluginVisibilityRequestSchema },
        async ({ request, db, token, params, input }) => {
          const result = await setPluginVisibility(
            db,
            token.id,
            operationRequestId(request),
            params.id,
            input.visibility,
            input.reason,
          );
          publishCatalogChanged(catalogChanged(request));
          return result;
        },
      ),
    },
  },
});
