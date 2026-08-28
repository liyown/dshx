import { createFileRoute } from "@tanstack/react-router";

import { buildAuthMarkdown } from "@/lib/auth-discovery";
import { resolveDiscoveryOrigin, serveDiscoveryDocument } from "@/lib/discovery-response";

export function serveAuthMarkdown(
  request: Request,
  context: unknown,
  includeBody = true,
): Response {
  const body = buildAuthMarkdown(resolveDiscoveryOrigin(request, context));
  return serveDiscoveryDocument(
    request,
    { body, contentType: "text/markdown; charset=utf-8", kind: "auth-markdown" },
    includeBody,
  );
}

export const Route = createFileRoute("/auth.md")({
  server: {
    handlers: {
      GET: ({ request, context }) => serveAuthMarkdown(request, context),
      HEAD: ({ request, context }) => serveAuthMarkdown(request, context, false),
    },
  },
});
