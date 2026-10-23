import { randomUUID } from "node:crypto";

import type {
  FailureEnvelope,
  OperationEnvelope,
  OperationError,
  OperationWarning,
  SuccessEnvelope,
} from "@becomeopc/dshx-hub-contracts";

// The envelope the CLI reads is the one the Hub writes, so its shape lives in
// the contracts package. These names stay exported here because every command
// module already imports them from the protocol.
export type { FailureEnvelope, OperationEnvelope, OperationError, OperationWarning, SuccessEnvelope };

export function successEnvelope<T>(
  data: T,
  warnings: OperationWarning[] = [],
  requestId: string = randomUUID(),
): SuccessEnvelope<T> {
  return { ok: true, data, warnings, meta: { requestId } };
}

export function failureEnvelope(
  error: OperationError,
  requestId: string = randomUUID(),
): FailureEnvelope {
  return { ok: false, error, meta: { requestId } };
}

export function isSuccessEnvelope(
  value: unknown,
): value is SuccessEnvelope<unknown> {
  if (!value || typeof value !== "object") return false;
  const envelope = value as Record<string, unknown>;
  const meta = envelope["meta"];
  return Boolean(
    envelope["ok"] === true &&
    "data" in envelope &&
    Array.isArray(envelope["warnings"]) &&
    meta &&
    typeof meta === "object" &&
    typeof (meta as Record<string, unknown>)["requestId"] === "string" &&
    (meta as Record<string, unknown>)["requestId"],
  );
}

export function isFailureEnvelope(value: unknown): value is FailureEnvelope {
  if (!value || typeof value !== "object") return false;
  const envelope = value as Record<string, unknown>;
  const error = envelope["error"];
  const meta = envelope["meta"];
  return Boolean(
    envelope["ok"] === false &&
    error &&
    typeof error === "object" &&
    typeof (error as Record<string, unknown>)["code"] === "string" &&
    typeof (error as Record<string, unknown>)["message"] === "string" &&
    typeof (error as Record<string, unknown>)["retryable"] === "boolean" &&
    meta &&
    typeof meta === "object" &&
    typeof (meta as Record<string, unknown>)["requestId"] === "string" &&
    (meta as Record<string, unknown>)["requestId"],
  );
}
