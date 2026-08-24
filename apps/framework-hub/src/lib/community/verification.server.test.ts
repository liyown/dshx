import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createCommunityVerification,
  getCommunityVerificationExpiry,
  verifyTurnstileToken,
} from "./verification.server";

const productionContext = {
  cloudflare: {
    SITE_URL: "https://dshx.io",
    BETTER_AUTH_SECRET: "test-auth-secret-with-enough-entropy",
    TURNSTILE_SECRET_KEY: "test-turnstile-secret",
  },
};

function requestWithCookie(cookie: string, headers?: HeadersInit) {
  const requestHeaders = new Headers(headers);
  requestHeaders.set("cookie", cookie.split(";", 1)[0] ?? "");
  return new Request("https://dshx.io/api/community/verification", {
    headers: requestHeaders,
  });
}

describe("community human verification", () => {
  afterEach(() => vi.restoreAllMocks());

  it("creates a signed, user-bound proof that expires after 30 minutes", async () => {
    const now = Date.parse("2026-08-24T08:00:00.000Z");
    const verification = await createCommunityVerification(productionContext, "user-1", now);
    const request = requestWithCookie(verification.cookie);

    expect(verification.cookie).toContain("HttpOnly");
    expect(verification.cookie).toContain("SameSite=Lax");
    expect(verification.cookie).toContain("Secure");
    await expect(
      getCommunityVerificationExpiry(request, productionContext, "user-1", now + 1_000),
    ).resolves.toBe(verification.expiresAt);
    await expect(
      getCommunityVerificationExpiry(request, productionContext, "user-2", now + 1_000),
    ).resolves.toBeNull();
    await expect(
      getCommunityVerificationExpiry(request, productionContext, "user-1", verification.expiresAt),
    ).resolves.toBeNull();
  });

  it("rejects a modified proof", async () => {
    const verification = await createCommunityVerification(productionContext, "user-1");
    const cookie = verification.cookie.replace(/=./u, "=x");
    await expect(
      getCommunityVerificationExpiry(requestWithCookie(cookie), productionContext, "user-1"),
    ).resolves.toBeNull();
  });

  it("passes the challenge and connecting IP to Cloudflare", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(Response.json({ success: true }));
    await verifyTurnstileToken(
      requestWithCookie("", { "cf-connecting-ip": "203.0.113.7" }),
      productionContext,
      "challenge-token",
    );

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe("https://challenges.cloudflare.com/turnstile/v0/siteverify");
    expect(init?.method).toBe("POST");
    expect(init?.body).toBeInstanceOf(FormData);
    expect((init?.body as FormData).get("response")).toBe("challenge-token");
    expect((init?.body as FormData).get("remoteip")).toBe("203.0.113.7");
  });

  it("rejects an unsuccessful Cloudflare challenge", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({ success: false }));
    await expect(
      verifyTurnstileToken(requestWithCookie(""), productionContext, "invalid-token"),
    ).rejects.toMatchObject({ status: 422, code: "turnstile_failed" });
  });
});
