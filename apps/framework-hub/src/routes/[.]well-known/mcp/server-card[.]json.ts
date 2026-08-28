import { createFileRoute } from "@tanstack/react-router";

import {
  resolveDiscoveryOrigin,
  serializeDiscoveryJson,
  serveDiscoveryDocument,
} from "@/lib/discovery-response";
import { buildMcpServerCard } from "@/lib/mcp-card";

export function serveMcpServerCard(
  request: Request,
  context: unknown,
  includeBody = true,
): Response {
  const body = serializeDiscoveryJson(buildMcpServerCard(resolveDiscoveryOrigin(request, context)));
  return serveDiscoveryDocument(
    request,
    {
      body,
      contentType: "application/json; charset=utf-8",
      kind: "mcp-server-card",
      cacheControl: "public, max-age=300, s-maxage=21600, stale-while-revalidate=86400",
      headers: { "access-control-allow-origin": "*" },
      links: [],
    },
    includeBody,
  );
}

export const Route = createFileRoute("/.well-known/mcp/server-card.json")({
  server: {
    handlers: {
      GET: ({ request, context }) => serveMcpServerCard(request, context),
      HEAD: ({ request, context }) => serveMcpServerCard(request, context, false),
    },
  },
});
