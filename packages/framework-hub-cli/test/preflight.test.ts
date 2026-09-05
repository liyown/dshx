import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { readCliPackage } from "../src/capabilities.js";
import { normalizedError } from "../src/errors.js";
import { setKeyringEntryFactoryForTests } from "../src/keychain.js";
import { preflight } from "../src/preflight.js";

const hub = "https://hub.test";
const credential = "test-secret-credential";
const authentication = {
  user: { id: "user-1", login: "operator", role: "admin" },
  token: {
    prefix: "private-prefix",
    scopes: ["catalog:write"],
    expiresAt: "2099-01-01T00:00:00.000Z",
  },
};

function authResponse(data: unknown = authentication) {
  return new Response(JSON.stringify(data), {
    headers: {
      "content-type": "application/json",
      "x-request-id": "auth-request-1",
    },
  });
}

beforeEach(() => {
  setKeyringEntryFactoryForTests(() => ({
    getPassword: () => credential,
    setPassword: () => {
      throw new Error("Preflight must not write credentials");
    },
    deletePassword: () => {
      throw new Error("Preflight must not delete credentials");
    },
  }));
});

afterEach(() => {
  setKeyringEntryFactoryForTests();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("fixed operations preflight", () => {
  it("rejects a version mismatch before any network request", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const error = await preflight(hub, "0.0.0-mismatched").catch(
      (caught: unknown) => caught,
    );
    expect(normalizedError(error).error).toMatchObject({
      code: "cli_version_mismatch",
      retryable: false,
      details: { expected: "0.0.0-mismatched" },
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("performs one authenticated read and omits credential and user details", async () => {
    const fetch = vi.fn(async () => authResponse());
    vi.stubGlobal("fetch", fetch);
    const cliPackage = await readCliPackage();
    const result = await preflight(hub, cliPackage.version);

    expect(result).toEqual({
      ready: true,
      hub,
      package: cliPackage,
      apiProtocolVersion: 1,
      authentication: {
        verified: true,
        scopes: ["catalog:write"],
        expiresAt: "2099-01-01T00:00:00.000Z",
      },
      requestId: "auth-request-1",
    });
    expect(fetch).toHaveBeenCalledOnce();
    const [url, init] = fetch.mock.calls[0] as unknown as [URL, RequestInit];
    expect(url.toString()).toBe(`${hub}/api/cli/token`);
    expect(init.method ?? "GET").toBe("GET");
    expect(new Headers(init.headers).get("authorization")).toBe(
      `Bearer ${credential}`,
    );
    const output = JSON.stringify(result);
    for (const secret of [credential, "private-prefix", "operator", "user-1"])
      expect(output).not.toContain(secret);
    expect(output).not.toContain('"token"');
  });

  it("retains the original access failure code and request ID without fallback", async () => {
    const fetch = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            ok: false,
            error: {
              code: "permission_denied",
              message: "Catalog access was denied.",
              retryable: false,
              details: { requiredScope: "catalog:write" },
            },
            meta: { requestId: "denied-request-1" },
          }),
          { status: 403 },
        ),
    );
    vi.stubGlobal("fetch", fetch);
    const error = await preflight(hub).catch((caught: unknown) => caught);
    expect(normalizedError(error)).toMatchObject({
      error: {
        code: "permission_denied",
        retryable: false,
        details: { requiredScope: "catalog:write" },
      },
      requestId: "denied-request-1",
    });
    expect(fetch).toHaveBeenCalledOnce();
  });

  it("does not report ready for a malformed credential response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => authResponse({ healthy: true })),
    );
    const error = await preflight(hub).catch((caught: unknown) => caught);
    expect(normalizedError(error)).toMatchObject({
      error: { code: "invalid_hub_response" },
      requestId: "auth-request-1",
    });
  });

  it("does not report ready for credentials without the operations scope", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        authResponse({
          ...authentication,
          token: { ...authentication.token, scopes: ["profile:read"] },
        }),
      ),
    );
    const error = await preflight(hub).catch((caught: unknown) => caught);
    expect(normalizedError(error)).toMatchObject({
      error: { code: "insufficient_scope", retryable: false },
      requestId: "auth-request-1",
    });
  });

  it("works independently of CODEX_HOME and does not invoke aggregation", async () => {
    vi.stubEnv("CODEX_HOME", "/nonexistent/codex-home");
    const fetch = vi.fn(async (url: URL) => {
      if (url.pathname !== "/api/cli/token")
        throw new Error("Aggregation is not part of the authentication gate");
      return authResponse();
    });
    vi.stubGlobal("fetch", fetch);
    await expect(preflight(hub)).resolves.toMatchObject({ ready: true });
    expect(fetch).toHaveBeenCalledOnce();
  });
});
