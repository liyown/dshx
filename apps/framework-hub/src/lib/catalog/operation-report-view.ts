import { intlLocale, type Locale } from "@/lib/i18n";

import { OPERATIONS_TIME_ZONE } from "./operation-report-day";

// Reports below this length are mostly blocked or skipped-run notes. They stay
// public and linkable, but are kept out of the index and the sitemap so the
// operations surface does not add thin pages to the site.
export const OPERATION_REPORT_INDEX_MIN_CHARS = 400;
export const OPERATION_REPORT_EXCERPT_CHARS = 700;
// Days published before the merge prompt can hold many run notes. Keep the
// latest ones visible without turning one page into an unbounded document.
export const OPERATION_REPORT_EARLIER_LIMIT = 20;

// Kept in sync with the operations prompt. A cumulative same-day report starts
// with this comment, so the Hub can show it as the complete daily document
// instead of displaying the earlier runs again.
export const OPERATION_REPORT_MERGE_MARKER = "<!-- daily-report:merged -->";

export function isOperationReportMerged(body: string) {
  return body.includes(OPERATION_REPORT_MERGE_MARKER);
}

/**
 * Markdown keeps the public report readable; previews and SEO descriptions
 * need the visible text instead of syntax. This intentionally handles only the
 * constructs the operations prompt asks for.
 */
export function operationReportPlainText(markdown: string) {
  return markdown
    .replace(/<!--[\s\S]*?-->/gu, " ")
    .replace(/```[^\n]*\n([\s\S]*?)```/gu, "$1")
    .replace(/`([^`]+)`/gu, "$1")
    .replace(/!\[([^\]]*)\]\([^)]*\)/gu, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/gu, "$1")
    .replace(/^\s{0,3}#{1,6}\s+/gmu, "")
    .replace(/^\s{0,3}>\s?/gmu, "")
    .replace(/^\s{0,3}(?:[-*+]|\d+[.)])\s+/gmu, "")
    .replace(/^\s*\|?[\s:|-]*-[\s:|-]*\|?\s*$/gmu, " ")
    .replace(/\|/gu, " ")
    .replace(/\*\*([^*]+)\*\*/gu, "$1")
    .replace(/\*([^*\n]+)\*/gu, "$1")
    .replace(/~~([^~]+)~~/gu, "$1")
    .replace(/<\/?[a-z][^>]*>/giu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

export function formatOperationReportDate(value: string, locale: Locale) {
  return new Intl.DateTimeFormat(intlLocale(locale), {
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
  return new Intl.DateTimeFormat(intlLocale(locale), {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: OPERATIONS_TIME_ZONE,
  }).format(new Date(value));
}

export function formatOperationReportDayKey(day: string, locale: Locale) {
  return formatOperationReportDay(`${day}T12:00:00+08:00`, locale);
}

export function isOperationReportIndexable(body: string) {
  return body.trim().length >= OPERATION_REPORT_INDEX_MIN_CHARS;
}

export function operationReportDescription(body: string, maximum = 160) {
  const flattened = operationReportPlainText(body);
  if (flattened.length <= maximum) return flattened;
  const slice = flattened.slice(0, maximum);
  const boundary = slice.lastIndexOf(" ");
  const cut = boundary >= Math.floor(maximum * 0.6) ? slice.slice(0, boundary) : slice;
  return `${cut.trimEnd()}…`;
}

export function operationReportExcerpt(body: string, maximum = OPERATION_REPORT_EXCERPT_CHARS) {
  const text = operationReportPlainText(body);
  if (text.length <= maximum) return { text, truncated: false } as const;
  const slice = text.slice(0, maximum);
  const boundary = slice.lastIndexOf(" ");
  const cut = boundary >= Math.floor(maximum * 0.7) ? slice.slice(0, boundary) : slice;
  return { text: `${cut.trimEnd()}…`, truncated: true } as const;
}
