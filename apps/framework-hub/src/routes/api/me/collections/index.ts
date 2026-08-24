import { createFileRoute } from "@tanstack/react-router";

import { requireSession } from "@/lib/auth/auth.server";
import { collectionCreateSchema } from "@/lib/community/contracts";
import { requireCommunityWrite } from "@/lib/community/guard.server";
import { createCollection, listCollections } from "@/lib/community/marketplace.server";
import { requireD1 } from "@/lib/db/client";
import { jsonError, readJson } from "@/lib/http";

export const Route = createFileRoute("/api/me/collections/")({
  server: {
    handlers: {
      GET: async ({ request, context }) => {
        try {
          const auth = await requireSession(request, context);
          return Response.json(await listCollections(requireD1(context), auth.session.user.id));
        } catch (error) {
          return jsonError(error);
        }
      },
      POST: async ({ request, context }) => {
        try {
          const auth = await requireSession(request, context);
          const input = await readJson(request, collectionCreateSchema);
          await requireCommunityWrite(
            request,
            context,
            auth.db,
            auth.session.user.id,
            "collection.create",
            input.turnstileToken,
          );
          return Response.json(
            await createCollection(requireD1(context), auth.session.user.id, input),
            { status: 201 },
          );
        } catch (error) {
          return jsonError(error);
        }
      },
    },
  },
});
