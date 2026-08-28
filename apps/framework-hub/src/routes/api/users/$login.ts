import { createFileRoute } from "@tanstack/react-router";

import { getPublicUser } from "@/lib/community/marketplace.server";
import { requireDatabase } from "@/lib/db/client";
import { jsonError } from "@/lib/http";

export const Route = createFileRoute("/api/users/$login")({
  server: {
    handlers: {
      GET: async ({ context, params }) => {
        try {
          return Response.json(await getPublicUser(requireDatabase(context), params.login));
        } catch (error) {
          return jsonError(error);
        }
      },
    },
  },
});
