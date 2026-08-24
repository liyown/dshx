import { createFileRoute } from "@tanstack/react-router";

import { requireApiToken } from "@/lib/auth/tokens.server";
import { requireDatabase } from "@/lib/db/client";
import { requireBindings } from "@/lib/db/context";
import { HttpError, jsonError } from "@/lib/http";
import { storeMedia } from "@/lib/media.server";

export const Route = createFileRoute("/api/ops/media")({
  server: {
    handlers: {
      POST: async ({ request, context }) => {
        try {
          const db = requireDatabase(context);
          await requireApiToken(db, request, "catalog:write");
          const bucket = requireBindings(context).PLUGIN_MEDIA;
          if (!bucket) throw new HttpError(503, "R2 binding is unavailable", "media_unavailable");
          return Response.json(await storeMedia(db, bucket, await request.formData()), {
            status: 201,
          });
        } catch (error) {
          return jsonError(error);
        }
      },
    },
  },
});
