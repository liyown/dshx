import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { requireSameOrigin, requireSession } from "@/lib/auth/auth.server";
import {
  createCommunityVerification,
  getCommunityVerificationExpiry,
  verifyTurnstileToken,
} from "@/lib/community/verification.server";
import { jsonError, readJson } from "@/lib/http";

const verificationSchema = z.object({
  turnstileToken: z.string().min(1).max(2_048),
});

export const Route = createFileRoute("/api/community/verification")({
  server: {
    handlers: {
      GET: async ({ request, context }) => {
        try {
          const { session } = await requireSession(request, context);
          const expiresAt = await getCommunityVerificationExpiry(request, context, session.user.id);
          return Response.json(
            {
              verified: expiresAt !== null,
              expiresAt: expiresAt === null ? null : new Date(expiresAt).toISOString(),
            },
            { headers: { "cache-control": "no-store" } },
          );
        } catch (error) {
          return jsonError(error);
        }
      },
      POST: async ({ request, context }) => {
        try {
          requireSameOrigin(request, context);
          const { session } = await requireSession(request, context);
          const input = await readJson(request, verificationSchema);
          await verifyTurnstileToken(request, context, input.turnstileToken);
          const verification = await createCommunityVerification(context, session.user.id);
          return Response.json(
            { verified: true, expiresAt: new Date(verification.expiresAt).toISOString() },
            {
              headers: {
                "cache-control": "no-store",
                "set-cookie": verification.cookie,
              },
            },
          );
        } catch (error) {
          return jsonError(error);
        }
      },
    },
  },
});
