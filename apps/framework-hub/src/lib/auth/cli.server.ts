import { and, eq, gt, isNull } from "drizzle-orm";
import { z } from "zod";

import type { Database } from "@/lib/db/client";
import { apiTokens, cliAuthorizations, userProfiles } from "@/lib/db/schema";
import { HttpError, uuid } from "@/lib/http";
import { randomToken, sha256 } from "./tokens.server";

export const cliAuthorizationSchema = z.object({
  callbackUrl: z.string().url().max(500),
  state: z.string().min(24).max(512),
  codeChallenge: z.string().regex(/^[A-Za-z0-9_-]{43,128}$/),
  scopes: z
    .array(z.enum(["catalog:write", "moderation:write", "users:write", "approvals:write"]))
    .min(1)
    .max(4),
});

export const cliTokenExchangeSchema = z.object({
  authorizationId: z.string().uuid(),
  code: z.string().min(24).max(512),
  codeVerifier: z.string().regex(/^[A-Za-z0-9._~-]{43,128}$/),
});

export function assertLoopbackCallback(value: string): URL {
  const url = new URL(value);
  if (
    url.protocol !== "http:" ||
    !(["127.0.0.1", "[::1]", "localhost"] as string[]).includes(url.hostname)
  ) {
    throw new HttpError(422, "CLI callback must use an HTTP loopback address", "invalid_callback");
  }
  if (url.username || url.password)
    throw new HttpError(422, "CLI callback credentials are forbidden", "invalid_callback");
  return url;
}

export async function pkceChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

export async function exchangeCliToken(
  db: Database,
  input: z.infer<typeof cliTokenExchangeSchema>,
) {
  const [authorization] = await db
    .select()
    .from(cliAuthorizations)
    .where(
      and(
        eq(cliAuthorizations.id, input.authorizationId),
        eq(cliAuthorizations.status, "approved"),
        gt(cliAuthorizations.expiresAt, new Date()),
      ),
    )
    .limit(1);
  if (!authorization?.approvedByUserId || !authorization.exchangeCodeHash)
    throw new HttpError(401, "Authorization is invalid or expired", "invalid_authorization");
  if (
    (await sha256(input.code)) !== authorization.exchangeCodeHash ||
    (await pkceChallenge(input.codeVerifier)) !== authorization.codeChallenge
  ) {
    throw new HttpError(
      401,
      "Authorization code or PKCE verifier is invalid",
      "invalid_authorization",
    );
  }
  const raw = randomToken("dshx_hub");
  const id = uuid();
  const expiresAt = new Date(Date.now() + 180 * 86_400_000);
  await db.batch([
    db.insert(apiTokens).values({
      id,
      userId: authorization.approvedByUserId,
      label: "DSHX Hub CLI",
      tokenPrefix: raw.slice(0, 18),
      tokenHash: await sha256(raw),
      scopesJson: authorization.requestedScopesJson,
      expiresAt,
    }),
    db
      .update(cliAuthorizations)
      .set({ status: "consumed", consumedAt: new Date() })
      .where(eq(cliAuthorizations.id, authorization.id)),
  ]);
  return {
    token: raw,
    tokenType: "Bearer",
    scopes: authorization.requestedScopesJson,
    expiresAt: expiresAt.toISOString(),
  };
}

export async function revokeToken(db: Database, raw: string) {
  const [token] = await db
    .update(apiTokens)
    .set({ revokedAt: new Date() })
    .where(and(eq(apiTokens.tokenHash, await sha256(raw)), isNull(apiTokens.revokedAt)))
    .returning();
  if (!token) throw new HttpError(401, "Token not found", "invalid_token");
}

export async function getProfileForApproval(db: Database, userId: string) {
  const [profile] = await db
    .select()
    .from(userProfiles)
    .where(eq(userProfiles.userId, userId))
    .limit(1);
  if (!profile || !(["operator", "moderator", "admin"] as string[]).includes(profile.role)) {
    throw new HttpError(
      403,
      "An operator role is required for CLI authorization",
      "operator_required",
    );
  }
  return profile;
}
