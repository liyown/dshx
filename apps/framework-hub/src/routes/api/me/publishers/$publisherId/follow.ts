import { createFileRoute } from "@tanstack/react-router";

import { requireSession } from "@/lib/auth/auth.server";
import { relationshipWriteSchema } from "@/lib/community/contracts";
import { requireCommunityWrite } from "@/lib/community/guard.server";
import { setPublisherFollow } from "@/lib/community/marketplace.server";
import { requireDatabase } from "@/lib/db/client";
import { jsonError, readJson } from "@/lib/http";

export const Route = createFileRoute("/api/me/publishers/$publisherId/follow")({
  server: {
    handlers: {
      PUT: ({ request, context, params }) => mutate(request, context, params.publisherId, true),
      DELETE: ({ request, context, params }) => mutate(request, context, params.publisherId, false),
    },
  },
});

async function mutate(request: Request, context: unknown, publisherId: string, enabled: boolean) {
  try {
    const auth = await requireSession(request, context);
    const input = await readJson(request, relationshipWriteSchema);
    await requireCommunityWrite(
      request,
      context,
      auth.db,
      auth.session.user.id,
      "publisher.follow",
      input.turnstileToken,
    );
    return Response.json(
      await setPublisherFollow(
        requireDatabase(context),
        auth.session.user.id,
        publisherId,
        enabled,
      ),
    );
  } catch (error) {
    return jsonError(error);
  }
}
