import { inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getPlatformProxy } from "wrangler";

import { sha256 } from "@/lib/auth/tokens.server";
import { createDatabase, type Database } from "@/lib/db/client";
import { agentResources, apiTokens, authUsers, userProfiles } from "@/lib/db/schema";
import {
  AGENT_RESOURCE_DEFINITIONS,
  clearAgentResource,
  decryptValue,
  encryptValue,
  listAgentResourceStatus,
  loadAgentResources,
  saveAgentResource,
} from "./agent-resources.server";
import { Route as BundleRoute } from "@/routes/api/ops/v1/agent-bundle";

type Handler = (input: {
  request: Request;
  context: unknown;
  params: Record<string, string>;
}) => Promise<Response>;

function base64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}

describe("agent resources and authenticated bundle", () => {
  let proxy: Awaited<ReturnType<typeof getPlatformProxy<Env>>>;
  let db: Database;
  let context: unknown;
  const key = crypto.getRandomValues(new Uint8Array(32));
  const userIds: string[] = [];

  beforeAll(async () => {
    proxy = await getPlatformProxy<Env>({
      configPath: "wrangler.jsonc",
      persist: true,
      remoteBindings: false,
    });
    db = createDatabase(proxy.env.DB);
    context = {
      cloudflare: { ...proxy.env, AGENT_RESOURCE_KEY: base64(key) },
    };
  });

  afterAll(async () => {
    await db.delete(agentResources);
    if (userIds.length) {
      await db.delete(apiTokens).where(inArray(apiTokens.userId, userIds));
      await db.delete(userProfiles).where(inArray(userProfiles.userId, userIds));
      await db.delete(authUsers).where(inArray(authUsers.id, userIds));
    }
    await proxy.dispose();
  });

  async function user(role: "admin" | "operator") {
    const id = crypto.randomUUID();
    userIds.push(id);
    await db.insert(authUsers).values({ id, name: role, email: `${id}@example.test` });
    await db.insert(userProfiles).values({
      userId: id,
      githubId: id,
      githubLogin: `${role}-${id}`,
      role,
    });
    return id;
  }

  async function token(userId: string, scopes: string[]) {
    const raw = crypto.randomUUID();
    await db.insert(apiTokens).values({
      id: crypto.randomUUID(),
      userId,
      label: "Agent bundle test",
      tokenPrefix: raw.slice(0, 8),
      tokenHash: await sha256(raw),
      scopesJson: scopes,
      expiresAt: new Date(Date.now() + 60_000),
    });
    return raw;
  }

  it("round-trips encrypted values without storing plaintext", async () => {
    const encrypted = await encryptValue("fixture-github-token", key);
    expect(encrypted.ciphertext).not.toContain("fixture-github-token");
    await expect(decryptValue(encrypted.iv, encrypted.ciphertext, key)).resolves.toBe(
      "fixture-github-token",
    );
    await expect(
      decryptValue(encrypted.iv, encrypted.ciphertext, crypto.getRandomValues(new Uint8Array(32))),
    ).rejects.toThrow();
  });

  it("saves, reports, loads, and clears allowlisted resources", async () => {
    const admin = await user("admin");
    await saveAgentResource(db, context, "githubToken", "fixture-local-token", admin);
    const status = await listAgentResourceStatus(db);
    expect(status).toContainEqual(
      expect.objectContaining({
        key: "githubToken",
        env: AGENT_RESOURCE_DEFINITIONS.githubToken.env,
        configured: true,
      }),
    );
    await expect(loadAgentResources(db, context)).resolves.toEqual({
      GITHUB_TOKEN: "fixture-local-token",
    });
    await clearAgentResource(db, "githubToken");
    await expect(loadAgentResources(db, context)).resolves.toEqual({});
  });

  it("returns prompt and resources only to an administrator bearer token", async () => {
    const admin = await user("admin");
    const operator = await user("operator");
    await saveAgentResource(db, context, "githubToken", "fixture-bundle-token", admin);
    const handler = BundleRoute.options.server?.handlers as unknown as Record<string, Handler>;
    const get = handler["GET"]!;

    const anonymous = await get({
      request: new Request("https://hub.test/api/ops/v1/agent-bundle"),
      context,
      params: {},
    });
    expect(anonymous.status).toBe(401);
    await expect(anonymous.json()).resolves.toMatchObject({
      ok: false,
      error: expect.objectContaining({ code: expect.any(String) }),
    });

    const denied = await get({
      request: new Request("https://hub.test/api/ops/v1/agent-bundle", {
        headers: { authorization: `Bearer ${await token(operator, ["catalog:write"])}` },
      }),
      context,
      params: {},
    });
    expect(denied.status).toBe(403);
    await expect(denied.json()).resolves.toMatchObject({ ok: false });

    const response = await get({
      request: new Request("https://hub.test/api/ops/v1/agent-bundle", {
        headers: { authorization: `Bearer ${await token(admin, ["catalog:write"])}` },
      }),
      context,
      params: {},
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("x-robots-tag")).toBe("noindex");
    const envelope = (await response.json()) as {
      ok: boolean;
      data: {
        bootstrap: string;
        prompt: string;
        resources: Record<string, string>;
        meta: { promptVersion: number; cliVersion: string };
      };
      meta: { requestId: string };
    };
    // The operations CLI requires every /api/ops/v1 success response to use the
    // shared envelope; a bare bundle object fails as invalid_hub_response.
    expect(envelope.ok).toBe(true);
    expect(envelope.meta.requestId).toBeTruthy();
    expect(response.headers.get("x-request-id")).toBe(envelope.meta.requestId);
    const body = envelope.data;
    expect(body.bootstrap).toContain("ops bundle");
    expect(body.prompt).toContain("Mandatory start checklist");
    expect(body.resources).toEqual({ GITHUB_TOKEN: "fixture-bundle-token" });
    expect(body.meta.promptVersion).toBe(11);
    expect(body.meta.cliVersion).toMatch(/^\d+\.\d+\.\d+/u);
  });
});
