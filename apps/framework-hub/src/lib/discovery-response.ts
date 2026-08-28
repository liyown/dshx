import { requireBindings } from "./db/context";

const DEFAULT_CACHE_CONTROL = "public, max-age=300, s-maxage=21600, stale-while-revalidate=86400";

export type DiscoveryDocument = {
  readonly body: string;
  readonly contentType: string;
  readonly kind: string;
  readonly links?: readonly string[];
  readonly cacheControl?: string;
  readonly headers?: Readonly<Record<string, string>>;
};

function normalizeOrigin(value: string): string {
  return new URL(value).origin;
}

export function resolveDiscoveryOrigin(request: Request, context: unknown): string {
  const configured = requireBindings(context).SITE_URL;
  return normalizeOrigin(configured ?? request.url);
}

export function serializeDiscoveryJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function hashDocument(value: string): string {
  // FNV-1a is used only as a deterministic HTTP validator, not for security.
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function serveDiscoveryDocument(
  request: Request,
  document: DiscoveryDocument,
  includeBody = true,
): Response {
  const contentLength = new TextEncoder().encode(document.body).byteLength;
  const etag = `W/"dshx-${document.kind}-${contentLength}-${hashDocument(document.body)}"`;
  const headers = new Headers({
    "cache-control": document.cacheControl ?? DEFAULT_CACHE_CONTROL,
    "content-length": String(contentLength),
    "content-type": document.contentType,
    etag,
    ...document.headers,
  });
  for (const link of document.links ?? []) headers.append("link", link);

  if (request.headers.get("if-none-match") === etag) {
    headers.delete("content-length");
    return new Response(null, { status: 304, headers });
  }

  return new Response(includeBody ? document.body : null, { status: 200, headers });
}
