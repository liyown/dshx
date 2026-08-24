import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getPlatformProxy } from "wrangler";

import { createAuth } from "./auth.server";

describe("Better Auth account adapter with local D1", () => {
  let proxy: Awaited<ReturnType<typeof getPlatformProxy<Env>>>;

  beforeAll(async () => {
    proxy = await getPlatformProxy<Env>({
      configPath: "wrangler.jsonc",
      persist: true,
      remoteBindings: false,
    });
  });

  afterAll(async () => proxy.dispose());

  it("queries an OAuth account by issuer and provider account ID", async () => {
    const auth = createAuth({
      cloudflare: {
        DB: proxy.env.DB,
        SITE_URL: "http://localhost:3000",
        BETTER_AUTH_SECRET: "better-auth-integration-test-secret",
      },
    });
    const context = await auth.$context;

    expect(context.options.user?.additionalFields?.["githubId"]?.input).toBe(true);
    expect(context.options.user?.additionalFields?.["githubLogin"]?.input).toBe(true);

    await expect(
      context.internalAdapter.findAccountOwnerByKey({
        issuer: "local:oauth:github",
        accountId: `missing-${crypto.randomUUID()}`,
      }),
    ).resolves.toBeNull();
  });
});
