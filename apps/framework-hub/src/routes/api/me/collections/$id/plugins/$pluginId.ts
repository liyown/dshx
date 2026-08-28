import { createFileRoute } from "@tanstack/react-router";

import { requireSession } from "@/lib/auth/auth.server";
import { relationshipWriteSchema } from "@/lib/community/contracts";
import { requireCommunityWrite } from "@/lib/community/guard.server";
import { setCollectionPlugin } from "@/lib/community/marketplace.server";
import { requireDatabase } from "@/lib/db/client";
import { jsonError, readJson } from "@/lib/http";

export const Route = createFileRoute("/api/me/collections/$id/plugins/$pluginId")({
  server: {
    handlers: {
      PUT: ({ request, context, params }) =>
        mutate(request, context, params.id, params.pluginId, true),
      DELETE: ({ request, context, params }) =>
        mutate(request, context, params.id, params.pluginId, false),
    },
  },
});

async function mutate(
  request: Request,
  context: unknown,
  collectionId: string,
  pluginId: string,
  enabled: boolean,
) {
  try {
    const auth = await requireSession(request, context);
    const input = await readJson(request, relationshipWriteSchema);
    await requireCommunityWrite(
      request,
      context,
      auth.db,
      auth.session.user.id,
      "collection.plugin",
      input.turnstileToken,
    );
    return Response.json(
      await setCollectionPlugin(
        requireDatabase(context),
        collectionId,
        pluginId,
        auth.session.user.id,
        enabled,
      ),
    );
  } catch (error) {
    return jsonError(error);
  }
}
