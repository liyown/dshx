import { afterEach, describe, expect, it, vi } from "vitest";

import { api, ApiError } from "../src/api.js";
import { normalizedError } from "../src/errors.js";
import { successEnvelope } from "../src/protocol.js";

const originalFetch = globalThis.fetch;
const hub = "https://hub.test";
const path = "/api/ops/v1/status";

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function request(init: RequestInit = {}, requestPath = path) {
  return api(hub, requestPath, init, "none");
}

function respond(body: unknown, init: ResponseInit = {}) {
  globalThis.fetch = vi.fn(
    async () =>
      new Response(JSON.stringify(body), {
        ...init,
        headers: { "content-type": "application/json", ...init.headers },
      }),
  );
}

describe("Hub request diagnostics", () => {
  it.each([403, 200])(
    "identifies a Cloudflare challenge with HTTP %s without reading its body",
    async (status) => {
      const response = new Response("<html>secret-response-body</html>", {
        status,
        headers: {
          "cf-mitigated": "challenge",
          "cf-ray": "abc123-PVG",
          "content-type": "text/html",
          "x-request-id": "edge-request",
        },
      });
      const read = vi.spyOn(response, "text");
      globalThis.fetch = vi.fn(async () => response);

      const error = await request(
        { headers: { authorization: "Bearer secret-token" } },
        `${path}?token=secret-query#secret-fragment`,
      ).catch((caught: unknown) => caught);

      expect(error).toBeInstanceOf(ApiError);
      expect(error).toMatchObject({
        status,
        requestId: "edge-request",
        body: null,
        issue: {
          code: "hub_edge_challenge",
          retryable: false,
          repairHint: expect.stringContaining("do not repeat auth login"),
          details: {
            httpStatus: status,
            cfRay: "abc123-PVG",
            requestPath: path,
          },
        },
      });
      expect(read).not.toHaveBeenCalled();
      expect(JSON.stringify(normalizedError(error))).not.toContain("secret");
      expect(globalThis.fetch).toHaveBeenCalledOnce();
    },
  );

  it("preserves a structured application denial and request identifier", async () => {
    respond(
      {
        ok: false,
        error: {
          code: "permission_denied",
          message: "The token does not allow catalog writes.",
          retryable: false,
          repairHint: "Request catalog:write access.",
          path: "token.scopes",
          details: { requiredScope: "catalog:write" },
        },
        meta: { requestId: "application-request" },
      },
      { status: 403, headers: { "cf-ray": "def456-PVG" } },
    );

    await expect(request()).rejects.toMatchObject({
      status: 403,
      requestId: "application-request",
      issue: {
        code: "permission_denied",
        message: "The token does not allow catalog writes.",
        retryable: false,
        repairHint: "Request catalog:write access.",
        path: "token.scopes",
        details: { requiredScope: "catalog:write", cfRay: "def456-PVG" },
      },
    });
  });

  it("does not guess the origin of an unstructured HTML 403", async () => {
    globalThis.fetch = vi.fn(
      async () =>
        new Response("<html>secret-response-body</html>", {
          status: 403,
          headers: { "content-type": "text/html", "cf-ray": "abc123-PVG" },
        }),
    );

    const error = await request().catch((caught: unknown) => caught);
    expect(error).toMatchObject({
      body: null,
      issue: {
        code: "hub_http_403",
        retryable: false,
        message: expect.stringContaining("rejecting layer is unknown"),
        repairHint: expect.stringContaining("Do not assume token expiry"),
        details: { httpStatus: 403, requestPath: path, cfRay: "abc123-PVG" },
      },
    });
    expect(JSON.stringify(normalizedError(error))).not.toContain("secret");
  });

  it.each(["30", "0"])("retains Retry-After seconds %s", async (value) => {
    respond({}, { status: 429, headers: { "retry-after": value } });

    await expect(request()).rejects.toMatchObject({
      issue: {
        code: "hub_http_429",
        retryable: true,
        details: { retryAfter: value, retryAfterSeconds: Number(value) },
      },
    });
    expect(globalThis.fetch).toHaveBeenCalledOnce();
  });

  it("retains a Retry-After HTTP date", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-05T00:00:00Z"));
    respond(
      {},
      {
        status: 429,
        headers: { "retry-after": "Sat, 05 Sep 2026 00:00:30 GMT" },
      },
    );

    await expect(request()).rejects.toMatchObject({
      issue: {
        details: {
          retryAfter: "Sat, 05 Sep 2026 00:00:30 GMT",
          retryAfterSeconds: 30,
        },
      },
    });
  });

  it.each(["secret-header", "-1", "1.5", "999999999999999999999"])(
    "omits an unusable Retry-After value %s",
    async (value) => {
      respond({}, { status: 429, headers: { "retry-after": value } });

      const error = await request().catch((caught: unknown) => caught);
      expect((error as ApiError).issue.details).not.toHaveProperty(
        "retryAfter",
      );
    },
  );

  it("preserves a normal operations envelope", async () => {
    const envelope = successEnvelope({ healthy: true }, [], "hub-request");
    respond(envelope);
    await expect(request()).resolves.toEqual(envelope);
  });

  it("accepts legacy public JSON and no-content responses", async () => {
    respond({ healthy: true });
    await expect(request({}, "/api/health")).resolves.toMatchObject({
      ok: true,
      data: { healthy: true },
    });
    globalThis.fetch = vi.fn(async () => new Response(null, { status: 204 }));
    await expect(request({}, "/api/session")).resolves.toMatchObject({
      ok: true,
      data: undefined,
    });
    await expect(request()).rejects.toMatchObject({
      issue: { code: "invalid_hub_response" },
    });
  });
});

describe("Hub request cancellation and timeout", () => {
  it("times out a stalled connection after 30 seconds without retrying a write", async () => {
    vi.useFakeTimers();
    let signal: AbortSignal | null | undefined;
    globalThis.fetch = vi.fn((_input, init) => {
      signal = init?.signal;
      return new Promise<Response>(() => undefined);
    });
    const result = request({ method: "POST", body: "{}" }).catch(
      (caught: unknown) => caught,
    );

    await vi.advanceTimersByTimeAsync(29_999);
    expect(signal?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);

    expect(await result).toMatchObject({
      status: 0,
      issue: {
        code: "hub_request_timeout",
        retryable: true,
        details: { timeoutMs: 30_000, httpStatus: 0, requestPath: path },
      },
    });
    expect(signal?.aborted).toBe(true);
    expect(globalThis.fetch).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("includes a stalled response body in the same 30-second deadline", async () => {
    vi.useFakeTimers();
    let stream: ReadableStreamDefaultController<Uint8Array> | undefined;
    globalThis.fetch = vi.fn(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10_000));
      return new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            stream = controller;
            controller.enqueue(new TextEncoder().encode('{"ok":'));
          },
        }),
        { headers: { "x-request-id": "body-request", "cf-ray": "abc123-PVG" } },
      );
    });
    const result = request().catch((caught: unknown) => caught);

    await vi.advanceTimersByTimeAsync(30_000);
    expect(await result).toMatchObject({
      status: 200,
      requestId: "body-request",
      issue: {
        code: "hub_request_timeout",
        details: { timeoutMs: 30_000, httpStatus: 200, cfRay: "abc123-PVG" },
      },
    });
    stream?.close();
    expect(globalThis.fetch).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("honors an already-cancelled caller without making a request", async () => {
    const controller = new AbortController();
    controller.abort(new Error("secret-abort-reason"));
    globalThis.fetch = vi.fn();

    const error = await request({ signal: controller.signal }).catch(
      (caught: unknown) => caught,
    );
    expect(error).toMatchObject({
      issue: { code: "hub_request_aborted", retryable: false },
    });
    expect(JSON.stringify(normalizedError(error))).not.toContain("secret");
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("normalizes cancellation even when the caller's abort reason is an ApiError", async () => {
    const controller = new AbortController();
    controller.abort(
      new ApiError(
        403,
        {
          code: "private_caller_error",
          message: "secret-abort-reason",
          retryable: true,
        },
        "caller-request",
        null,
      ),
    );

    await expect(request({ signal: controller.signal })).rejects.toMatchObject({
      issue: { code: "hub_request_aborted", retryable: false },
    });
  });

  it("propagates caller cancellation while the response body is pending", async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    let requestSignal: AbortSignal | null | undefined;
    let stream: ReadableStreamDefaultController<Uint8Array> | undefined;
    globalThis.fetch = vi.fn(async (_input, init) => {
      requestSignal = init?.signal;
      return new Response(
        new ReadableStream<Uint8Array>({
          start(bodyController) {
            stream = bodyController;
          },
        }),
      );
    });
    const result = request({ signal: controller.signal }).catch(
      (caught: unknown) => caught,
    );
    await vi.advanceTimersByTimeAsync(100);
    controller.abort(new Error("secret-abort-reason"));

    expect(await result).toMatchObject({
      issue: { code: "hub_request_aborted", retryable: false },
    });
    expect(requestSignal?.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
    stream?.close();
  });

  it("cleans up the deadline and the caller's abort listener after success", async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const remove = vi.spyOn(controller.signal, "removeEventListener");
    respond(successEnvelope({ healthy: true }));

    await request({ signal: controller.signal });

    expect(remove).toHaveBeenCalledWith("abort", expect.any(Function));
    expect(vi.getTimerCount()).toBe(0);
  });

  it("does not expose network errors containing URL credentials", async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new Error(
        "failed https://user:secret-password@hub.test?token=secret",
      );
    });
    const error = await request().catch((caught: unknown) => caught);
    expect(error).toMatchObject({
      issue: { code: "hub_unreachable", retryable: true },
    });
    expect(JSON.stringify(normalizedError(error))).not.toContain("secret");
  });
});
