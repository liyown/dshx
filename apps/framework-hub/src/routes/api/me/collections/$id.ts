import { createFileRoute } from "@tanstack/react-router";

import { requireSession } from "@/lib/auth/auth.server";
import { collectionUpdateSchema, relationshipWriteSchema } from "@/lib/community/contracts";
import { requireCommunityWrite } from "@/lib/community/guard.server";
import {
  deleteCollection,
  getCollection,
  updateCollection,
} from "@/lib/community/marketplace.server";
import { requireD1 } from "@/lib/db/client";
import { jsonError, readJson } from "@/lib/http";

export const Route = createFileRoute("/api/me/collections/$id")({
  server: {
    handlers: {
      GET: async ({ request, context, params }) => {
        try {
          const auth = await requireSession(request, context);
          return Response.json(
            await getCollection(requireD1(context), params.id, auth.session.user.id),
          );
        } catch (error) {
          return jsonError(error);
        }
      },
      PATCH: async ({ request, context, params }) => {
        try {
          const auth = await requireSession(request, context);
          const input = await readJson(request, collectionUpdateSchema);
          await requireCommunityWrite(
            request,
            context,
            auth.db,
            auth.session.user.id,
            "collection.update",
            input.turnstileToken,
          );
          return Response.json(
            await updateCollection(requireD1(context), params.id, auth.session.user.id, input),
          );
        } catch (error) {
          return jsonError(error);
        }
      },
      DELETE: async ({ request, context, params }) => {
        try {
          const auth = await requireSession(request, context);
          const input = await readJson(request, relationshipWriteSchema);
          await requireCommunityWrite(
            request,
            context,
            auth.db,
            auth.session.user.id,
            "collection.delete",
            input.turnstileToken,
          );
          return Response.json(
            await deleteCollection(requireD1(context), params.id, auth.session.user.id),
          );
        } catch (error) {
          return jsonError(error);
        }
      },
    },
  },
});
