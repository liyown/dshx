import { createFileRoute } from "@tanstack/react-router";

import { localeQuery, publicRoute } from "@/lib/api/route";
import { readMarketplacePlugin } from "@/lib/catalog/application.server";
import { marketplaceDetailResponseSchema } from "@/lib/catalog/contracts";
import { HttpError } from "@/lib/http";

export const Route = createFileRoute("/api/marketplace/plugins/$slug")({
  server: {
    handlers: {
      GET: publicRoute({ ...localeQuery }, async ({ request, db, params, query }) => {
        const result = await readMarketplacePlugin(db, params.slug, query.locale);
        if (!result) throw new HttpError(404, "Plugin not found", "not_found");
        if (result.redirectSlug) {
          const url = new URL(request.url);
          url.pathname = `/api/marketplace/plugins/${result.redirectSlug}`;
          return Response.redirect(url, 308);
        }
        return marketplaceDetailResponseSchema.parse(result);
      }),
    },
  },
});
