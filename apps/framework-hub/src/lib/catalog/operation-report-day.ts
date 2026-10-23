import { sql } from "drizzle-orm";

/**
 * The daily report boundary.
 *
 * An operations report belongs to a calendar day in Asia/Shanghai, and three
 * readers have to agree on which day that is: the public list groups by it,
 * the day page compares against it, and the sitemap partitions by it. The
 * boundary is therefore written once here, as a day key for TypeScript and as
 * a SQL expression for the queries that must group or filter before they can
 * paginate — the same twin `curation-policy.ts` keeps for copy quality.
 *
 * The two spellings are asserted to agree by `operation-report-day.test.ts`.
 */
export const OPERATIONS_TIME_ZONE = "Asia/Shanghai";

/** The expression, as text. Parameterized queries interpolate this string. */
export const OPERATION_REPORT_DAY_SQL = "date(completed_at/1000,'unixepoch','+8 hours')";

/** The same expression, for the queries built with Drizzle's `sql` tag. */
export const operationReportDaySql = sql.raw(OPERATION_REPORT_DAY_SQL);

const dayKeyFormatter = new Intl.DateTimeFormat("en-CA", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  timeZone: OPERATIONS_TIME_ZONE,
});

/** The public daily report key, e.g. 2026-10-21, in Asia/Shanghai. */
export function operationReportDayKey(value: string | number) {
  const parts = dayKeyFormatter.formatToParts(new Date(value));
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((entry) => entry.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}
