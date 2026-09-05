import { env } from "cloudflare:workers";
import handler, { createServerEntry } from "@tanstack/react-start/server-entry";

import { withHomepageDiscoveryHeaders } from "./lib/discovery-link-headers";
import { renderErrorPage } from "./lib/error-page";
import { describeError } from "./lib/error-logging";
import { isLocale, localeFromAcceptLanguage, localeFromPathname } from "./lib/i18n";
import {
  acceptsMarkdown,
  isMarkdownNegotiablePage,
  withMarkdownVary,
} from "./lib/markdown-negotiation";
import type { AppBindings, AppRequestContext } from "./lib/db/context";

function withSecurityHeaders(response: Response, request: Request): Response {
  const headers = new Headers(response.headers);
  headers.set("x-content-type-options", "nosniff");
  headers.set("referrer-policy", "strict-origin-when-cross-origin");
  headers.set("permissions-policy", "camera=(), microphone=(), geolocation=()");
  headers.set("x-frame-options", "SAMEORIGIN");
  headers.set(
    "content-security-policy",
    "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'self'; script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com https://static.cloudflareinsights.com; style-src 'self' 'unsafe-inline'; font-src 'self' data:; img-src 'self' data: https:; connect-src 'self' https://registry.npmjs.org https://api.npmjs.org https://challenges.cloudflare.com; frame-src https://challenges.cloudflare.com",
  );
  const pathname = new URL(request.url).pathname;
  if (response.status === 401 && pathname.startsWith("/api/") && !headers.has("www-authenticate")) {
    headers.set(
      "www-authenticate",
      `Bearer resource_metadata="${new URL("/.well-known/oauth-protected-resource", request.url)}"`,
    );
  }
  if (pathname.startsWith("/assets/") || pathname.startsWith("/fonts/")) {
    headers.set("cache-control", "public, max-age=31536000, immutable");
  }
  const cacheablePublicPage =
    request.method === "GET" &&
    response.status === 200 &&
    !request.headers.has("authorization") &&
    !request.headers.has("cookie") &&
    !headers.has("set-cookie") &&
    (/^\/(?:en|zh)\/changelog(?:\/[^/]+)?$/.test(pathname) ||
      /^\/(?:en|zh)(?:\/(?:about|categories|docs|examples|legal|operations|plugins|publishers)(?:\/|$))?$/.test(
        pathname,
      ));
  if (cacheablePublicPage) {
    headers.set("cache-control", "public, max-age=60, s-maxage=300, stale-while-revalidate=86400");
  }
  // Changelog publication and withdrawal take effect directly from D1, without
  // serving a previously published article from a browser or edge page cache.
  if (/^\/(?:en|zh)\/changelog(?:\/|$)/.test(pathname)) {
    headers.set("cache-control", "no-store");
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export function redirectToLocale(request: Request): Response | undefined {
  const url = new URL(request.url);
  const firstSegment = url.pathname.split("/")[1];
  if (isLocale(firstSegment)) {
    let changed = false;
    if (url.pathname.length > `/${firstSegment}`.length && url.pathname.endsWith("/")) {
      url.pathname = url.pathname.replace(/\/+$/, "");
      changed = true;
    }
    if (url.pathname === `/${firstSegment}/plugins`) {
      for (const name of ["q", "category", "cursor"] as const) {
        if (url.searchParams.get(name) === "") {
          url.searchParams.delete(name);
          changed = true;
        }
      }
      if (url.searchParams.get("sort") === "featured" || url.searchParams.get("sort") === "") {
        url.searchParams.delete("sort");
        changed = true;
      }
    }
    if (url.pathname === `/${firstSegment}/operations` && url.searchParams.get("cursor") === "") {
      url.searchParams.delete("cursor");
      changed = true;
    }
    return changed ? Response.redirect(url, 308) : undefined;
  }

  const isRoot = url.pathname === "/";
  const isLegacyPage =
    /^\/changelog(?:\/[^/]+)?(?:\/)?$/.test(url.pathname) ||
    /^\/docs(?:\/[^/]+)*(?:\/)?$/.test(url.pathname) ||
    /^\/examples(?:\/)?$/.test(url.pathname) ||
    /^\/plugins(?:\/[^/]+)?(?:\/)?$/.test(url.pathname);
  if (!isRoot && !isLegacyPage) return undefined;
  if (isRoot) {
    url.pathname = "/en";
    return Response.redirect(url, 308);
  }
  const locale = localeFromAcceptLanguage(request.headers.get("accept-language"));
  url.pathname = `/${locale}${url.pathname}`;
  return Response.redirect(url, 302);
}

function requestId(request: Request): string {
  return (
    request.headers.get("cf-ray") ?? request.headers.get("x-request-id") ?? crypto.randomUUID()
  );
}

function logRequestError(request: Request, id: string, error: unknown): void {
  console.error(
    JSON.stringify({
      level: "error",
      requestId: id,
      method: request.method,
      pathname: new URL(request.url).pathname,
      error: describeError(error),
    }),
  );
}

export default createServerEntry({
  async fetch(request) {
    const id = requestId(request);
    try {
      const redirect = redirectToLocale(request);
      if (redirect)
        return withHomepageDiscoveryHeaders(withSecurityHeaders(redirect, request), request);

      const context: AppRequestContext = { cloudflare: env as AppBindings };
      if (isMarkdownNegotiablePage(request) && acceptsMarkdown(request)) {
        const { renderAgentMarkdownResponse } = await import("./lib/agent-document.server");
        const markdown = await renderAgentMarkdownResponse(request, context);
        if (markdown) {
          return withHomepageDiscoveryHeaders(withSecurityHeaders(markdown, request), request);
        }
      }

      const response = await handler.fetch(request, { context });
      const negotiated = isMarkdownNegotiablePage(request) ? withMarkdownVary(response) : response;
      return withHomepageDiscoveryHeaders(withSecurityHeaders(negotiated, request), request);
    } catch (error) {
      logRequestError(request, id, error);
      const response = new Response(
        renderErrorPage(localeFromPathname(new URL(request.url).pathname)),
        {
          status: 500,
          headers: {
            "content-type": "text/html; charset=utf-8",
            "x-request-id": id,
            "cache-control": "no-store",
          },
        },
      );
      return withHomepageDiscoveryHeaders(withSecurityHeaders(response, request), request);
    }
  },
});
