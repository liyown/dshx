import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getPlatformProxy } from "wrangler";

import { anonymousSubmissionKey, createSubmission } from "./marketplace.server";

describe("account-free plugin submissions with local D1", () => {
  let proxy: Awaited<ReturnType<typeof getPlatformProxy<Env>>>;
  let binding: D1Database;

  beforeAll(async () => {
    proxy = await getPlatformProxy<Env>({
      configPath: "wrangler.jsonc",
      persist: true,
      remoteBindings: false,
    });
    binding = proxy.env.DB;
  });

  afterAll(async () => proxy.dispose());

  it("stores anonymous submissions without a user and keeps retries idempotent", async () => {
    const submitterKey = `anonymous:test-${crypto.randomUUID()}`;
    const idempotencyKey = `submission:${crypto.randomUUID()}`;
    const input = {
      userId: null,
      submitterKey,
      repositoryUrl: "https://github.com/Example/Public-Plugin.git",
      idempotencyKey,
    };
    const first = await createSubmission(binding, input);
    const repeated = await createSubmission(binding, input);

    expect(repeated).toMatchObject({ id: first?.["id"] });
    expect(first).toMatchObject({
      user_id: null,
      repository_url: "https://github.com/Example/Public-Plugin",
      repository_full_name: "Example/Public-Plugin",
      status: "queued",
    });
    expect(first).not.toHaveProperty("submitter_key");
    const stored = await binding
      .prepare("select submitter_key from plugin_submissions where id=?")
      .bind(first?.["id"])
      .first<{ submitter_key: string }>();
    expect(stored?.submitter_key).toBe(submitterKey);
  });

  it("limits anonymous submission bursts per private submitter key", async () => {
    const submitterKey = `anonymous:limit-${crypto.randomUUID()}`;
    for (let index = 0; index < 10; index += 1) {
      await createSubmission(binding, {
        userId: null,
        submitterKey,
        repositoryUrl: `https://github.com/example/public-plugin-${index}`,
        idempotencyKey: `submission:${crypto.randomUUID()}`,
      });
    }
    await expect(
      createSubmission(binding, {
        userId: null,
        submitterKey,
        repositoryUrl: "https://github.com/example/one-too-many",
        idempotencyKey: `submission:${crypto.randomUUID()}`,
      }),
    ).rejects.toMatchObject({ status: 429, code: "rate_limited" });
  });

  it("derives a stable opaque key from the Cloudflare client address", async () => {
    const secret = "submission-test-secret";
    const first = await anonymousSubmissionKey(
      new Request("https://dshx.test/api/submissions", {
        headers: { "cf-connecting-ip": "203.0.113.9" },
      }),
      secret,
    );
    const repeated = await anonymousSubmissionKey(
      new Request("https://dshx.test/api/submissions", {
        headers: { "cf-connecting-ip": "203.0.113.9" },
      }),
      secret,
    );
    const other = await anonymousSubmissionKey(
      new Request("https://dshx.test/api/submissions", {
        headers: { "cf-connecting-ip": "203.0.113.10" },
      }),
      secret,
    );
    expect(first).toBe(repeated);
    expect(first).not.toBe(other);
    expect(first).not.toContain("203.0.113.9");
  });
});
