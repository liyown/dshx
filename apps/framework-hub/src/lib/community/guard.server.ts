import { and, eq, gt, isNull, lt, or, sql } from "drizzle-orm";

import type { Database } from "@/lib/db/client";
import { communityRateLimits, userRestrictions } from "@/lib/db/schema";
import { HttpError } from "@/lib/http";
import {
  getCommunityVerificationExpiry,
  verifyTurnstileToken,
} from "@/lib/community/verification.server";

export async function requireCommunityWrite(
  request: Request,
  context: unknown,
  db: Database,
  userId: string,
  action: string,
  turnstileToken: string,
) {
  const now = new Date();
  const [restriction] = await db
    .select()
    .from(userRestrictions)
    .where(
      and(
        eq(userRestrictions.userId, userId),
        isNull(userRestrictions.revokedAt),
        or(isNull(userRestrictions.expiresAt), gt(userRestrictions.expiresAt, now)),
      ),
    )
    .limit(1);
  if (restriction) throw new HttpError(403, "Community writing is restricted", "user_restricted");

  const windowStartMs = Math.floor(Date.now() / 60_000) * 60_000;
  const windowStart = new Date(windowStartMs);
  await db
    .delete(communityRateLimits)
    .where(lt(communityRateLimits.windowStart, new Date(windowStartMs - 86_400_000)));
  await db
    .insert(communityRateLimits)
    .values({ userId, windowStart, action, requestCount: 1 })
    .onConflictDoUpdate({
      target: [
        communityRateLimits.userId,
        communityRateLimits.windowStart,
        communityRateLimits.action,
      ],
      set: { requestCount: sql`${communityRateLimits.requestCount} + 1` },
    });
  const [limit] = await db
    .select()
    .from(communityRateLimits)
    .where(
      and(
        eq(communityRateLimits.userId, userId),
        eq(communityRateLimits.windowStart, windowStart),
        eq(communityRateLimits.action, action),
      ),
    )
    .limit(1);
  if ((limit?.requestCount ?? 0) > 10)
    throw new HttpError(429, "Too many community writes", "rate_limited");

  if (await getCommunityVerificationExpiry(request, context, userId)) return;
  await verifyTurnstileToken(request, context, turnstileToken);
}
