import { messages, type Locale, type MessageKey } from "./messages";

export { locales, messages } from "./messages";
export type { Locale, MessageKey } from "./messages";

export function isLocale(value: string | undefined): value is Locale {
  return value === "en" || value === "zh";
}

export function parseLocale(value: string | undefined): Locale {
  return isLocale(value) ? value : "en";
}

export function localeFromPathname(pathname: string): Locale {
  return parseLocale(pathname.split("/")[1]);
}

export function localeFromAcceptLanguage(header: string | null | undefined): Locale {
  const candidates = (header ?? "")
    .split(",")
    .map((part) => {
      const [rawLanguage, ...params] = part.trim().toLowerCase().split(";");
      const quality = params.find((param) => param.trim().startsWith("q="));
      const q = quality ? Number(quality.trim().slice(2)) : 1;
      return { language: rawLanguage ?? "", q: Number.isFinite(q) ? q : 0 };
    })
    .filter((candidate) => candidate.q > 0)
    .sort((a, b) => b.q - a.q);

  return candidates.some(
    (candidate) => candidate.language === "zh" || candidate.language.startsWith("zh-"),
  )
    ? "zh"
    : "en";
}

export function localeFromBrowser(): Locale {
  if (typeof navigator === "undefined") return "en";
  const languages = navigator.languages.length > 0 ? navigator.languages : [navigator.language];
  return localeFromAcceptLanguage(languages.join(","));
}

export function localizedPath(locale: Locale, pathname: string): string {
  const normalized = pathname.startsWith("/") ? pathname : "/" + pathname;
  const segments = normalized.split("/");
  if (isLocale(segments[1])) segments[1] = locale;
  else segments.splice(1, 0, locale);
  return segments.join("/") || "/" + locale;
}

export type Translate = (key: MessageKey, params?: Record<string, string | number>) => string;

export function createTranslator(locale: Locale): Translate {
  return (key, params) => {
    let value = messages[locale][key] ?? messages.en[key] ?? key;
    for (const [name, replacement] of Object.entries(params ?? {})) {
      value = value.replaceAll("{" + name + "}", String(replacement));
    }
    return value;
  };
}

/** The locale that is not this one: the alternate page, the alternate card. */
export function otherLocale(locale: Locale): Locale {
  return locale === "en" ? "zh" : "en";
}

/** The BCP-47 tag schema.org, `<html lang>` and `Intl` all start from. */
export function languageTag(locale: Locale): "zh-CN" | "en" {
  return locale === "zh" ? "zh-CN" : "en";
}

/** Open Graph spells the same tag with an underscore. */
export function ogLocale(locale: Locale): "zh_CN" | "en_US" {
  return locale === "zh" ? "zh_CN" : "en_US";
}

/** The tag `Intl` wants when a formatter needs a region. */
export function intlLocale(locale: Locale): "zh-CN" | "en-US" {
  return locale === "zh" ? "zh-CN" : "en-US";
}

export type DateFormat = "short" | "long";

/**
 * One date format per locale and purpose.
 *
 * `short` is the catalog's: a three-letter month, rendered in the reader's
 * time zone. `long` is the editorial one — a full month name with the day
 * pinned to UTC, so a publish date cannot move by a time zone. Four modules
 * used to spell these formatters out themselves.
 */
export function formatDate(value: string, locale: Locale, format: DateFormat = "short"): string {
  return new Intl.DateTimeFormat(intlLocale(locale), {
    year: "numeric",
    month: format === "long" ? "long" : "short",
    day: "numeric",
    ...(format === "long" ? { timeZone: "UTC" } : {}),
  }).format(new Date(value));
}
