import { createFileRoute } from "@tanstack/react-router";

import { pluginListQuerySchema } from "@/lib/catalog/contracts";
import { listCatalogDiscovery } from "@/lib/catalog/repository.server";
import { requireDatabase } from "@/lib/db/client";
import { jsonError } from "@/lib/http";

export const Route = createFileRoute("/api/plugins/")({
  server: {
    handlers: {
      GET: async ({ request, context }) => {
        try {
          const url = new URL(request.url);
          const query = pluginListQuerySchema.parse({
            locale: url.searchParams.get("locale") ?? undefined,
            q: url.searchParams.get("q") ?? undefined,
            category: url.searchParams.get("category") ?? undefined,
            sort: url.searchParams.get("sort") ?? undefined,
            cursor: url.searchParams.get("cursor") ?? undefined,
            limit: url.searchParams.get("limit")
              ? Number(url.searchParams.get("limit"))
              : undefined,
          });
          return Response.json(await listCatalogDiscovery(requireDatabase(context), query));
        } catch (error) {
          return jsonError(error);
        }
      },
    },
  },
});
