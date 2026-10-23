import { createFileRoute } from "@tanstack/react-router";

import { catalogOperations } from "@/lib/api/operations/catalog";
import { discoverCatalogPlugins } from "@/lib/catalog/application.server";

export const Route = createFileRoute("/api/plugins/")({
  server: {
    handlers: {
      GET: catalogOperations.listCatalogPlugins.route(({ db, query }) =>
        discoverCatalogPlugins(db, query),
      ),
    },
  },
});
