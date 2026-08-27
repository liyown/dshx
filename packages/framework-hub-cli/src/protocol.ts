import { randomUUID } from "node:crypto";

export type OperationError = {
  code: string;
  message: string;
  retryable: boolean;
  repairHint?: string;
  path?: string;
  details?: Record<string, unknown> | unknown[];
};

export type OperationWarning = {
  code: string;
  message: string;
  path?: string;
  details?: Record<string, unknown>;
};

export type SuccessEnvelope<T> = {
  ok: true;
  data: T;
  warnings: OperationWarning[];
  meta: { requestId: string; requestIds?: string[] };
};

export type FailureEnvelope = {
  ok: false;
  error: OperationError;
  meta: { requestId: string };
};

export type OperationEnvelope<T> = SuccessEnvelope<T> | FailureEnvelope;

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
