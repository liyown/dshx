import { and, eq, gt, isNull, lt, or, sql } from "drizzle-orm";

import type { Database } from "@/lib/db/client";
import { requireBindings } from "@/lib/db/context";
import { communityRateLimits, userRestrictions } from "@/lib/db/schema";
import { HttpError } from "@/lib/http";

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

  const bindings = requireBindings(context);
  if (!bindings.TURNSTILE_SECRET_KEY)
    throw new HttpError(503, "Turnstile is not configured", "turnstile_unavailable");
  const form = new FormData();
  form.set("secret", bindings.TURNSTILE_SECRET_KEY);
  form.set("response", turnstileToken);
  const ip = request.headers.get("cf-connecting-ip");
  if (ip) form.set("remoteip", ip);
  const result = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    body: form,
  });
  const verification = (await result.json()) as { success?: boolean };
  if (!verification.success)
    throw new HttpError(422, "Turnstile verification failed", "turnstile_failed");
}
