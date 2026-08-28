import { createFileRoute } from "@tanstack/react-router";

import { listMarketplacePlugins } from "@/lib/catalog/application.server";
import { marketplaceListQuerySchema, marketplaceListResponseSchema } from "@/lib/catalog/contracts";
import { requireDatabase } from "@/lib/db/client";
import { jsonError } from "@/lib/http";

export const Route = createFileRoute("/api/marketplace/plugins/")({
  server: {
    handlers: {
      GET: async ({ request, context }) => {
        try {
          const url = new URL(request.url);
          const query = marketplaceListQuerySchema.parse({
            locale: url.searchParams.get("locale") ?? undefined,
            q: url.searchParams.get("q") ?? undefined,
            category: url.searchParams.get("category") ?? undefined,
            sort: url.searchParams.get("sort") ?? undefined,
            cursor: url.searchParams.get("cursor") ?? undefined,
            limit: url.searchParams.get("limit")
              ? Number(url.searchParams.get("limit"))
              : undefined,
          });
          const result = await listMarketplacePlugins(requireDatabase(context), query);
          return Response.json(marketplaceListResponseSchema.parse(result));
        } catch (error) {
          return jsonError(error);
        }
      },
    },
  },
});
