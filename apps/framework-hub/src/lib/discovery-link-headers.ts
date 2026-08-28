export const API_CATALOG_PROFILE = "https://www.rfc-editor.org/info/rfc9727";
export const API_CATALOG_MEDIA_TYPE = `application/linkset+json; profile="${API_CATALOG_PROFILE}"`;
export const OPENAPI_MEDIA_TYPE = "application/vnd.oai.openapi+json;version=3.1";

export const HOMEPAGE_DISCOVERY_LINKS = [
  '</.well-known/api-catalog>; rel="api-catalog"; type="application/linkset+json"',
  `</openapi.json>; rel="service-desc"; type="${OPENAPI_MEDIA_TYPE}"`,
  '</api-docs.md>; rel="service-doc"; type="text/markdown"',
  '</llms.txt>; rel="describedby"; type="text/plain"',
  '</auth.md>; rel="describedby"; type="text/markdown"',
  '</.well-known/mcp/server-card.json>; rel="describedby"; type="application/json"',
] as const;

export function isHomepagePath(pathname: string): boolean {
  return pathname === "/" || /^\/(?:en|zh)\/?$/.test(pathname);
}

export function withHomepageDiscoveryHeaders(response: Response, request: Request): Response {
  if (!isHomepagePath(new URL(request.url).pathname)) return response;

  const headers = new Headers(response.headers);
  const discoveryLinks = HOMEPAGE_DISCOVERY_LINKS.join(", ");
  const existing = headers.get("link");
  headers.set("link", existing ? `${existing}, ${discoveryLinks}` : discoveryLinks);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
