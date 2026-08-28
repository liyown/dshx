import { describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-start/server-entry", () => ({
  createServerEntry: <T>(entry: T) => entry,
  default: {
    fetch: vi.fn(async (request: Request) => {
      if (new URL(request.url).pathname === "/api/protected") {
        return Response.json({ error: "Bearer token required" }, { status: 401 });
      }
      if (!request.headers.get("accept")?.includes("text/html")) {
        return Response.json({ error: "Only HTML requests are supported here" }, { status: 500 });
      }
      return new Response(
        '<html><head><meta property="og:title" content="DSHX"></head><body><main><h1>Agent-ready DSHX</h1></main></body></html>',
        { headers: { "content-type": "text/html; charset=utf-8" } },
      );
    }),
  },
}));

import server from "./server";

const worker = server as {
  fetch(request: Request, env: unknown, context: unknown): Promise<Response>;
};

describe("server Markdown negotiation", () => {
  it("returns structured Markdown without rendering or scraping HTML", async () => {
    const response = await worker.fetch(
      new Request("https://dshx.io/en", { headers: { accept: "text/markdown" } }),
      { DB: {} },
      {},
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/markdown; charset=utf-8");
    expect(response.headers.get("vary")).toContain("Accept");
    expect(response.headers.get("x-markdown-tokens")).toMatch(/^\d+$/);
    expect(response.headers.get("link")).toContain('rel="api-catalog"');
    expect(response.headers.get("link")).toContain('rel="service-desc"');
    expect(response.headers.get("link")).toContain('rel="service-doc"');
    expect(response.headers.get("link")).toContain('rel="describedby"');
    expect(await response.text()).toContain(
      "# DSHX: Build DeepSeek Harness Plugins with TypeScript & React",
    );
  });

  it("keeps HTML as the default browser representation", async () => {
    const response = await worker.fetch(
      new Request("https://dshx.io/en", { headers: { accept: "text/html" } }),
      { DB: {} },
      {},
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/html; charset=utf-8");
    expect(response.headers.get("vary")).toContain("Accept");
    expect(response.headers.get("link")).toContain('rel="api-catalog"');
    expect(await response.text()).toContain("<h1>Agent-ready DSHX</h1>");
  });

  it("returns Markdown representation headers without a body for HEAD", async () => {
    const response = await worker.fetch(
      new Request("https://dshx.io/en", {
        method: "HEAD",
        headers: { accept: "text/markdown" },
      }),
      { DB: {} },
      {},
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/markdown; charset=utf-8");
    expect(response.headers.get("content-length")).toMatch(/^\d+$/);
    expect(response.headers.get("x-markdown-tokens")).toMatch(/^\d+$/);
    expect(await response.text()).toBe("");
  });

  it("adds discovery links to the root redirect returned by the Worker", async () => {
    const response = await worker.fetch(new Request("https://dshx.io/"), { DB: {} }, {});

    expect(response.status).toBe(308);
    expect(response.headers.get("location")).toBe("https://dshx.io/en");
    expect(response.headers.get("link")).toContain('rel="api-catalog"');
    expect(response.headers.get("link")).toContain('rel="service-desc"');
    expect(response.headers.get("link")).toContain('rel="service-doc"');
    expect(response.headers.get("link")).toContain('rel="describedby"');
  });

  it("points API 401 responses to protected-resource metadata", async () => {
    const response = await worker.fetch(
      new Request("https://dshx.io/api/protected"),
      { DB: {} },
      {},
    );

    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toBe(
      'Bearer resource_metadata="https://dshx.io/.well-known/oauth-protected-resource"',
    );
  });
});
