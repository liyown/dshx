import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";
import { isLocale, localeFromAcceptLanguage, localeFromPathname } from "./lib/i18n";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m.default ?? m) as ServerEntry,
    );
  }
  return serverEntryPromise;
}

function redirectToLocale(request: Request): Response | undefined {
  const url = new URL(request.url);
  const firstSegment = url.pathname.split("/")[1];
  if (isLocale(firstSegment)) return undefined;

  const isRoot = url.pathname === "/";
  const isLegacyPage =
    /^\/(?:docs|examples|changelog)(?:\/)?$/.test(url.pathname) ||
    /^\/plugins(?:\/[^/]+)?(?:\/)?$/.test(url.pathname);
  if (!isRoot && !isLegacyPage) return undefined;

  const locale = localeFromAcceptLanguage(request.headers.get("accept-language"));
  url.pathname = "/" + locale + (url.pathname === "/" ? "" : url.pathname);
  return Response.redirect(url, 302);
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(response: Response, request: Request): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!isH3SwallowedErrorBody(body)) return response;

  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return new Response(renderErrorPage(localeFromPathname(new URL(request.url).pathname)), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function isH3SwallowedErrorBody(body: string): boolean {
  try {
    const payload = JSON.parse(body) as { unhandled?: unknown; message?: unknown };
    return payload.unhandled === true && payload.message === "HTTPError";
  } catch {
    return false;
  }
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    try {
      const localeRedirect = redirectToLocale(request);
      if (localeRedirect) return localeRedirect;
      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      return await normalizeCatastrophicSsrResponse(response, request);
    } catch (error) {
      console.error(error);
      return new Response(renderErrorPage(localeFromPathname(new URL(request.url).pathname)), {
        status: 500,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }
  },
};
