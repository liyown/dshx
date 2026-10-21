import { describe, expect, it } from "vitest";

import {
  formatOperationReportDate,
  isOperationReportIndexable,
  operationReportDescription,
  operationReportExcerpt,
} from "./operation-report-view";

describe("formatOperationReportDate", () => {
  it("uses the fixed operations timezone for deterministic hydration", () => {
    expect(formatOperationReportDate("2026-08-27T08:55:20.464Z", "zh")).toContain("16:55");
    expect(formatOperationReportDate("2026-08-27T08:55:20.464Z", "en")).toContain("4:55");
  });
});

describe("operation report previews", () => {
  it("keeps short bodies intact and truncates long ones on a word boundary", () => {
    expect(operationReportExcerpt("Short report", 100)).toEqual({
      text: "Short report",
      truncated: false,
    });
    const excerpt = operationReportExcerpt("word ".repeat(200), 100);
    expect(excerpt.truncated).toBe(true);
    expect(excerpt.text.endsWith("…")).toBe(true);
    expect(excerpt.text.length).toBeLessThanOrEqual(101);
  });

  it("builds a single-line SEO description", () => {
    expect(operationReportDescription("Line one\n\nLine two", 100)).toBe("Line one Line two");
    expect(operationReportDescription("word ".repeat(100), 40)).toMatch(/…$/u);
  });

  it("keeps thin reports out of the index", () => {
    expect(isOperationReportIndexable("short")).toBe(false);
    expect(isOperationReportIndexable("x".repeat(400))).toBe(true);
  });
});
