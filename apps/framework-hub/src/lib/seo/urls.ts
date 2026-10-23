import type { Locale } from "@/lib/i18n";

/** Every public URL on the site is built from this origin. */
export const PUBLIC_SITE_URL = "https://dshx.io";
export const DEFAULT_SOCIAL_IMAGE = `${PUBLIC_SITE_URL}/dshx-runtime-reference.png`;

/** The canonical form of a site path: leading slash, no query, hash, or trailing slash. */
export function normalizePublicPath(path: string): string {
  const withoutQueryOrHash = path.split(/[?#]/, 1)[0] ?? "/";
  const withLeadingSlash = withoutQueryOrHash.startsWith("/")
    ? withoutQueryOrHash
    : `/${withoutQueryOrHash}`;
  if (withLeadingSlash === "/") return withLeadingSlash;
  return withLeadingSlash.replace(/\/+$/, "");
}

/** An absolute URL for a site path. */
export function publicUrl(path: string): string {
  return `${PUBLIC_SITE_URL}${normalizePublicPath(path)}`;
}

/** A locale-relative path (`/plugins`) as the localized one this site serves (`/en/plugins`). */
export function localePath(locale: Locale, path: string): string {
  const suffix = normalizePublicPath(path);
  return normalizePublicPath(suffix === "/" ? `/${locale}` : `/${locale}${suffix}`);
}

/** A social card URL whose revision changes whenever the card's inputs do. */
export function socialCardUrl(path: string, ...revisionParts: readonly string[]): string {
  let hash = 2_166_136_261;
  for (const character of revisionParts.join("\u0000")) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16_777_619);
  }
  return `${publicUrl(path)}?v=${(hash >>> 0).toString(36)}`;
}

export type Alternates = {
  readonly en: string;
  readonly zh: string;
  readonly default?: string;
};

/** The reciprocal locale pair for a path that exists in both languages. */
export function localizedAlternates(path: string): Alternates {
  const suffix = normalizePublicPath(path);
  const localizedSuffix = suffix === "/" ? "" : suffix;
  return {
    en: `/en${localizedSuffix}`,
    zh: `/zh${localizedSuffix}`,
    default: `/en${localizedSuffix}`,
  };
}

/** Alternates are only advertised when the page is indexable in every language it names. */
export function localizedAlternatesForLocales(
  path: string,
  locales: readonly Locale[],
): Alternates | false {
  const ready = new Set(locales);
  return ready.has("en") && ready.has("zh") ? localizedAlternates(path) : false;
}
