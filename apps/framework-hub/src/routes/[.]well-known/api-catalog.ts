import { createFileRoute } from "@tanstack/react-router";

import { API_CATALOG_MEDIA_TYPE, buildApiCatalog } from "@/lib/api-discovery";
import {
  resolveDiscoveryOrigin,
  serializeDiscoveryJson,
  serveDiscoveryDocument,
} from "@/lib/discovery-response";

export function serveApiCatalog(request: Request, context: unknown, includeBody = true): Response {
  const body = serializeDiscoveryJson(buildApiCatalog(resolveDiscoveryOrigin(request, context)));
  return serveDiscoveryDocument(
    request,
    {
      body,
      contentType: API_CATALOG_MEDIA_TYPE,
      kind: "api-catalog",
      links: [`</.well-known/api-catalog>; rel="api-catalog"; type="application/linkset+json"`],
    },
    includeBody,
  );
}

export const Route = createFileRoute("/.well-known/api-catalog")({
  server: {
    handlers: {
      GET: ({ request, context }) => serveApiCatalog(request, context),
      HEAD: ({ request, context }) => serveApiCatalog(request, context, false),
    },
  },
});
