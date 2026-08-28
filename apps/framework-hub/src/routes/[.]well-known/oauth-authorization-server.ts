import { createFileRoute } from "@tanstack/react-router";

import { buildAuthorizationServerMetadata } from "@/lib/auth-discovery";
import {
  resolveDiscoveryOrigin,
  serializeDiscoveryJson,
  serveDiscoveryDocument,
} from "@/lib/discovery-response";

export function serveAuthorizationServerMetadata(
  request: Request,
  context: unknown,
  includeBody = true,
): Response {
  const body = serializeDiscoveryJson(
    buildAuthorizationServerMetadata(resolveDiscoveryOrigin(request, context)),
  );
  return serveDiscoveryDocument(
    request,
    { body, contentType: "application/json", kind: "oauth-authorization-server" },
    includeBody,
  );
}

export const Route = createFileRoute("/.well-known/oauth-authorization-server")({
  server: {
    handlers: {
      GET: ({ request, context }) => serveAuthorizationServerMetadata(request, context),
      HEAD: ({ request, context }) => serveAuthorizationServerMetadata(request, context, false),
    },
  },
});
