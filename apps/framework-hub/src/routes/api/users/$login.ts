import { createFileRoute } from "@tanstack/react-router";

import { getPublicUser } from "@/lib/community/marketplace.server";
import { requireD1 } from "@/lib/db/client";
import { jsonError } from "@/lib/http";

export const Route = createFileRoute("/api/users/$login")({
  server: {
    handlers: {
      GET: async ({ context, params }) => {
        try {
          return Response.json(await getPublicUser(requireD1(context), params.login));
        } catch (error) {
          return jsonError(error);
        }
      },
    },
  },
});
