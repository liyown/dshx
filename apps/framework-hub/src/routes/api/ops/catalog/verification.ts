import { createFileRoute } from "@tanstack/react-router";

import { requireApiToken } from "@/lib/auth/tokens.server";
import { targetVerificationPageSchema } from "@/lib/catalog/contracts";
import { commitTargetVerification } from "@/lib/catalog/verification.server";
import { requireD1, requireDatabase } from "@/lib/db/client";
import { jsonError, readJson } from "@/lib/http";

export const Route = createFileRoute("/api/ops/catalog/verification")({
  server: {
    handlers: {
      PUT: async ({ request, context }) => {
        try {
          const db = requireDatabase(context);
          await requireApiToken(db, request, "catalog:write");
          const input = await readJson(request, targetVerificationPageSchema);
          return Response.json(await commitTargetVerification(requireD1(context), input));
        } catch (error) {
          return jsonError(error);
        }
      },
    },
  },
});
