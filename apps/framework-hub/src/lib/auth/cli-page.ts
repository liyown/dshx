import { localeFromAcceptLanguage, type Locale } from "@/lib/i18n";

export type CliAuthorizationStatus = "connecting" | "success" | "error";
export type CliAuthorizationReason = "expired" | "incomplete" | "exchange" | "server";

export type CliAuthorizationSearch = {
  status: CliAuthorizationStatus;
  reason?: CliAuthorizationReason | undefined;
  returnTo?: string | undefined;
};

const statuses = new Set<CliAuthorizationStatus>(["connecting", "success", "error"]);
const reasons = new Set<CliAuthorizationReason>(["expired", "incomplete", "exchange", "server"]);

export function isSafeCliReturnTo(value: unknown): value is string {
  if (typeof value !== "string" || !value.startsWith("/api/cli/authorizations/")) return false;
  try {
    const url = new URL(value, "https://dshx.invalid");
    return (
      url.origin === "https://dshx.invalid" &&
      /^\/api\/cli\/authorizations\/[^/]+\/approve$/.test(url.pathname)
    );
  } catch {
    return false;
  }
}

export function normalizeCliAuthorizationSearch(
  search: Record<string, unknown>,
): CliAuthorizationSearch {
  const status = statuses.has(search["status"] as CliAuthorizationStatus)
    ? (search["status"] as CliAuthorizationStatus)
    : "error";
  const reason = reasons.has(search["reason"] as CliAuthorizationReason)
    ? (search["reason"] as CliAuthorizationReason)
    : undefined;
  const returnTo = isSafeCliReturnTo(search["returnTo"]) ? search["returnTo"] : undefined;
  return {
    status,
    ...(reason ? { reason } : {}),
    ...(returnTo ? { returnTo } : {}),
  };
}

export function cliAuthorizationPageUrl(
  request: Request,
  search: CliAuthorizationSearch,
  locale: Locale = localeFromAcceptLanguage(request.headers.get("accept-language")),
): URL {
  const target = new URL(`/${locale}/auth/cli`, request.url);
  target.searchParams.set("status", search.status);
  if (search.reason) target.searchParams.set("reason", search.reason);
  if (search.returnTo) target.searchParams.set("returnTo", search.returnTo);
  return target;
}

export function cliAuthorizationPageResponse(
  request: Request,
  search: CliAuthorizationSearch,
): Response {
  return new Response(null, {
    status: 302,
    headers: {
      location: cliAuthorizationPageUrl(request, search).toString(),
      "cache-control": "no-store",
    },
  });
}
