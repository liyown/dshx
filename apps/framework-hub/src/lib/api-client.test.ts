import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { ApiError, apiRequest } from "./api-client";

function respond(body: unknown, status = 200): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify(body), { status })),
  );
}

describe("apiRequest", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("parses the body with the endpoint's declared contract", async () => {
    respond({ items: [{ id: "a" }], extra: "stripped" });
    const schema = z.object({ items: z.array(z.object({ id: z.string() })) });

    await expect(apiRequest("/api/thing", schema)).resolves.toEqual({ items: [{ id: "a" }] });
  });

  it("reports a body that does not match its contract as a server fault", async () => {
    respond({ items: "not an array" });
    const schema = z.object({ items: z.array(z.object({ id: z.string() })) });

    const failure = await apiRequest("/api/thing", schema).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(ApiError);
    expect(failure).toMatchObject({ status: 200, code: "invalid_response" });
  });

  it("raises the endpoint's own error for a failed request", async () => {
    respond({ error: { code: "not_found", message: "Plugin not found" } }, 404);

    await expect(apiRequest("/api/thing", z.object({}))).rejects.toMatchObject({
      status: 404,
      code: "not_found",
      message: "Plugin not found",
    });
  });
});
