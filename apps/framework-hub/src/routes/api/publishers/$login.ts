import { createFileRoute } from "@tanstack/react-router";

import { getPublicPublisher } from "@/lib/community/marketplace.server";
import { requireDatabase } from "@/lib/db/client";
import { jsonError } from "@/lib/http";

export const Route = createFileRoute("/api/publishers/$login")({
  server: {
    handlers: {
      GET: async ({ request, context, params }) => {
        try {
          const locale = new URL(request.url).searchParams.get("locale") === "zh" ? "zh" : "en";
          return Response.json(
            await getPublicPublisher(requireDatabase(context), params.login, locale),
          );
        } catch (error) {
          return jsonError(error);
        }
      },
    },
  },
});
