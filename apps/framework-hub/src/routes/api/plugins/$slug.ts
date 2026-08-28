import { createFileRoute } from "@tanstack/react-router";

import { readCatalogPlugin } from "@/lib/catalog/application.server";
import { requireDatabase } from "@/lib/db/client";
import { jsonError } from "@/lib/http";

export const Route = createFileRoute("/api/plugins/$slug")({
  server: {
    handlers: {
      GET: async ({ request, context, params }) => {
        try {
          const locale = new URL(request.url).searchParams.get("locale") === "zh" ? "zh" : "en";
          const result = await readCatalogPlugin(requireDatabase(context), params.slug, locale);
          if (!result)
            return Response.json(
              { error: { code: "not_found", message: "Plugin not found" } },
              { status: 404 },
            );
          if (result.redirectSlug) {
            const url = new URL(request.url);
            url.pathname = `/api/plugins/${result.redirectSlug}`;
            return Response.redirect(url, 308);
          }
          return Response.json(result);
        } catch (error) {
          return jsonError(error);
        }
      },
    },
  },
});
