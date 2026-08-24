import { describe, expect, it } from "vitest";

import {
  renderCriticalApprovalEmail,
  type CriticalApprovalEmailProps,
  type CriticalApprovalEmailStatus,
} from "./critical-approval";

const base: CriticalApprovalEmailProps = {
  locale: "en",
  approvalId: "approval-123",
  title: "Confirm plugin maintainer ownership",
  status: "approved",
  executionMode: "server",
  effectStatus: "succeeded",
  reason: "Repository evidence verified.",
  actionUrl: "https://dshx.io/en/account/notifications",
};

describe("critical approval email", () => {
  it.each<[CriticalApprovalEmailStatus, string]>([
    ["approved", "Approval passed"],
    ["rejected", "Approval not passed"],
    ["changes_requested", "Please add more information"],
    ["effect_failed", "The approved change could not be completed"],
  ])("renders the %s state", async (status, heading) => {
    const rendered = await renderCriticalApprovalEmail({ ...base, status });
    expect(rendered.html).toContain(heading);
    expect(rendered.text).toContain(heading);
    expect(rendered.text).toContain(base.actionUrl);
    expect(rendered.subject).toContain(base.title);
  });

  it("renders Chinese copy and escapes untrusted decision text", async () => {
    const rendered = await renderCriticalApprovalEmail({
      ...base,
      locale: "zh",
      status: "changes_requested",
      title: "确认插件维护者身份",
      reason: '<script>alert("unsafe")</script>',
      actionUrl: "https://dshx.io/zh/account/notifications",
    });
    expect(rendered.subject).toBe("需要补充信息：确认插件维护者身份");
    expect(rendered.html).toContain("请补充相关信息");
    expect(rendered.html).not.toContain('<script>alert("unsafe")</script>');
    expect(rendered.html).toContain("&lt;script&gt;");
    expect(rendered.text).toContain("https://dshx.io/zh/account/notifications");
  });

  it("omits an empty decision note without dropping technical evidence", async () => {
    const rendered = await renderCriticalApprovalEmail({
      ...base,
      reason: undefined,
      approvalId: "a".repeat(180),
    });
    expect(rendered.text).toContain("a".repeat(180));
    expect(rendered.text).not.toContain("Note:");
  });
});
