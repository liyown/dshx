/* React Email templates render outside the Hub browser's Fast Refresh boundary. */
/* eslint-disable react-refresh/only-export-components */

import { render } from "@react-email/render";
import type { CSSProperties } from "react";

import { createTranslator, type Locale, type Translate } from "@/lib/i18n";

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
  locale: Locale;
  approvalId: string;
  title: string;
  status: CriticalApprovalEmailStatus;
  executionMode: "server" | "agent";
  effectStatus: string;
  reason?: string | undefined;
  actionUrl: string;
};

/** The status's key segment; tones are presentation and stay in this module. */
const statusSlugs = {
  approved: "approved",
  rejected: "rejected",
  changes_requested: "changesRequested",
  effect_failed: "effectFailed",
} as const;

type StatusSlug = (typeof statusSlugs)[keyof typeof statusSlugs];

const statusTones: Record<CriticalApprovalEmailStatus, EmailStatusTone> = {
  approved: "success",
  rejected: "danger",
  changes_requested: "warning",
  effect_failed: "danger",
};

const executionSlugs = {
  succeeded: "succeeded",
  awaiting_agent: "awaitingAgent",
  failed: "failed",
} as const;

function executionValue(t: Translate, effectStatus: string): string {
  const slug = executionSlugs[effectStatus as keyof typeof executionSlugs];
  return t(
    slug === undefined
      ? "email.approval.executionValue.other"
      : `email.approval.executionValue.${slug}`,
  );
}

type StatusCopy = {
  slug: StatusSlug;
  subject: string;
  label: string;
  heading: string;
  description: string;
  tone: EmailStatusTone;
};

function statusCopy(t: Translate, props: CriticalApprovalEmailProps): StatusCopy {
  const slug = statusSlugs[props.status];
  const descriptions: Record<CriticalApprovalEmailStatus, string> = {
    approved: t(
      props.executionMode === "agent"
        ? "email.approval.approved.descriptionAgent"
        : "email.approval.approved.descriptionDone",
    ),
    rejected: t("email.approval.rejected.description"),
    changes_requested: t("email.approval.changesRequested.description"),
    effect_failed: t("email.approval.effectFailed.description"),
  };
  return {
    slug,
    subject: t(`email.approval.${slug}.subject`, { title: props.title }),
    label: t(`email.approval.${slug}.label`),
    heading: t(`email.approval.${slug}.heading`),
    description: descriptions[props.status],
    tone: statusTones[props.status],
  };
}

export function CriticalApprovalEmail(props: CriticalApprovalEmailProps) {
  const t = createTranslator(props.locale);
  const status = statusCopy(t, props);
  const execution = executionValue(t, props.effectStatus);

  return (
    <EmailShell lang={props.locale} preheader={t("email.approval.preheader")}>
      <EmailHeader />
      <main>
        <div style={{ padding: "36px 0 0" }}>
          <EmailStatus label={status.label} tone={status.tone} />
          <h1 style={headingStyle}>{status.heading}</h1>
          <p style={introStyle}>{status.description}</p>
        </div>

        <table
          role="presentation"
          width="100%"
          cellPadding="0"
          cellSpacing="0"
          style={{ marginTop: "26px" }}
        >
          <tbody>
            <EmailFactRow label={t("email.approval.request")} value={props.title} />
            <EmailFactRow label={t("email.approval.status")} value={status.label} />
            <EmailFactRow label={t("email.approval.execution")} value={execution} />
          </tbody>
        </table>

        <EmailEvidence
          label={t("email.approval.approvalId")}
          approvalId={props.approvalId}
          reasonLabel={t("email.approval.reason")}
          reason={props.reason}
        />
        <EmailButton href={props.actionUrl}>{t("email.approval.open")}</EmailButton>
      </main>
      <EmailFooter>{t("email.approval.footer")}</EmailFooter>
    </EmailShell>
  );
}

export async function renderCriticalApprovalEmail(props: CriticalApprovalEmailProps) {
  const t = createTranslator(props.locale);
  const status = statusCopy(t, props);
  const execution = executionValue(t, props.effectStatus);
  const element = <CriticalApprovalEmail {...props} />;
  const text = [
    t("email.approval.preheader"),
    status.heading,
    status.description,
    `${t("email.approval.request")}: ${props.title}`,
    `${t("email.approval.status")}: ${status.label}`,
    `${t("email.approval.execution")}: ${execution}`,
    `${t("email.approval.approvalId")}: ${props.approvalId}`,
    ...(props.reason ? [`${t("email.approval.reason")}: ${props.reason}`] : []),
    `${t("email.approval.open")}: ${props.actionUrl}`,
    t("email.approval.footer"),
  ].join("\n\n");
  return {
    subject: status.subject,
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
