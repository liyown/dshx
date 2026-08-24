import { createFileRoute } from "@tanstack/react-router";

import { requireSession } from "@/lib/auth/auth.server";
import { profileUpdateSchema } from "@/lib/community/contracts";
import { requireCommunityWrite } from "@/lib/community/guard.server";
import { getMe, updateProfile } from "@/lib/community/marketplace.server";
import { requireD1 } from "@/lib/db/client";
import { jsonError, readJson } from "@/lib/http";

export const Route = createFileRoute("/api/me/profile")({
  server: {
    handlers: {
      GET: async ({ request, context }) => {
        try {
          const auth = await requireSession(request, context);
          return Response.json(await getMe(requireD1(context), auth.session.user.id));
        } catch (error) {
          return jsonError(error);
        }
      },
      PUT: async ({ request, context }) => {
        try {
          const auth = await requireSession(request, context);
          const input = await readJson(request, profileUpdateSchema);
          await requireCommunityWrite(
            request,
            context,
            auth.db,
            auth.session.user.id,
            "profile.update",
            input.turnstileToken,
          );
          return Response.json(
            await updateProfile(requireD1(context), auth.session.user.id, input),
          );
        } catch (error) {
          return jsonError(error);
        }
      },
    },
  },
});
