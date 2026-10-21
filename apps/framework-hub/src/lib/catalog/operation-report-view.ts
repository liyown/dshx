import type { Locale } from "@/lib/i18n";

export const OPERATIONS_TIME_ZONE = "Asia/Shanghai";

// Reports below this length are mostly blocked or skipped-run notes. They stay
// public and linkable, but are kept out of the index and the sitemap so the
// operations surface does not add thin pages to the site.
export const OPERATION_REPORT_INDEX_MIN_CHARS = 400;
export const OPERATION_REPORT_EXCERPT_CHARS = 700;

export function formatOperationReportDate(value: string, locale: Locale) {
  return new Intl.DateTimeFormat(locale === "zh" ? "zh-CN" : "en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: OPERATIONS_TIME_ZONE,
    timeZoneName: "short",
  }).format(new Date(value));
}

export function formatOperationReportDay(value: string, locale: Locale) {
  return new Intl.DateTimeFormat(locale === "zh" ? "zh-CN" : "en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: OPERATIONS_TIME_ZONE,
  }).format(new Date(value));
}

export function isOperationReportIndexable(body: string) {
  return body.trim().length >= OPERATION_REPORT_INDEX_MIN_CHARS;
}

export function operationReportDescription(body: string, maximum = 160) {
  const flattened = body.replace(/\s+/gu, " ").trim();
  if (flattened.length <= maximum) return flattened;
  const slice = flattened.slice(0, maximum);
  const boundary = slice.lastIndexOf(" ");
  const cut = boundary >= Math.floor(maximum * 0.6) ? slice.slice(0, boundary) : slice;
  return `${cut.trimEnd()}…`;
}

export function operationReportExcerpt(body: string, maximum = OPERATION_REPORT_EXCERPT_CHARS) {
  const text = body.trim();
  if (text.length <= maximum) return { text, truncated: false } as const;
  const slice = text.slice(0, maximum);
  const boundary = Math.max(slice.lastIndexOf("\n"), slice.lastIndexOf(" "));
  const cut = boundary >= Math.floor(maximum * 0.7) ? slice.slice(0, boundary) : slice;
  return { text: `${cut.trimEnd()}…`, truncated: true } as const;
}
