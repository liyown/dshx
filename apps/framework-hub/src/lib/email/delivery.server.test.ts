import type { CreateEmailOptions, CreateEmailRequestOptions } from "resend";
import { describe, expect, it, vi } from "vitest";

import {
  scheduleCriticalApprovalEmail,
  sendCriticalApprovalEmail,
  type CriticalEmailClient,
} from "./delivery.server";

type Row = {
  notification_id: string;
  kind: string;
  payload_json: string;
  email: string;
  email_verified: number;
  preferred_locale: "en" | "zh" | null;
  title: string;
  execution_mode: "server" | "agent";
  effect_status: string;
  last_error: string | null;
};

const verifiedRow: Row = {
  notification_id: "notification-1",
  kind: "approval.approved",
  payload_json: JSON.stringify({ reason: "Evidence verified" }),
  email: "maintainer@example.test",
  email_verified: 1,
  preferred_locale: "zh",
  title: "确认插件维护者身份",
  execution_mode: "server",
  effect_status: "succeeded",
  last_error: null,
};

function fakeDatabase(row: Row | null): D1Database {
  return {
    prepare: vi.fn(() => ({
      bind: vi.fn(() => ({
        first: vi.fn(async () => row),
      })),
    })),
  } as unknown as D1Database;
}

function successfulClient() {
  const send = vi.fn(
    async (_payload: CreateEmailOptions, _options?: CreateEmailRequestOptions) => ({
      data: { id: "email-1" },
      error: null,
    }),
  );
  return { client: { send } as CriticalEmailClient, send };
}

describe("critical approval email delivery", () => {
  it("sends a localized multipart email with a notification idempotency key", async () => {
    const { client, send } = successfulClient();
    const result = await sendCriticalApprovalEmail(
      {
        DB: fakeDatabase(verifiedRow),
        EMAIL_FROM: "DSHX Hub <no-reply@mail.dshx.io>",
      },
      "approval-1",
      "approval.approved",
      client,
    );

    expect(result).toEqual({
      status: "sent",
      notificationId: "notification-1",
      providerId: "email-1",
    });
    expect(send).toHaveBeenCalledOnce();
    const [payload, options] = send.mock.calls[0]!;
    expect(payload).toMatchObject({
      from: "DSHX Hub <no-reply@mail.dshx.io>",
      to: "maintainer@example.test",
      subject: "审批通过：确认插件维护者身份",
    });
    expect(payload.html).toContain("https://dshx.io/zh/account/notifications");
    expect(payload.text).toContain("Evidence verified");
    expect(options).toEqual({ idempotencyKey: "notification/notification-1" });
  });

  it("does not send to an unverified recipient", async () => {
    const { client, send } = successfulClient();
    await expect(
      sendCriticalApprovalEmail(
        { DB: fakeDatabase({ ...verifiedRow, email_verified: 0 }) },
        "approval-1",
        "approval.approved",
        client,
      ),
    ).resolves.toEqual({ status: "skipped", reason: "recipient_ineligible" });
    expect(send).not.toHaveBeenCalled();
  });

  it("skips safely when the provider or event is unavailable", async () => {
    await expect(
      sendCriticalApprovalEmail(
        { DB: fakeDatabase(verifiedRow) },
        "approval-1",
        "approval.approved",
      ),
    ).resolves.toEqual({ status: "skipped", reason: "provider_unconfigured" });

    const { client } = successfulClient();
    await expect(
      sendCriticalApprovalEmail(
        { DB: fakeDatabase(null) },
        "approval-1",
        "approval.approved",
        client,
      ),
    ).resolves.toEqual({ status: "skipped", reason: "event_missing" });
  });

  it("registers delivery with waitUntil and contains provider failures", async () => {
    const pending: Promise<unknown>[] = [];
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const client: CriticalEmailClient = {
      send: vi.fn(async () => ({
        data: null,
        error: { name: "rate_limit_exceeded", message: "retry later" },
      })),
    };
    scheduleCriticalApprovalEmail(
      {
        cloudflare: { DB: fakeDatabase(verifiedRow) },
        executionCtx: { waitUntil: (promise: Promise<unknown>) => pending.push(promise) },
      },
      "approval-1",
      "approval.approved",
      client,
    );

    expect(pending).toHaveLength(1);
    await expect(pending[0]).resolves.toBeUndefined();
    expect(error).toHaveBeenCalledWith("critical_email_delivery_failed", {
      approvalId: "approval-1",
      kind: "approval.approved",
      errorCode: "rate_limit_exceeded",
    });
    error.mockRestore();
  });
});
