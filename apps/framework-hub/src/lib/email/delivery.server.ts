import type { CreateEmailOptions, CreateEmailRequestOptions } from "resend";
import { waitUntil } from "cloudflare:workers";
import { Resend } from "resend";

import {
  renderCriticalApprovalEmail,
  type CriticalApprovalEmailProps,
  type CriticalApprovalEmailStatus,
} from "./critical-approval";
import { requireBindings, type AppBindings } from "@/lib/db/context";
import type { Database } from "@/lib/db/client";
import { createDatabase } from "@/lib/db/client";
import { parameterizedSql } from "@/lib/db/parameterized-sql";

export const criticalApprovalNotificationKinds = [
  "approval.approved",
  "approval.rejected",
  "approval.changes_requested",
  "approval.effect_failed",
] as const;

export type CriticalApprovalNotificationKind = (typeof criticalApprovalNotificationKinds)[number];

export type CriticalEmailClient = {
  send(
    payload: CreateEmailOptions,
    options?: CreateEmailRequestOptions,
  ): Promise<{
    data: { id: string } | null;
    error: { name: string; message: string } | null;
  }>;
};

type CriticalEmailRow = {
  notification_id: string;
  kind: CriticalApprovalNotificationKind;
  payload_json: string;
  email: string;
  email_verified: number | boolean;
  preferred_locale: "en" | "zh" | null;
  title: string;
  execution_mode: "server" | "agent";
  effect_status: string;
  last_error: string | null;
};

export type CriticalEmailDeliveryResult =
  | { status: "sent"; notificationId: string; providerId: string }
  | {
      status: "skipped";
      reason:
        "database_unavailable" | "provider_unconfigured" | "event_missing" | "recipient_ineligible";
    };

const defaultFrom = "DSHX Hub <no-reply@mail.dshx.io>";

function statusFromKind(kind: CriticalApprovalNotificationKind): CriticalApprovalEmailStatus {
  if (kind === "approval.effect_failed") return "effect_failed";
  return kind.slice("approval.".length) as CriticalApprovalEmailStatus;
}

function safePayload(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed != null && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function notificationUrl(siteUrl: string | undefined, locale: "en" | "zh") {
  const origin = new URL(siteUrl?.trim() || "https://dshx.io");
  return new URL(`/${locale}/account/notifications`, origin).toString();
}

async function emailRow(
  binding: Database,
  approvalId: string,
  kind: CriticalApprovalNotificationKind,
) {
  return binding.get<CriticalEmailRow>(
    parameterizedSql(
      `select n.id notification_id,n.kind,n.payload_json,
              u.email,u.email_verified,p.preferred_locale,
              v.title,r.execution_mode,r.effect_status,e.last_error
       from notification_events n
       join user u on u.id=n.user_id
       left join user_profiles p on p.user_id=u.id
       join approval_requests r on r.id=n.subject_id
       join approval_request_versions v on v.request_id=r.id and v.version=r.current_version
       left join approval_effects e on e.request_id=r.id
       where n.subject_type='approval' and n.subject_id=? and n.kind=?
       order by n.created_at desc limit 1`,
      [approvalId, kind],
    ),
  );
}

function resendClient(apiKey: string): CriticalEmailClient {
  const resend = new Resend(apiKey);
  return resend.emails;
}

export async function sendCriticalApprovalEmail(
  bindings: AppBindings,
  approvalId: string,
  kind: CriticalApprovalNotificationKind,
  injectedClient?: CriticalEmailClient,
): Promise<CriticalEmailDeliveryResult> {
  if (!bindings.DB) return { status: "skipped", reason: "database_unavailable" };
  if (!injectedClient && !bindings.RESEND_API_KEY)
    return { status: "skipped", reason: "provider_unconfigured" };

  const row = await emailRow(createDatabase(bindings.DB), approvalId, kind);
  if (!row) return { status: "skipped", reason: "event_missing" };
  if (!row.email || !row.email_verified)
    return { status: "skipped", reason: "recipient_ineligible" };

  const locale = row.preferred_locale === "zh" ? "zh" : "en";
  const payload = safePayload(row.payload_json);
  const props: CriticalApprovalEmailProps = {
    locale,
    approvalId,
    title: row.title,
    status: statusFromKind(kind),
    executionMode: row.execution_mode,
    effectStatus: row.effect_status,
    reason: stringValue(payload["reason"]) ?? stringValue(row.last_error),
    actionUrl: notificationUrl(bindings.SITE_URL, locale),
  };
  const rendered = await renderCriticalApprovalEmail(props);
  const client = injectedClient ?? resendClient(bindings.RESEND_API_KEY!);
  const response = await client.send(
    {
      from: bindings.EMAIL_FROM?.trim() || defaultFrom,
      to: row.email,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
      tags: [
        { name: "category", value: "critical-approval" },
        { name: "event", value: kind.replaceAll(".", "-") },
      ],
    },
    { idempotencyKey: `notification/${row.notification_id}` },
  );
  if (response.error) {
    const error = new Error(response.error.message);
    error.name = response.error.name;
    throw error;
  }
  if (!response.data) throw new Error("Resend returned no delivery identifier");
  return {
    status: "sent",
    notificationId: row.notification_id,
    providerId: response.data.id,
  };
}

export function scheduleCriticalApprovalEmail(
  context: unknown,
  approvalId: string,
  kind: CriticalApprovalNotificationKind,
  injectedClient?: CriticalEmailClient,
  schedule: (task: Promise<unknown>) => void = waitUntil,
) {
  const bindings = requireBindings(context);
  const task = sendCriticalApprovalEmail(bindings, approvalId, kind, injectedClient)
    .then(() => undefined)
    .catch((error: unknown) => {
      console.error("critical_email_delivery_failed", {
        approvalId,
        kind,
        errorCode: error instanceof Error ? error.name : "unknown_error",
      });
    });
  schedule(task);
}
