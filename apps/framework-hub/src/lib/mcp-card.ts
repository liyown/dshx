export const MCP_PROTOCOL_VERSION = "2025-06-18";

export const MCP_SERVER_INFO = {
  name: "dshx-hub",
  version: "1.0.0",
} as const;

function normalizeOrigin(origin: string): string {
  return new URL(origin).origin;
}

function bodyFingerprint(body: string): string {
  let hash = 0x811c9dc5;
  for (const byte of new TextEncoder().encode(body)) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function buildMcpServerCard(origin: string) {
  const site = normalizeOrigin(origin);
  return {
    protocolVersion: MCP_PROTOCOL_VERSION,
    serverInfo: MCP_SERVER_INFO,
    description:
      "Read-only discovery for installable DSH plugins and verified DSHX framework documentation.",
    transport: {
      type: "streamable-http",
      endpoint: `${site}/mcp`,
    },
    capabilities: {
      tools: true,
      resources: true,
      prompts: false,
    },
    authentication: {
      required: false,
    },
  } as const;
}

export function mcpCardHeaders(body: string): Headers {
  return new Headers({
    "access-control-allow-origin": "*",
    "cache-control": "public, max-age=300, s-maxage=21600, stale-while-revalidate=86400",
    "content-length": String(new TextEncoder().encode(body).byteLength),
    "content-type": "application/json; charset=utf-8",
    etag: `"dshx-mcp-card-${bodyFingerprint(body)}"`,
  });
}
