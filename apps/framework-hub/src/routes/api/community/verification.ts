import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { sessionRoute } from "@/lib/api/route";
import {
  createCommunityVerification,
  getCommunityVerificationExpiry,
  verifyTurnstileToken,
} from "@/lib/community/verification.server";

const verificationSchema = z.object({
  turnstileToken: z.string().min(1).max(2_048),
});

const noStore = { "cache-control": "no-store" };

export const Route = createFileRoute("/api/community/verification")({
  server: {
    handlers: {
      GET: sessionRoute({}, async ({ request, context, session }) => {
        const expiresAt = await getCommunityVerificationExpiry(request, context, session.user.id);
        return Response.json(
          {
            verified: expiresAt !== null,
            expiresAt: expiresAt === null ? null : new Date(expiresAt).toISOString(),
          },
          { headers: noStore },
        );
      }),
      POST: sessionRoute(
        { body: verificationSchema, sameOrigin: true },
        async ({ request, context, session, input }) => {
          await verifyTurnstileToken(request, context, input.turnstileToken);
          const verification = await createCommunityVerification(context, session.user.id);
          return Response.json(
            { verified: true, expiresAt: new Date(verification.expiresAt).toISOString() },
            { headers: { ...noStore, "set-cookie": verification.cookie } },
          );
        },
      ),
    },
  },
});
