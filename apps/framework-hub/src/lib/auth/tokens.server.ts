import { and, eq, gt, isNull } from "drizzle-orm";

import type { Database } from "@/lib/db/client";
import { apiTokens, userProfiles } from "@/lib/db/schema";
import { HttpError } from "@/lib/http";

export async function sha256(value: string | ArrayBuffer): Promise<string> {
  const bytes = typeof value === "string" ? new TextEncoder().encode(value) : value;
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function randomToken(prefix = "dshx"): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const value = btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
  return `${prefix}_${value}`;
}

export async function authenticateApiToken(db: Database, request: Request) {
  const authorization = request.headers.get("authorization") ?? "";
  if (!authorization.startsWith("Bearer "))
    throw new HttpError(401, "Bearer token required", "unauthorized");
  const raw = authorization.slice(7).trim();
  if (!raw) throw new HttpError(401, "Bearer token required", "unauthorized");
  const hash = await sha256(raw);
  const now = new Date();
  const [row] = await db
    .select({ token: apiTokens, profile: userProfiles })
    .from(apiTokens)
    .innerJoin(userProfiles, eq(userProfiles.userId, apiTokens.userId))
    .where(
      and(eq(apiTokens.tokenHash, hash), isNull(apiTokens.revokedAt), gt(apiTokens.expiresAt, now)),
    )
    .limit(1);
  if (!row || row.profile.status !== "active")
    throw new HttpError(401, "Token is invalid or expired", "invalid_token");
  await db.update(apiTokens).set({ lastUsedAt: now }).where(eq(apiTokens.id, row.token.id));
  return row;
}

export async function requireApiToken(db: Database, request: Request, scope: string) {
  const row = await authenticateApiToken(db, request);
  if (!row.token.scopesJson.includes(scope) && !row.token.scopesJson.includes("*"))
    throw new HttpError(403, `Token lacks ${scope}`, "insufficient_scope");
  return row;
}
