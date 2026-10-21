import { describe, expect, it } from "vitest";

import {
  formatOperationReportDate,
  formatOperationReportDayKey,
  isOperationReportIndexable,
  isOperationReportMerged,
  operationReportDayKey,
  operationReportDescription,
  operationReportExcerpt,
  operationReportPlainText,
} from "./operation-report-view";

describe("formatOperationReportDate", () => {
  it("uses the fixed operations timezone for deterministic hydration", () => {
    expect(formatOperationReportDate("2026-08-27T08:55:20.464Z", "zh")).toContain("16:55");
    expect(formatOperationReportDate("2026-08-27T08:55:20.464Z", "en")).toContain("4:55");
  });
});

describe("operation report days", () => {
  it("groups reports by the Asia/Shanghai calendar day", () => {
    expect(operationReportDayKey("2026-10-21T15:59:59.000Z")).toBe("2026-10-21");
    expect(operationReportDayKey("2026-10-21T16:00:00.000Z")).toBe("2026-10-22");
    expect(formatOperationReportDayKey("2026-10-21", "en")).toContain("Oct 21, 2026");
    expect(formatOperationReportDayKey("2026-10-21", "zh")).toContain("2026年10月21日");
  });

  it("recognizes cumulative daily reports", () => {
    expect(isOperationReportMerged("<!-- daily-report:merged -->\n## Summary")).toBe(true);
    expect(isOperationReportMerged("## Summary\nplain report")).toBe(false);
  });
});

describe("operation report previews", () => {
  it("strips Markdown for previews and descriptions", () => {
    const body = [
      "<!-- daily-report:merged -->",
      "## Summary",
      "- Added **dsh-context** and `dsh-fast`.",
      "- See [the source](https://example.com/plugin).",
      "",
      "| Item | Count |",
      "| --- | --- |",
      "| Curated | 3 |",
    ].join("\n");
    const text = operationReportPlainText(body);
    expect(text).toBe(
      "Summary Added dsh-context and dsh-fast. See the source. Item Count Curated 3",
    );
    expect(operationReportDescription(body, 40)).not.toContain("#");
    expect(operationReportExcerpt(body, 40).text).not.toContain("**");
  });

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
