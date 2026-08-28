import { createFileRoute } from "@tanstack/react-router";

import { requireSession } from "@/lib/auth/auth.server";
import { accountDeleteSchema } from "@/lib/community/contracts";
import { requireCommunityWrite } from "@/lib/community/guard.server";
import { anonymizeAccount } from "@/lib/community/marketplace.server";
import { requireDatabase } from "@/lib/db/client";
import { jsonError, readJson } from "@/lib/http";

export const Route = createFileRoute("/api/me/account")({
  server: {
    handlers: {
      DELETE: async ({ request, context }) => {
        try {
          const auth = await requireSession(request, context);
          const input = await readJson(request, accountDeleteSchema);
          await requireCommunityWrite(
            request,
            context,
            auth.db,
            auth.session.user.id,
            "account.delete",
            input.turnstileToken,
          );
          return Response.json(
            await anonymizeAccount(requireDatabase(context), auth.session.user.id),
          );
        } catch (error) {
          return jsonError(error);
        }
      },
    },
  },
});
