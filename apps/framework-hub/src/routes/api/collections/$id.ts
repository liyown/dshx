import { createFileRoute } from "@tanstack/react-router";

import { getCollection } from "@/lib/community/marketplace.server";
import { requireD1 } from "@/lib/db/client";
import { jsonError } from "@/lib/http";

export const Route = createFileRoute("/api/collections/$id")({
  server: {
    handlers: {
      GET: async ({ context, params }) => {
        try {
          return Response.json(await getCollection(requireD1(context), params.id));
        } catch (error) {
          return jsonError(error);
        }
      },
    },
  },
});
