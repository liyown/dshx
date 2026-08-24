import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";
import { isLocale, localeFromAcceptLanguage, localeFromPathname } from "./lib/i18n";
import type { AppBindings, AppRequestContext } from "./lib/db/context";

type ServerEntry = {
  fetch: (
    request: Request,
    options: { context: AppRequestContext },
  ) => Promise<Response> | Response;
};

type CloudflareRequest = Request & {
  runtime?: {
    cloudflare?: {
      env?: AppBindings;
    };
  };
};

type NitroGlobal = typeof globalThis & {
  __env__?: AppBindings;
  __dshxDevBindingsPromise__?: Promise<AppBindings>;
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

function hasDatabaseBinding(value: unknown): value is AppBindings {
  return value != null && typeof value === "object" && "DB" in value;
}

function hasWaitUntil(value: unknown): value is { waitUntil(promise: Promise<unknown>): void } {
  return (
    value != null &&
    typeof value === "object" &&
    "waitUntil" in value &&
    typeof value.waitUntil === "function"
  );
}

async function loadDevBindings(): Promise<AppBindings> {
  if (!import.meta.env.DEV) return {};

  const nitroGlobal = globalThis as NitroGlobal;
  nitroGlobal.__dshxDevBindingsPromise__ ??= import("wrangler")
    .then(({ getPlatformProxy }) =>
      getPlatformProxy<Env>({
        configPath: "wrangler.jsonc",
        persist: true,
        remoteBindings: false,
      }),
    )
    .then((proxy) => proxy.env)
    .catch((error) => {
      console.error(error);
      return {};
    });

  return nitroGlobal.__dshxDevBindingsPromise__;
}

async function resolveBindings(request: Request, explicitEnv: unknown): Promise<AppBindings> {
  const runtimeEnv = (request as CloudflareRequest).runtime?.cloudflare?.env;
  if (runtimeEnv) return runtimeEnv;
  if (hasDatabaseBinding(explicitEnv)) return explicitEnv;
  const nitroEnv = (globalThis as NitroGlobal).__env__;
  if (nitroEnv) return nitroEnv;
  return loadDevBindings();
}

function withSecurityHeaders(response: Response) {
  const headers = new Headers(response.headers);
  headers.set("x-content-type-options", "nosniff");
  headers.set("referrer-policy", "strict-origin-when-cross-origin");
  headers.set("permissions-policy", "camera=(), microphone=(), geolocation=()");
  headers.set("x-frame-options", "SAMEORIGIN");
  headers.set(
    "content-security-policy",
    "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'self'; script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com https://static.cloudflareinsights.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data: https:; connect-src 'self' https://registry.npmjs.org https://api.npmjs.org https://challenges.cloudflare.com; frame-src https://challenges.cloudflare.com",
  );
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function redirectToLocale(request: Request): Response | undefined {
  const url = new URL(request.url);
  const firstSegment = url.pathname.split("/")[1];
  if (isLocale(firstSegment)) return undefined;

  const isRoot = url.pathname === "/";
  const isLegacyPage =
    /^\/(?:docs|examples)(?:\/)?$/.test(url.pathname) ||
    /^\/plugins(?:\/[^/]+)?(?:\/)?$/.test(url.pathname);
  if (!isRoot && !isLegacyPage) return undefined;

  const locale = localeFromAcceptLanguage(request.headers.get("accept-language"));
  url.pathname = "/" + locale + (url.pathname === "/" ? "" : url.pathname);
  return Response.redirect(url, 302);
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(
  response: Response,
  request: Request,
): Promise<Response> {
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
      const context: AppRequestContext = {
        cloudflare: await resolveBindings(request, env),
        ...(hasWaitUntil(ctx) ? { executionCtx: ctx } : {}),
      };
      const response = await handler.fetch(request, {
        context,
      });
      return withSecurityHeaders(await normalizeCatastrophicSsrResponse(response, request));
    } catch (error) {
      console.error(error);
      return new Response(renderErrorPage(localeFromPathname(new URL(request.url).pathname)), {
        status: 500,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }
  },
};
