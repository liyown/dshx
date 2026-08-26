import { createFileRoute } from "@tanstack/react-router";

import { marketplaceDetailResponseSchema, pluginListQuerySchema } from "@/lib/catalog/contracts";
import { getCatalogMarketplacePlugin } from "@/lib/catalog/repository.server";
import { requireDatabase } from "@/lib/db/client";
import { jsonError } from "@/lib/http";

export const Route = createFileRoute("/api/marketplace/plugins/$slug")({
  server: {
    handlers: {
      GET: async ({ request, context, params }) => {
        try {
          const url = new URL(request.url);
          const { locale } = pluginListQuerySchema.parse({
            locale: url.searchParams.get("locale") ?? undefined,
          });
          const result = await getCatalogMarketplacePlugin(
            requireDatabase(context),
            params.slug,
            locale,
          );
          if (!result)
            return Response.json(
              { error: { code: "not_found", message: "Plugin not found" } },
              { status: 404 },
            );
          if (result.redirectSlug) {
            url.pathname = `/api/marketplace/plugins/${result.redirectSlug}`;
            return Response.redirect(url, 308);
          }
          return Response.json(marketplaceDetailResponseSchema.parse(result));
        } catch (error) {
          return jsonError(error);
        }
      },
    },
  },
});
