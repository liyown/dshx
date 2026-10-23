import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { operationFailureEnvelopeSchema } from "@becomeopc/dshx-hub-contracts";

import { HttpError } from "@/lib/http";

const mocks = vi.hoisted(() => ({
  requireSession: vi.fn(),
  requireAdminSession: vi.fn(),
  requireSameOrigin: vi.fn(),
  requireApiToken: vi.fn(),
  authenticateApiToken: vi.fn(),
  requireCommunityWrite: vi.fn(),
  requireDatabase: vi.fn(() => ({ database: true })),
}));

vi.mock("@/lib/auth/auth.server", () => ({
  requireSession: mocks.requireSession,
  requireAdminSession: mocks.requireAdminSession,
  requireSameOrigin: mocks.requireSameOrigin,
}));
vi.mock("@/lib/auth/tokens.server", () => ({
  requireApiToken: mocks.requireApiToken,
  authenticateApiToken: mocks.authenticateApiToken,
}));
vi.mock("@/lib/community/guard.server", () => ({
  requireCommunityWrite: mocks.requireCommunityWrite,
}));
vi.mock("@/lib/db/client", () => ({ requireDatabase: mocks.requireDatabase }));

const { adminRoute, publicRoute, sessionRoute, tokenRoute, withMeta } = await import("./route");

const context = { cloudflare: {} };
const body = z.object({ turnstileToken: z.string(), name: z.string().min(1) });

function call(handler: (args: never) => Promise<Response>, request: Request): Promise<Response> {
  return handler({ request, context, params: {} } as never);
}

function json(value: unknown, method = "POST"): Request {
  return new Request("https://dshx.io/api/test", {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(value),
  });
}

const actor = {
  session: { user: { id: "user-1" } },
  profile: { role: "member" },
  db: { database: "session" },
};

describe("sessionRoute", () => {
  it("parses the body, charges the community guard, and renders the declared status", async () => {
    mocks.requireSession.mockResolvedValue(actor);
    mocks.requireCommunityWrite.mockResolvedValue(undefined);
    const run = vi.fn(() => ({ id: "review-1" }));

    const response = await call(
      sessionRoute({ body, community: "review", status: 201 }, run),
      json({ turnstileToken: "turnstile", name: "title" }),
    );

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({ id: "review-1" });
    expect(mocks.requireCommunityWrite).toHaveBeenCalledWith(
      expect.any(Request),
      context,
      actor.db,
      "user-1",
      "review",
      "turnstile",
    );
    expect(run).toHaveBeenCalledWith(
      expect.objectContaining({
        input: { turnstileToken: "turnstile", name: "title" },
        db: actor.db,
      }),
    );
  });

  it("never reaches the guard when the body does not satisfy the contract", async () => {
    mocks.requireSession.mockResolvedValue(actor);
    mocks.requireCommunityWrite.mockClear();
    const run = vi.fn();

    const response = await call(
      sessionRoute({ body, community: "review" }, run),
      json({ name: "" }),
    );

    expect(response.status).toBe(422);
    expect(mocks.requireCommunityWrite).not.toHaveBeenCalled();
    expect(run).not.toHaveBeenCalled();
  });

  it("checks the origin of a write before the session or the body", async () => {
    mocks.requireSameOrigin.mockReset();
    mocks.requireSameOrigin.mockImplementationOnce(() => {
      throw new HttpError(403, "Cross-origin writes are forbidden", "invalid_origin");
    });
    mocks.requireSession.mockClear();
    mocks.requireCommunityWrite.mockClear();
    const run = vi.fn();

    const response = await call(
      sessionRoute({ body, community: "review" }, run),
      json({ turnstileToken: "turnstile", name: "title" }),
    );

    expect(response.status).toBe(403);
    expect(mocks.requireSameOrigin).toHaveBeenCalledTimes(1);
    expect(mocks.requireSession).not.toHaveBeenCalled();
    expect(run).not.toHaveBeenCalled();
    mocks.requireSameOrigin.mockReset();
  });

  it("reads need no origin header", async () => {
    mocks.requireSession.mockResolvedValue(actor);
    mocks.requireSameOrigin.mockClear();
    const run = vi.fn(() => ({ id: "user-1" }));

    const response = await call(
      sessionRoute({}, run),
      new Request("https://dshx.io/api/test", { method: "GET" }),
    );

    expect(response.status).toBe(200);
    expect(mocks.requireSameOrigin).not.toHaveBeenCalled();
  });

  it("renders the session failure in the api envelope", async () => {
    mocks.requireSession.mockRejectedValue(
      new HttpError(401, "Sign in with GitHub first", "unauthorized"),
    );

    const response = await call(
      sessionRoute({ body }, () => ({})),
      json({ turnstileToken: "", name: "x" }),
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: { code: "unauthorized", message: "Sign in with GitHub first" },
    });
  });
});

describe("adminRoute", () => {
  it("rejects a cross-origin write before it authenticates", async () => {
    mocks.requireSameOrigin.mockImplementation(() => {
      throw new HttpError(403, "Cross-origin administration is forbidden", "invalid_origin");
    });
    mocks.requireAdminSession.mockClear();

    const response = await call(
      adminRoute({}, () => ({})),
      json({}, "POST"),
    );

    expect(response.status).toBe(403);
    expect(mocks.requireAdminSession).not.toHaveBeenCalled();
  });

  it("lets an admin read through without an Origin header", async () => {
    mocks.requireSameOrigin.mockClear();
    mocks.requireAdminSession.mockResolvedValue(actor);

    const response = await call(
      adminRoute({}, () => ({ ok: true })),
      new Request("https://dshx.io/api/admin/x"),
    );

    expect(response.status).toBe(200);
    expect(mocks.requireSameOrigin).not.toHaveBeenCalled();
  });
});

describe("tokenRoute", () => {
  it("enforces the declared role on top of the scope", async () => {
    mocks.requireApiToken.mockResolvedValue({ token: { id: "t1" }, profile: { role: "member" } });
    const run = vi.fn();

    const response = await call(
      tokenRoute({ role: "admin" }, run),
      new Request("https://dshx.io/api/ops/x", { method: "GET" }),
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "admin_required" } });
    expect(mocks.requireApiToken).toHaveBeenCalledWith(
      { database: true },
      expect.any(Request),
      "catalog:write",
    );
    expect(run).not.toHaveBeenCalled();
  });

  it("speaks the operation envelope when the endpoint declares it", async () => {
    mocks.requireApiToken.mockResolvedValue({ token: { id: "t1" }, profile: { role: "admin" } });

    const response = await call(
      tokenRoute({ envelope: "operation" }, () => ({ plugins: [] })),
      new Request("https://dshx.io/api/ops/v1/plugins", { method: "GET" }),
    );

    expect(response.headers.get("x-request-id")).toBeTruthy();
    await expect(response.json()).resolves.toEqual({
      ok: true,
      data: { plugins: [] },
      warnings: [],
      meta: { requestId: expect.any(String) },
    });
  });

  it("reports a handler failure in the operation envelope", async () => {
    mocks.requireApiToken.mockResolvedValue({ token: { id: "t1" }, profile: { role: "admin" } });

    const response = await call(
      tokenRoute({ envelope: "operation" }, () => {
        throw new HttpError(409, "Revision conflict", "revision_conflict");
      }),
      new Request("https://dshx.io/api/ops/v1/plugins", { method: "GET" }),
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error: { code: "revision_conflict" },
    });
  });

  it("answers failures in the envelope the CLI reads", async () => {
    mocks.requireApiToken.mockRejectedValue(
      new HttpError(401, "Token is invalid or expired", "invalid_token"),
    );

    const response = await call(
      tokenRoute({ envelope: "operation" }, () => ({})),
      new Request("https://dshx.io/api/ops/v1/agent-bundle", { method: "GET" }),
    );

    const parsed = operationFailureEnvelopeSchema.safeParse(await response.json());
    expect(parsed.success).toBe(true);
    expect(parsed.data).toMatchObject({
      ok: false,
      error: { code: "invalid_token", retryable: false },
    });
  });

  it("accepts any token when the endpoint declares no scope", async () => {
    mocks.requireApiToken.mockClear();
    mocks.authenticateApiToken.mockResolvedValue({
      token: { id: "t1" },
      profile: { role: "admin" },
    });

    const response = await call(
      tokenRoute({ scope: null, role: "admin" }, () => ({ bundled: true })),
      new Request("https://dshx.io/api/ops/v1/agent-bundle", { method: "GET" }),
    );

    expect(response.status).toBe(200);
    expect(mocks.requireApiToken).not.toHaveBeenCalled();
    expect(mocks.authenticateApiToken).toHaveBeenCalledWith(
      { database: true },
      expect.any(Request),
    );
  });
});

describe("endpoint response metadata", () => {
  it("lets the handler choose the success status and warnings", async () => {
    mocks.requireApiToken.mockResolvedValue({ token: { id: "t1" }, profile: { role: "admin" } });

    const response = await call(
      tokenRoute({ envelope: "operation" }, () =>
        withMeta(
          { id: "report-1" },
          { status: 201, warnings: [{ code: "stale_token", message: "stale token" }] },
        ),
      ),
      new Request("https://dshx.io/api/ops/v1/reports", { method: "POST" }),
    );

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      data: { id: "report-1" },
      warnings: [{ code: "stale_token", message: "stale token" }],
    });
  });

  it("carries the endpoint's headers on both success and failure", async () => {
    mocks.requireApiToken.mockRejectedValue(
      new HttpError(401, "Token is invalid or expired", "invalid_token"),
    );
    const headers = { "cache-control": "no-store", "x-robots-tag": "noindex" };

    const failure = await call(
      tokenRoute({ envelope: "operation", headers }, () => ({})),
      new Request("https://dshx.io/api/ops/v1/agent-bundle", { method: "GET" }),
    );
    expect(failure.status).toBe(401);
    expect(failure.headers.get("x-robots-tag")).toBe("noindex");

    mocks.requireApiToken.mockResolvedValue({ token: { id: "t1" }, profile: { role: "admin" } });
    const success = await call(
      tokenRoute({ envelope: "operation", headers }, () => ({ ok: true })),
      new Request("https://dshx.io/api/ops/v1/agent-bundle", { method: "GET" }),
    );
    expect(success.headers.get("cache-control")).toBe("no-store");
  });
});

describe("publicRoute", () => {
  const query = z.object({
    limit: z.coerce.number().int().finite().default(20),
  });

  it("validates the query instead of passing NaN to the handler", async () => {
    const run = vi.fn(({ query: value }: { query: { limit: number } }) => value.limit);
    const handler = publicRoute({ querySchema: query }, run);

    const invalid = await call(handler, new Request("https://dshx.io/api/test?limit=nope"));
    expect(invalid.status).toBe(422);
    await expect(invalid.json()).resolves.toMatchObject({ error: { code: "invalid_query" } });

    const valid = await call(handler, new Request("https://dshx.io/api/test?limit=7"));
    await expect(valid.json()).resolves.toBe(7);
  });

  it("accepts a shaped query without a schema", async () => {
    const handler = publicRoute(
      { query: (params: URLSearchParams) => ({ locale: params.get("locale") ?? "en" }) },
      ({ query }) => query,
    );

    const response = await call(handler, new Request("https://dshx.io/api/test?locale=zh"));

    await expect(response.json()).resolves.toEqual({ locale: "zh" });
  });

  it("refuses a cross-origin write before the body is read", async () => {
    mocks.requireSameOrigin.mockImplementationOnce(() => {
      throw new HttpError(403, "Cross-origin writes are forbidden", "invalid_origin");
    });
    const run = vi.fn();

    const response = await call(
      publicRoute({ body }, run),
      json({ turnstileToken: "t", name: "x" }),
    );

    expect(response.status).toBe(403);
    expect(run).not.toHaveBeenCalled();
    mocks.requireSameOrigin.mockReset();
  });

  it("passes a Response through untouched", async () => {
    const response = await call(
      publicRoute({}, () => new Response(null, { status: 204 })),
      new Request("https://dshx.io/api/test"),
    );

    expect(response.status).toBe(204);
  });
});
