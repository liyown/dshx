import { createFileRoute } from "@tanstack/react-router";

import { requireApiToken } from "@/lib/auth/tokens.server";
import { inventoryQuerySchema } from "@/lib/catalog/contracts";
import { listCatalogInventory } from "@/lib/catalog/operations.server";
import { requireDatabase } from "@/lib/db/client";
import { jsonError } from "@/lib/http";

export const Route = createFileRoute("/api/ops/catalog/inventory")({
  server: {
    handlers: {
      GET: async ({ request, context }) => {
        try {
          const db = requireDatabase(context);
          await requireApiToken(db, request, "catalog:write");
          const url = new URL(request.url);
          const query = inventoryQuerySchema.parse({
            cursor: url.searchParams.get("cursor") ?? undefined,
            limit: url.searchParams.get("limit")
              ? Number(url.searchParams.get("limit"))
              : undefined,
          });
          return Response.json(await listCatalogInventory(db, query));
        } catch (error) {
          return jsonError(error);
        }
      },
    },
  },
});
