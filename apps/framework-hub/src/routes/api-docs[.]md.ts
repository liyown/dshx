import { createFileRoute } from "@tanstack/react-router";

import { buildApiDocs, OPENAPI_MEDIA_TYPE } from "@/lib/api-discovery";
import { resolveDiscoveryOrigin, serveDiscoveryDocument } from "@/lib/discovery-response";

export function serveApiDocs(request: Request, context: unknown, includeBody = true): Response {
  const body = buildApiDocs(resolveDiscoveryOrigin(request, context));
  return serveDiscoveryDocument(
    request,
    {
      body,
      contentType: "text/markdown; charset=utf-8",
      kind: "api-docs",
      links: [`</openapi.json>; rel="service-desc"; type="${OPENAPI_MEDIA_TYPE}"`],
    },
    includeBody,
  );
}

export const Route = createFileRoute("/api-docs.md")({
  server: {
    handlers: {
      GET: ({ request, context }) => serveApiDocs(request, context),
      HEAD: ({ request, context }) => serveApiDocs(request, context, false),
    },
  },
});
