import { createFileRoute } from "@tanstack/react-router";

import { requireSession } from "@/lib/auth/auth.server";
import { relationshipWriteSchema } from "@/lib/community/contracts";
import { requireCommunityWrite } from "@/lib/community/guard.server";
import { setUserBlock } from "@/lib/community/marketplace.server";
import { requireD1 } from "@/lib/db/client";
import { jsonError, readJson } from "@/lib/http";

export const Route = createFileRoute("/api/me/blocks/$userId")({
  server: {
    handlers: {
      PUT: ({ request, context, params }) => mutate(request, context, params.userId, true),
      DELETE: ({ request, context, params }) => mutate(request, context, params.userId, false),
    },
  },
});

async function mutate(request: Request, context: unknown, userId: string, enabled: boolean) {
  try {
    const auth = await requireSession(request, context);
    const input = await readJson(request, relationshipWriteSchema);
    await requireCommunityWrite(
      request,
      context,
      auth.db,
      auth.session.user.id,
      "user.block",
      input.turnstileToken,
    );
    return Response.json(
      await setUserBlock(requireD1(context), auth.session.user.id, userId, enabled),
    );
  } catch (error) {
    return jsonError(error);
  }
}
