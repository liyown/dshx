import { createFileRoute } from "@tanstack/react-router";

import { buildProtectedResourceMetadata } from "@/lib/auth-discovery";
import {
  resolveDiscoveryOrigin,
  serializeDiscoveryJson,
  serveDiscoveryDocument,
} from "@/lib/discovery-response";

export function serveProtectedResourceMetadata(
  request: Request,
  context: unknown,
  includeBody = true,
): Response {
  const body = serializeDiscoveryJson(
    buildProtectedResourceMetadata(resolveDiscoveryOrigin(request, context)),
  );
  return serveDiscoveryDocument(
    request,
    { body, contentType: "application/json", kind: "oauth-protected-resource" },
    includeBody,
  );
}

export const Route = createFileRoute("/.well-known/oauth-protected-resource")({
  server: {
    handlers: {
      GET: ({ request, context }) => serveProtectedResourceMetadata(request, context),
      HEAD: ({ request, context }) => serveProtectedResourceMetadata(request, context, false),
    },
  },
});
