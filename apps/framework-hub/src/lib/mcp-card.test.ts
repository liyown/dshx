import { describe, expect, it } from "vitest";

import { buildMcpServerCard } from "./mcp-card";
import { serveMcpServerCard } from "@/routes/[.]well-known/mcp/server-card[.]json";

const context = { cloudflare: { SITE_URL: "https://dshx.io/" } };

describe("MCP Server Card", () => {
  it("publishes the scanner contract with a real absolute endpoint", () => {
    expect(buildMcpServerCard("https://dshx.io/some/path")).toEqual({
      protocolVersion: "2025-06-18",
      serverInfo: { name: "dshx-hub", version: "1.0.0" },
      description:
        "Read-only discovery for installable DSH plugins and verified DSHX framework documentation.",
      transport: {
        type: "streamable-http",
        endpoint: "https://dshx.io/mcp",
      },
      capabilities: {
        tools: true,
        resources: true,
        prompts: false,
      },
      authentication: { required: false },
    });
  });

  it("serves GET, HEAD, CORS, and conditional requests", async () => {
    const request = new Request("https://preview.invalid/.well-known/mcp/server-card.json");
    const response = serveMcpServerCard(request, context);
    const head = serveMcpServerCard(request, context, false);
    const etag = response.headers.get("etag");
    const conditional = serveMcpServerCard(
      new Request(request, { headers: { "if-none-match": etag ?? "" } }),
      context,
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/json; charset=utf-8");
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
    await expect(response.json()).resolves.toMatchObject({
      serverInfo: { name: "dshx-hub", version: "1.0.0" },
      transport: { endpoint: "https://dshx.io/mcp" },
    });
    expect(head.status).toBe(200);
    expect(await head.text()).toBe("");
    expect(conditional.status).toBe(304);
  });
});
