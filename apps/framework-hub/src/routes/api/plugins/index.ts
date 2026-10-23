import { createFileRoute } from "@tanstack/react-router";

import { publicRoute } from "@/lib/api/route";
import { discoverCatalogPlugins } from "@/lib/catalog/application.server";
import { catalogListQueryParams, pluginListQuerySchema } from "@/lib/catalog/contracts";

export const Route = createFileRoute("/api/plugins/")({
  server: {
    handlers: {
      GET: publicRoute(
        { query: catalogListQueryParams, querySchema: pluginListQuerySchema },
        ({ db, query }) => discoverCatalogPlugins(db, query),
      ),
    },
  },
});
