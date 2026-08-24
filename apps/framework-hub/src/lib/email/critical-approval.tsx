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
    preheader: "A critical DSHX Hub approval has changed state.",
    intro: "This is a critical operational update from the DSHX Hub approval ledger.",
    request: "Request",
    status: "Status",
    execution: "Execution",
    approvalId: "Approval ID",
    reason: "Decision note",
    open: "Open notifications",
    executionValues: {
      succeeded: "Applied",
      awaiting_agent: "Awaiting Agent execution",
      failed: "Failed",
      other: "Recorded in the approval ledger",
    },
    footer:
      "This operational email was sent because your account requested the approval. Replies are not monitored; continue in DSHX Hub.",
    statuses: {
      approved: {
        subject: (title: string) => `Approved · ${title}`,
        label: "Approved",
        heading: "Your approval request was approved",
        description: (props: CriticalApprovalEmailProps) =>
          props.executionMode === "agent"
            ? "The decision is final. The requesting Agent can now continue the registered effect."
            : "The decision is final and the registered server effect has been applied.",
        tone: "success",
      },
      rejected: {
        subject: (title: string) => `Rejected · ${title}`,
        label: "Rejected",
        heading: "Your approval request was rejected",
        description: () =>
          "No registered effect will run. Review the decision note and approval evidence in the Hub.",
        tone: "danger",
      },
      changes_requested: {
        subject: (title: string) => `Changes requested · ${title}`,
        label: "Changes requested",
        heading: "Your approval request needs changes",
        description: () =>
          "Update the immutable request evidence, then submit a new version for administrator review.",
        tone: "warning",
      },
      effect_failed: {
        subject: (title: string) => `Execution failed · ${title}`,
        label: "Execution failed",
        heading: "An approved effect could not be completed",
        description: () =>
          "The approval remains recorded, but its registered effect failed. An administrator must authorize any retry.",
        tone: "danger",
      },
    } satisfies Record<CriticalApprovalEmailStatus, StatusCopy>,
  },
  zh: {
    preheader: "一项 DSHX Hub 关键审批的状态发生了变化。",
    intro: "这是来自 DSHX Hub 审批账本的关键操作通知。",
    request: "审批事项",
    status: "当前状态",
    execution: "执行状态",
    approvalId: "审批 ID",
    reason: "处理说明",
    open: "打开站内通知",
    executionValues: {
      succeeded: "已执行",
      awaiting_agent: "等待 Agent 执行",
      failed: "执行失败",
      other: "已记录到审批账本",
    },
    footer:
      "你的账号发起了这项审批，因此收到此关键操作邮件。本邮箱不接收回复，请前往 DSHX Hub 继续处理。",
    statuses: {
      approved: {
        subject: (title: string) => `审批通过 · ${title}`,
        label: "审批通过",
        heading: "你的审批申请已通过",
        description: (props: CriticalApprovalEmailProps) =>
          props.executionMode === "agent"
            ? "审批决定已生效，发起请求的 Agent 现在可以继续执行已登记的操作。"
            : "审批决定已生效，已登记的服务端操作已经执行。",
        tone: "success",
      },
      rejected: {
        subject: (title: string) => `审批拒绝 · ${title}`,
        label: "审批拒绝",
        heading: "你的审批申请未通过",
        description: () => "系统不会执行对应操作。请在 Hub 中查看处理说明与审批证据。",
        tone: "danger",
      },
      changes_requested: {
        subject: (title: string) => `需要修改 · ${title}`,
        label: "需要修改",
        heading: "你的审批申请需要补充修改",
        description: () => "请更新不可变请求证据，然后提交新版本供管理员重新审核。",
        tone: "warning",
      },
      effect_failed: {
        subject: (title: string) => `执行失败 · ${title}`,
        label: "执行失败",
        heading: "已批准的操作未能完成",
        description: () =>
          "审批决定仍被保留，但已登记的操作执行失败；任何重试都需要管理员明确授权。",
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
          <p style={contextStyle}>{messages.intro}</p>
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

const contextStyle: CSSProperties = {
  margin: "10px 0 0",
  color: emailTheme.muted,
  fontFamily: "'Inter Tight', Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  fontSize: "13px",
  lineHeight: "21px",
};
