import { DOC_SLUGS } from "@/lib/docs";

export type SitemapEntryKind =
  "static" | "document" | "changelog" | "plugin" | "category" | "publisher";

export type SitemapEntry = {
  readonly loc: string;
  readonly kind: SitemapEntryKind;
  readonly locale: "en" | "zh";
  readonly lastmod?: string;
};

export type SitemapDatabaseRow = {
  readonly kind: Exclude<SitemapEntryKind, "static" | "document">;
  readonly locale: "en" | "zh";
  readonly value: string;
  readonly updated_at: number | null;
};

const SITEMAP_SOFT_URL_LIMIT = 45_000;
const SITEMAP_HARD_URL_LIMIT = 50_000;
const SITEMAP_SOFT_BYTE_LIMIT = 45 * 1024 * 1024;
const SITEMAP_HARD_BYTE_LIMIT = 50 * 1024 * 1024;
export const SITEMAP_CACHE_CONTROL =
  "public, max-age=300, s-maxage=21600, stale-while-revalidate=86400";

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function normalizedSiteUrl(siteUrl: string): string {
  const parsed = new URL(siteUrl);
  if (parsed.protocol !== "https:" && parsed.hostname !== "localhost")
    throw new Error("Sitemap SITE_URL must use HTTPS");
  parsed.pathname = "";
  parsed.search = "";
  parsed.hash = "";
  return parsed.toString().replace(/\/$/, "");
}

function staticEntries(site: string): SitemapEntry[] {
  return (["en", "zh"] as const).flatMap((locale) => {
    const basePaths = ["", "/plugins", "/operations", "/docs", "/examples", "/about", "/changelog"];
    const legalPaths = ["privacy", "terms", "community"].map((document) => `/legal/${document}`);
    return [
      ...basePaths.map((path) => ({
        loc: `${site}/${locale}${path}`,
        kind: "static" as const,
        locale,
      })),
      ...DOC_SLUGS.map((slug) => ({
        loc: `${site}/${locale}/docs/${slug}`,
        kind: "document" as const,
        locale,
      })),
      ...legalPaths.map((path) => ({
        loc: `${site}/${locale}${path}`,
        kind: "static" as const,
        locale,
      })),
    ];
  });
}

function dynamicEntry(site: string, row: SitemapDatabaseRow): SitemapEntry {
  const prefix =
    row.kind === "changelog"
      ? "changelog"
      : row.kind === "plugin"
        ? "plugins"
        : row.kind === "category"
          ? "categories"
          : "publishers";
  const updatedAt = row.updated_at == null ? null : new Date(row.updated_at);
  const lastmod =
    updatedAt &&
    Number.isFinite(updatedAt.getTime()) &&
    updatedAt.getTime() > 0 &&
    updatedAt.getTime() <= Date.now()
      ? updatedAt.toISOString()
      : null;
  return {
    loc: `${site}/${row.locale}/${prefix}/${encodeURIComponent(row.value)}`,
    kind: row.kind,
    locale: row.locale,
    ...(lastmod ? { lastmod } : {}),
  };
}

export function createSitemapEntries(
  siteUrl: string,
  rows: readonly SitemapDatabaseRow[],
): SitemapEntry[] {
  const site = normalizedSiteUrl(siteUrl);
  const entries = [...staticEntries(site), ...rows.map((row) => dynamicEntry(site, row))].sort(
    (left, right) =>
      left.kind.localeCompare(right.kind) ||
      left.locale.localeCompare(right.locale) ||
      left.loc.localeCompare(right.loc),
  );
  const unique = new Map<string, SitemapEntry>();
  for (const entry of entries) {
    const parsed = new URL(entry.loc);
    if (parsed.origin !== site) throw new Error(`Sitemap URL is outside SITE_URL: ${entry.loc}`);
    if (parsed.protocol !== "https:" && parsed.hostname !== "localhost")
      throw new Error(`Sitemap URL must use HTTPS: ${entry.loc}`);
    if (parsed.search || parsed.hash) throw new Error(`Sitemap URL is not canonical: ${entry.loc}`);
    unique.set(entry.loc, entry);
  }
  return [...unique.values()];
}

export function buildSitemapXml(entries: readonly SitemapEntry[]): {
  readonly xml: string;
  readonly warnings: readonly string[];
} {
  if (entries.length > SITEMAP_HARD_URL_LIMIT)
    throw new Error(`Sitemap exceeds ${SITEMAP_HARD_URL_LIMIT} URLs`);
  const chunks = [
    '<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...entries.map(
      (entry) =>
        `<url><loc>${escapeXml(entry.loc)}</loc>${entry.lastmod ? `<lastmod>${escapeXml(entry.lastmod)}</lastmod>` : ""}</url>`,
    ),
    "</urlset>",
  ];
  const xml = chunks.join("");
  const bytes = new TextEncoder().encode(xml).byteLength;
  if (bytes > SITEMAP_HARD_BYTE_LIMIT)
    throw new Error(`Sitemap exceeds ${SITEMAP_HARD_BYTE_LIMIT} uncompressed bytes`);
  const warnings: string[] = [];
  if (entries.length >= SITEMAP_SOFT_URL_LIMIT)
    warnings.push(`url-count-near-limit:${entries.length}`);
  if (bytes >= SITEMAP_SOFT_BYTE_LIMIT) warnings.push(`byte-size-near-limit:${bytes}`);
  return { xml, warnings };
}

export async function sitemapEtag(xml: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(xml));
  return `"${Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("")}"`;
}

export function responseForSitemap(
  xml: string,
  etag: string,
  warnings: readonly string[] = [],
): Response {
  const headers = new Headers({
    "content-type": "application/xml; charset=utf-8",
    "cache-control": SITEMAP_CACHE_CONTROL,
    etag,
  });
  if (warnings.length) headers.set("x-sitemap-warning", warnings.join(","));
  return new Response(xml, { headers });
}

export function conditionalSitemapResponse(request: Request, response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set("cache-control", SITEMAP_CACHE_CONTROL);
  const etag = response.headers.get("etag");
  if (etag && request.headers.get("if-none-match") === etag)
    return new Response(null, { status: 304, headers });
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
