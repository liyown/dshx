import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getPlatformProxy } from "wrangler";

import { exchangeCliToken, pkceChallenge, revokeToken } from "./cli.server";
import { randomToken, requireApiToken, sha256 } from "./tokens.server";
import { createDatabase, type Database } from "@/lib/db/client";
import { authUsers, cliAuthorizations, userProfiles } from "@/lib/db/schema";

describe("revocable CLI tokens with local D1", () => {
  let proxy: Awaited<ReturnType<typeof getPlatformProxy<Env>>>;
  let db: Database;
  beforeAll(async () => {
    proxy = await getPlatformProxy<Env>({
      configPath: "wrangler.jsonc",
      persist: true,
      remoteBindings: false,
    });
    db = createDatabase(proxy.env.DB);
  });
  afterAll(async () => proxy.dispose());

  it("exchanges a one-time PKCE code and rejects the revoked bearer token", async () => {
    const userId = crypto.randomUUID();
    const authorizationId = crypto.randomUUID();
    const state = randomToken("state");
    const verifier = randomToken("verifier").slice(0, 80);
    const code = randomToken("code");
    await db
      .insert(authUsers)
      .values({ id: userId, name: "Operator", email: `${userId}@example.test` });
    await db.insert(userProfiles).values({
      userId,
      githubId: `github-${userId}`,
      githubLogin: `operator-${userId}`,
      role: "operator",
    });
    await db.insert(cliAuthorizations).values({
      id: authorizationId,
      stateHash: await sha256(state),
      codeChallenge: await pkceChallenge(verifier),
      callbackUrl: "http://127.0.0.1:43123/callback",
      requestedScopesJson: ["catalog:write"],
      status: "approved",
      approvedByUserId: userId,
      exchangeCodeHash: await sha256(code),
      expiresAt: new Date(Date.now() + 60_000),
    });
    const exchanged = await exchangeCliToken(db, { authorizationId, code, codeVerifier: verifier });
    const request = new Request("https://hub.example/api", {
      headers: { authorization: `Bearer ${exchanged.token}` },
    });
    expect((await requireApiToken(db, request, "catalog:write")).profile.userId).toBe(userId);
    await revokeToken(db, exchanged.token);
    await expect(requireApiToken(db, request, "catalog:write")).rejects.toThrow(
      "invalid or expired",
    );
    await expect(
      exchangeCliToken(db, { authorizationId, code, codeVerifier: verifier }),
    ).rejects.toThrow("invalid or expired");
  });
});
