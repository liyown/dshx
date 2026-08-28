import { createFileRoute } from "@tanstack/react-router";

import { buildOpenApiDocument, OPENAPI_MEDIA_TYPE } from "@/lib/api-discovery";
import {
  resolveDiscoveryOrigin,
  serializeDiscoveryJson,
  serveDiscoveryDocument,
} from "@/lib/discovery-response";

export function serveOpenApi(request: Request, context: unknown, includeBody = true): Response {
  const body = serializeDiscoveryJson(
    buildOpenApiDocument(resolveDiscoveryOrigin(request, context)),
  );
  return serveDiscoveryDocument(
    request,
    { body, contentType: OPENAPI_MEDIA_TYPE, kind: "openapi" },
    includeBody,
  );
}

export const Route = createFileRoute("/openapi.json")({
  server: {
    handlers: {
      GET: ({ request, context }) => serveOpenApi(request, context),
      HEAD: ({ request, context }) => serveOpenApi(request, context, false),
    },
  },
});
