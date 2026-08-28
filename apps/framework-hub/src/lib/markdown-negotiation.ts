const MARKDOWN_MEDIA_TYPE = "text/markdown";
const PAGE_PATH =
  /^\/(?:en|zh)(?:\/(?:about|categories\/[^/]+|docs(?:\/[^/]+)?|examples|legal\/[^/]+|operations|plugins(?:\/[^/]+)?|publishers\/[^/]+))?\/?$/;

function mediaRangeQuality(range: string): number {
  const segments = range.split(";").map((segment) => segment.trim());
  if (segments[0]?.toLowerCase() !== MARKDOWN_MEDIA_TYPE) return 0;
  const quality = segments
    .slice(1)
    .find((segment) => segment.toLowerCase().startsWith("q="))
    ?.slice(2);
  if (quality === undefined) return 1;
  const parsed = Number(quality);
  return Number.isFinite(parsed) ? Math.min(1, Math.max(0, parsed)) : 0;
}

export function acceptsMarkdown(request: Request): boolean {
  const accept = request.headers.get("accept");
  return accept?.split(",").some((range) => mediaRangeQuality(range) > 0) ?? false;
}

export function isMarkdownNegotiablePage(request: Request): boolean {
  return (
    (request.method === "GET" || request.method === "HEAD") &&
    PAGE_PATH.test(new URL(request.url).pathname)
  );
}

function appendVary(headers: Headers, field: string) {
  const fields = (headers.get("vary") ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  if (!fields.some((value) => value.toLowerCase() === field.toLowerCase())) fields.push(field);
  headers.set("vary", fields.join(", "));
}

function copyResponse(response: Response, headers: Headers): Response {
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export function withMarkdownVary(response: Response): Response {
  const headers = new Headers(response.headers);
  appendVary(headers, "Accept");
  return copyResponse(response, headers);
}
