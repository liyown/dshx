import { afterEach, describe, expect, it, vi } from "vitest";

import {
  authorizationPageUrl,
  login,
  logout,
  openAuthorizationUrl,
  parseAuthorizationCallback,
} from "../src/auth.js";
import { setKeyringEntryFactoryForTests } from "../src/keychain.js";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  setKeyringEntryFactoryForTests();
  vi.restoreAllMocks();
});

describe("CLI authorization browser flow", () => {
  it("redirects the loopback callback into the localized Hub authorization page", () => {
    expect(
      new URL(
        authorizationPageUrl("https://dshx.io", "zh-CN,zh;q=0.9", "success"),
      ),
    ).toMatchObject({
      origin: "https://dshx.io",
      pathname: "/zh/auth/cli",
      search: "?status=success",
    });
    expect(
      new URL(
        authorizationPageUrl("https://dshx.io", "en-US", "error", "exchange"),
      ),
    ).toMatchObject({
      pathname: "/en/auth/cli",
      search: "?status=error&reason=exchange",
    });
  });

  it("prints the authorization URL when the browser cannot be opened", async () => {
    const chunks: string[] = [];
    await expect(
      openAuthorizationUrl(
        "https://dshx.io/en/auth/cli",
        async () => {
          throw new Error("no browser");
        },
        { write: (value) => chunks.push(String(value)) },
      ),
    ).resolves.toBe(false);
    expect(chunks.join("")).toContain("https://dshx.io/en/auth/cli");
  });

  it("uses stable errors for invalid callback fields", () => {
    const mismatch = (() => {
      try {
        parseAuthorizationCallback(
          new URL(
            "http://127.0.0.1/callback?state=wrong&code=a&authorization_id=b",
          ),
          "expected",
        );
      } catch (error) {
        return error;
      }
    })();
    expect(mismatch).toMatchObject({
      issue: { code: "authorization_state_mismatch", retryable: false },
    });
    const incomplete = (() => {
      try {
        parseAuthorizationCallback(
          new URL("http://127.0.0.1/callback?state=expected"),
          "expected",
        );
      } catch (error) {
        return error;
      }
    })();
    expect(incomplete).toMatchObject({
      issue: { code: "authorization_callback_incomplete", retryable: false },
    });
  });

  it("normalizes browser authorization timeout without waiting five minutes", async () => {
    globalThis.fetch = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            authorizeUrl: "https://dshx.io/en/auth/cli?request=test",
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
    );
    const error = await login("https://dshx.io", ["catalog:write"], {
      opener: async () => true,
      output: { write: () => undefined },
      timeoutMs: 1,
    }).catch((caught: unknown) => caught);
    expect(error).toMatchObject({
      issue: { code: "authorization_timeout", retryable: true },
    });
  });

  it("accepts a legacy 204 logout response before deleting the local token", async () => {
    let token: string | null = "test-token";
    setKeyringEntryFactoryForTests(() => ({
      getPassword: () => token,
      setPassword: (value) => {
        token = value;
      },
      deletePassword: () => {
        token = null;
        return true;
      },
    }));
    globalThis.fetch = vi.fn(async () => new Response(null, { status: 204 }));

    await expect(logout("https://dshx.io")).resolves.toBeUndefined();
    expect(token).toBeNull();
    expect(globalThis.fetch).toHaveBeenCalledOnce();
  });
});
