import { createFileRoute } from "@tanstack/react-router";

import { requireSession } from "@/lib/auth/auth.server";
import { relationshipWriteSchema } from "@/lib/community/contracts";
import { requireCommunityWrite } from "@/lib/community/guard.server";
import { setPluginRelationship } from "@/lib/community/marketplace.server";
import { requireDatabase } from "@/lib/db/client";
import { jsonError, readJson } from "@/lib/http";

export const Route = createFileRoute("/api/me/plugins/$pluginId/bookmark")({
  server: {
    handlers: {
      PUT: ({ request, context, params }) => mutate(request, context, params.pluginId, true),
      DELETE: ({ request, context, params }) => mutate(request, context, params.pluginId, false),
    },
  },
});

async function mutate(request: Request, context: unknown, pluginId: string, enabled: boolean) {
  try {
    const auth = await requireSession(request, context);
    const input = await readJson(request, relationshipWriteSchema);
    await requireCommunityWrite(
      request,
      context,
      auth.db,
      auth.session.user.id,
      "bookmark",
      input.turnstileToken,
    );
    return Response.json(
      await setPluginRelationship(
        requireDatabase(context),
        auth.session.user.id,
        pluginId,
        "bookmark",
        enabled,
      ),
    );
  } catch (error) {
    return jsonError(error);
  }
}
