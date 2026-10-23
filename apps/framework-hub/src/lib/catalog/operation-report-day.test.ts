import { describe, expect, it } from "vitest";

import {
  OPERATION_REPORT_DAY_SQL,
  OPERATIONS_TIME_ZONE,
  operationReportDayKey,
} from "./operation-report-day";

/** The offset the SQL expression hard-codes, read back from the IANA zone. */
function zoneOffsetHours(value: string): number {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    hourCycle: "h23",
    timeZone: OPERATIONS_TIME_ZONE,
  });
  const utcHour = new Date(value).getUTCHours();
  const zoneHour = Number(formatter.format(new Date(value)));
  return (zoneHour - utcHour + 24) % 24;
}

describe("the operations report day", () => {
  it("groups reports by the Asia/Shanghai calendar day", () => {
    expect(operationReportDayKey("2026-10-21T15:59:59.000Z")).toBe("2026-10-21");
    expect(operationReportDayKey("2026-10-21T16:00:00.000Z")).toBe("2026-10-22");
  });

  it("spells the SQL boundary once", () => {
    expect(OPERATION_REPORT_DAY_SQL).toBe("date(completed_at/1000,'unixepoch','+8 hours')");
  });

  it("hard-codes the offset the zone actually has on both sides of the year", () => {
    for (const value of ["2026-01-15T00:30:00Z", "2026-07-15T00:30:00Z", "2026-10-21T16:30:00Z"]) {
      expect(OPERATION_REPORT_DAY_SQL).toContain(`+${zoneOffsetHours(value)} hours`);
    }
  });
});
