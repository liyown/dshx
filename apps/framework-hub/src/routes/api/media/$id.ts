import { eq } from "drizzle-orm";
import { createFileRoute } from "@tanstack/react-router";

import { requireDatabase } from "@/lib/db/client";
import { requireBindings } from "@/lib/db/context";
import { pluginMedia } from "@/lib/db/schema";
import { jsonError } from "@/lib/http";

export const Route = createFileRoute("/api/media/$id")({
  server: {
    handlers: {
      GET: async ({ context, params }) => {
        try {
          const db = requireDatabase(context);
          const [media] = await db
            .select()
            .from(pluginMedia)
            .where(eq(pluginMedia.id, params.id))
            .limit(1);
          if (!media || media.status !== "active")
            return new Response("Not found", { status: 404 });
          const object = await requireBindings(context).PLUGIN_MEDIA?.get(media.r2Key);
          if (!object) return new Response("Not found", { status: 404 });
          return new Response(object.body, {
            headers: {
              "content-type": media.contentType,
              "content-length": String(media.byteSize),
              etag: media.sha256,
              "cache-control": "public, max-age=31536000, immutable",
            },
          });
        } catch (error) {
          return jsonError(error);
        }
      },
    },
  },
});
