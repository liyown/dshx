import { createFileRoute } from "@tanstack/react-router";

import { publicRoute } from "@/lib/api/route";
import { listMarketplacePlugins } from "@/lib/catalog/application.server";
import {
  catalogListQueryParams,
  marketplaceListQuerySchema,
  marketplaceListResponseSchema,
} from "@/lib/catalog/contracts";

export const Route = createFileRoute("/api/marketplace/plugins/")({
  server: {
    handlers: {
      GET: publicRoute(
        { query: catalogListQueryParams, querySchema: marketplaceListQuerySchema },
        async ({ db, query }) =>
          marketplaceListResponseSchema.parse(await listMarketplacePlugins(db, query)),
      ),
    },
  },
});
