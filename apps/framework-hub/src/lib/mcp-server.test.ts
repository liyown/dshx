import { describe, expect, it, vi } from "vitest";

import { serveMcp, type McpCatalogGateway } from "./mcp-server";

function rpc(method: string, params?: unknown, id: number | string = 1): Request {
  return new Request("https://dshx.io/mcp", {
    method: "POST",
    headers: {
      accept: "application/json, text/event-stream",
      "content-type": "application/json",
      host: "dshx.io",
      "mcp-protocol-version": "2025-06-18",
    },
    body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
  });
}

const unusedGateway: McpCatalogGateway = {
  search: vi.fn(),
  get: vi.fn(),
};

async function rpcBody<T>(response: Response): Promise<T> {
  const text = await response.text();
  if ((response.headers.get("content-type") ?? "").includes("text/event-stream")) {
    const data = text
      .split("\n")
      .find((line) => line.startsWith("data: "))
      ?.slice(6);
    if (!data) throw new Error("MCP SSE response did not contain a data frame");
    return JSON.parse(data) as T;
  }
  return JSON.parse(text) as T;
}

describe("DSHX Hub MCP server", () => {
  it("negotiates a truthful read-only runtime surface", async () => {
    const response = await serveMcp(
      rpc("initialize", {
        protocolVersion: "2025-06-18",
        capabilities: {},
        clientInfo: { name: "dshx-test", version: "1.0.0" },
      }),
      {},
    );

    expect(response.status, await response.clone().text()).toBe(200);
    await expect(rpcBody(response)).resolves.toMatchObject({
      jsonrpc: "2.0",
      id: 1,
      result: {
        protocolVersion: "2025-06-18",
        serverInfo: { name: "dshx-hub", version: "1.0.0" },
        capabilities: { tools: {}, resources: {} },
      },
    });
  });

  it("lists only the implemented tools and documentation resources", async () => {
    const toolsResponse = await serveMcp(rpc("tools/list"), {}, unusedGateway);
    const resourcesResponse = await serveMcp(rpc("resources/list"), {}, unusedGateway);
    const toolsBody = await rpcBody<{
      result: { tools: { name: string }[] };
    }>(toolsResponse);
    const resourcesBody = await rpcBody<{
      result: { resources: { uri: string }[] };
    }>(resourcesResponse);

    expect(toolsBody.result.tools.map((tool) => tool.name)).toEqual([
      "search_plugins",
      "get_plugin",
    ]);
    expect(resourcesBody.result.resources).toHaveLength(8);
    expect(resourcesBody.result.resources[0]?.uri).toBe("dshx://docs/getting-started?locale=en");
  });

  it("reads a clean Markdown documentation resource", async () => {
    const response = await serveMcp(
      rpc("resources/read", { uri: "dshx://docs/architecture?locale=zh" }),
      {},
      unusedGateway,
    );
    const body = await rpcBody<{
      result: { contents: { text: string; mimeType: string }[] };
    }>(response);

    expect(body.result.contents[0]?.mimeType).toBe("text/markdown");
    expect(body.result.contents[0]?.text).toContain("# DSHX 架构");
    expect(body.result.contents[0]?.text).toContain("Verified: 2026-08-28");
  });

  it("calls the bounded public plugin search gateway", async () => {
    const search = vi.fn().mockResolvedValue({
      items: [
        {
          slug: "demo",
          name: "Demo",
          scope: "@example/demo",
          description: "Demo plugin",
          author: "example",
          version: "1.0.0",
          compat: ">=0.1.0",
          publishedAt: null,
          updated: "2026-08-28",
          category: "tooling",
          stars: 1,
          downloads: "1",
          badge: "community",
          glyph: "D",
          iconUrl: null,
          publisher: { login: "example", avatarUrl: null },
          featured: false,
          trending: false,
          isNew: true,
        },
      ],
      nextCursor: null,
      page: 1,
      pageSize: 10,
      total: 1,
      totalPages: 1,
      categories: [],
    });
    const gateway = { search, get: vi.fn() } as unknown as McpCatalogGateway;
    const response = await serveMcp(
      rpc("tools/call", {
        name: "search_plugins",
        arguments: { query: "demo", locale: "en", limit: 10 },
      }),
      { cloudflare: { SITE_URL: "https://canonical.example/" } },
      gateway,
    );
    const body = await rpcBody<{
      result: { structuredContent: { items: { url: string }[] } };
    }>(response);

    expect(search).toHaveBeenCalledWith({
      query: "demo",
      locale: "en",
      sort: "latest",
      limit: 10,
    });
    expect(body.result.structuredContent.items[0]?.url).toBe(
      "https://canonical.example/en/plugins/demo",
    );
  });

  it("rejects non-POST transport requests and acknowledges notifications", async () => {
    const getResponse = await serveMcp(
      new Request("https://dshx.io/mcp", { headers: { host: "dshx.io" } }),
      {},
    );
    const notification = await serveMcp(
      new Request("https://dshx.io/mcp", {
        method: "POST",
        headers: {
          accept: "application/json, text/event-stream",
          "content-type": "application/json",
          host: "dshx.io",
          "mcp-protocol-version": "2025-06-18",
        },
        body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }),
      }),
      {},
    );

    expect(getResponse.status).toBe(405);
    expect(notification.status).toBe(202);
  });
});
