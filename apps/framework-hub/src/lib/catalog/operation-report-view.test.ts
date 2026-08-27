import { describe, expect, it } from "vitest";

import { formatOperationReportDate } from "./operation-report-view";

describe("formatOperationReportDate", () => {
  it("uses the fixed operations timezone for deterministic hydration", () => {
    expect(formatOperationReportDate("2026-08-27T08:55:20.464Z", "zh")).toContain("16:55");
    expect(formatOperationReportDate("2026-08-27T08:55:20.464Z", "en")).toContain("4:55");
  });
});
