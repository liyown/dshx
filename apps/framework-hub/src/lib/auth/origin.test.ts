import { describe, expect, it } from "vitest";

import { requireSameOrigin } from "./auth.server";

const context = { cloudflare: { SITE_URL: "https://dshx.io" } };

describe("same-origin protection", () => {
  it("accepts the configured public origin", () => {
    const request = new Request("http://localhost:8787/api/community/verification", {
      headers: { origin: "https://dshx.io" },
    });
    expect(() => requireSameOrigin(request, context)).not.toThrow();
  });

  it("accepts the actual request origin used by local previews", () => {
    const request = new Request("http://localhost:8787/api/community/verification", {
      headers: { origin: "http://localhost:8787" },
    });
    expect(() => requireSameOrigin(request, context)).not.toThrow();
  });

  it("rejects missing and cross-site origins", () => {
    expect(() =>
      requireSameOrigin(new Request("https://dshx.io/api/community/verification"), context),
    ).toThrowError(expect.objectContaining({ code: "origin_required" }));
    expect(() =>
      requireSameOrigin(
        new Request("https://dshx.io/api/community/verification", {
          headers: { origin: "https://example.com" },
        }),
        context,
      ),
    ).toThrowError(expect.objectContaining({ code: "invalid_origin" }));
  });
});
