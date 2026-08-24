/* React Email templates render outside the Hub browser's Fast Refresh boundary. */
/* eslint-disable react-refresh/only-export-components */

import { render } from "@react-email/render";
import type { CSSProperties } from "react";

import {
  EmailButton,
  EmailEvidence,
  EmailFactRow,
  EmailFooter,
  EmailHeader,
  EmailShell,
  EmailStatus,
  emailTheme,
  type EmailStatusTone,
} from "./components";

export type CriticalApprovalEmailStatus =
  "approved" | "rejected" | "changes_requested" | "effect_failed";

export type CriticalApprovalEmailProps = {
  locale: "en" | "zh";
  approvalId: string;
  title: string;
  status: CriticalApprovalEmailStatus;
  executionMode: "server" | "agent";
  effectStatus: string;
  reason?: string | undefined;
  actionUrl: string;
};

type StatusCopy = {
  subject: (title: string) => string;
  label: string;
  heading: string;
  description: (props: CriticalApprovalEmailProps) => string;
  tone: EmailStatusTone;
};

const copy = {
  en: {
    preheader: "Your DSHX Hub approval has been updated.",
    request: "Item",
    status: "Status",
    execution: "Progress",
    approvalId: "Reference",
    reason: "Note",
    open: "View details",
    executionValues: {
      succeeded: "Completed",
      awaiting_agent: "Waiting to be processed",
      failed: "Failed",
      other: "Not processed",
    },
    footer:
      "You received this email because this approval is linked to your DSHX Hub account. This address does not accept replies.",
    statuses: {
      approved: {
        subject: (title: string) => `Approved: ${title}`,
        label: "Approved",
        heading: "Approval passed",
        description: (props: CriticalApprovalEmailProps) =>
          props.executionMode === "agent"
            ? "The request was approved and is waiting to be processed."
            : "The requested change has been completed.",
        tone: "success",
      },
      rejected: {
        subject: (title: string) => `Not approved: ${title}`,
        label: "Rejected",
        heading: "Approval not passed",
        description: () => "No changes were made. You can view the reason below.",
        tone: "danger",
      },
      changes_requested: {
        subject: (title: string) => `More information needed: ${title}`,
        label: "More information needed",
        heading: "Please add more information",
        description: () => "Update the request based on the note below, then submit it again.",
        tone: "warning",
      },
      effect_failed: {
        subject: (title: string) => `Could not complete: ${title}`,
        label: "Could not complete",
        heading: "The approved change could not be completed",
        description: () =>
          "No retry has started. An administrator can review the issue and try again.",
        tone: "danger",
      },
    } satisfies Record<CriticalApprovalEmailStatus, StatusCopy>,
  },
  zh: {
    preheader: "你的 DSHX Hub 审批有新进展。",
    request: "事项",
    status: "当前状态",
    execution: "处理进度",
    approvalId: "记录编号",
    reason: "说明",
    open: "查看详情",
    executionValues: {
      succeeded: "已完成",
      awaiting_agent: "等待处理",
      failed: "执行失败",
      other: "尚未处理",
    },
    footer: "这项审批与你的 DSHX Hub 账号有关，因此你收到了这封邮件。本邮箱不接收回复。",
    statuses: {
      approved: {
        subject: (title: string) => `审批通过：${title}`,
        label: "审批通过",
        heading: "审批已通过",
        description: (props: CriticalApprovalEmailProps) =>
          props.executionMode === "agent"
            ? "申请已经通过，目前正在等待处理。"
            : "申请的变更已经完成。",
        tone: "success",
      },
      rejected: {
        subject: (title: string) => `审批未通过：${title}`,
        label: "未通过",
        heading: "审批未通过",
        description: () => "本次没有产生变更，你可以在下方查看原因。",
        tone: "danger",
      },
      changes_requested: {
        subject: (title: string) => `需要补充信息：${title}`,
        label: "需要补充信息",
        heading: "请补充相关信息",
        description: () => "请根据下方说明更新申请，然后重新提交。",
        tone: "warning",
      },
      effect_failed: {
        subject: (title: string) => `处理失败：${title}`,
        label: "处理失败",
        heading: "审批后的操作没有完成",
        description: () => "系统还没有重试。管理员可以查看问题并重新处理。",
        tone: "danger",
      },
    } satisfies Record<CriticalApprovalEmailStatus, StatusCopy>,
  },
} as const;

export function CriticalApprovalEmail(props: CriticalApprovalEmailProps) {
  const messages = copy[props.locale];
  const status = messages.statuses[props.status];
  const execution =
    messages.executionValues[
      props.effectStatus as keyof Omit<typeof messages.executionValues, "other">
    ] ?? messages.executionValues.other;

  return (
    <EmailShell lang={props.locale} preheader={messages.preheader}>
      <EmailHeader />
      <main>
        <div style={{ padding: "36px 0 0" }}>
          <EmailStatus label={status.label} tone={status.tone} />
          <h1 style={headingStyle}>{status.heading}</h1>
          <p style={introStyle}>{status.description(props)}</p>
        </div>

        <table
          role="presentation"
          width="100%"
          cellPadding="0"
          cellSpacing="0"
          style={{ marginTop: "26px" }}
        >
          <tbody>
            <EmailFactRow label={messages.request} value={props.title} />
            <EmailFactRow label={messages.status} value={status.label} />
            <EmailFactRow label={messages.execution} value={execution} />
          </tbody>
        </table>

        <EmailEvidence
          label={messages.approvalId}
          approvalId={props.approvalId}
          reasonLabel={messages.reason}
          reason={props.reason}
        />
        <EmailButton href={props.actionUrl}>{messages.open}</EmailButton>
      </main>
      <EmailFooter>{messages.footer}</EmailFooter>
    </EmailShell>
  );
}

export async function renderCriticalApprovalEmail(props: CriticalApprovalEmailProps) {
  const element = <CriticalApprovalEmail {...props} />;
  const messages = copy[props.locale];
  const status = messages.statuses[props.status];
  const execution =
    messages.executionValues[
      props.effectStatus as keyof Omit<typeof messages.executionValues, "other">
    ] ?? messages.executionValues.other;
  const text = [
    messages.preheader,
    status.heading,
    status.description(props),
    `${messages.request}: ${props.title}`,
    `${messages.status}: ${status.label}`,
    `${messages.execution}: ${execution}`,
    `${messages.approvalId}: ${props.approvalId}`,
    ...(props.reason ? [`${messages.reason}: ${props.reason}`] : []),
    `${messages.open}: ${props.actionUrl}`,
    messages.footer,
  ].join("\n\n");
  return {
    subject: status.subject(props.title),
    html: await render(element),
    text,
  };
}

export default function CriticalApprovalEmailPreview() {
  return (
    <CriticalApprovalEmail
      locale="zh"
      approvalId="6a3bafbe-85df-4a8e-bf14-dshx-preview"
      title="确认插件维护者身份变更"
      status="changes_requested"
      executionMode="agent"
      effectStatus="awaiting_agent"
      reason="请补充仓库默认分支中的维护者证明，然后重新提交审批。"
      actionUrl="https://dshx.io/zh/account/notifications"
    />
  );
}

const headingStyle: CSSProperties = {
  margin: "20px 0 0",
  color: emailTheme.foreground,
  fontFamily: "'Inter Tight', Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  fontSize: "30px",
  fontWeight: 600,
  letterSpacing: "-0.03em",
  lineHeight: "36px",
};

const introStyle: CSSProperties = {
  margin: "18px 0 0",
  color: emailTheme.foreground,
  fontFamily: "'Inter Tight', Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  fontSize: "15px",
  lineHeight: "24px",
};
