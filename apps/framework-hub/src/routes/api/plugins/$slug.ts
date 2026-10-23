import { createFileRoute } from "@tanstack/react-router";

import { catalogOperations } from "@/lib/api/operations/catalog";
import { readCatalogPlugin } from "@/lib/catalog/application.server";
import { HttpError } from "@/lib/http";

export const Route = createFileRoute("/api/plugins/$slug")({
  server: {
    handlers: {
      GET: catalogOperations.getCatalogPlugin.route(async ({ request, db, params, query }) => {
        const result = await readCatalogPlugin(db, params.slug, query.locale);
        if (!result) throw new HttpError(404, "Plugin not found", "not_found");
        if (result.redirectSlug) {
          const url = new URL(request.url);
          url.pathname = `/api/plugins/${result.redirectSlug}`;
          return Response.redirect(url, 308);
        }
        return result;
      }),
    },
  },
});
