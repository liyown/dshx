import { createFileRoute } from "@tanstack/react-router";

import { requireSession } from "@/lib/auth/auth.server";
import { createPluginClaim } from "@/lib/catalog/claims.application.server";
import { claimCreateSchema } from "@/lib/catalog/contracts";
import { requireCommunityWrite } from "@/lib/community/guard.server";
import { jsonError, readJson } from "@/lib/http";

export const Route = createFileRoute("/api/plugins/$slug/claims")({
  server: {
    handlers: {
      POST: async ({ request, context, params }) => {
        try {
          const { session, db } = await requireSession(request, context);
          const input = await readJson(request, claimCreateSchema);
          await requireCommunityWrite(
            request,
            context,
            db,
            session.user.id,
            "claim",
            input.turnstileToken,
          );
          const result = await createPluginClaim(db, {
            ...input,
            userId: session.user.id,
            slug: params.slug,
          });
          return Response.json(result.body, { status: result.status });
        } catch (error) {
          return jsonError(error);
        }
      },
    },
  },
});
