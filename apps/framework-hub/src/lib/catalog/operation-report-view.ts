import type { Locale } from "@/lib/i18n";

export const OPERATIONS_TIME_ZONE = "Asia/Shanghai";

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
