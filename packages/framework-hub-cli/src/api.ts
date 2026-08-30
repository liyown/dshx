import { randomUUID } from "node:crypto";

import { readToken } from "./keychain.js";
import {
  isFailureEnvelope,
  isSuccessEnvelope,
  successEnvelope,
  type OperationError,
  type SuccessEnvelope,
} from "./protocol.js";

export type AuthenticationMode = "required" | "optional" | "none";

const hubRequestTimeoutMs = 30_000;

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly issue: OperationError,
    readonly requestId: string,
    readonly body: unknown,
  ) {
    super(issue.message);
    this.name = "ApiError";
  }
}

function requestIdFrom(response: Response, body: unknown): string {
  if (
    body &&
    typeof body === "object" &&
    "meta" in body &&
    (body as { meta?: unknown }).meta &&
    typeof (body as { meta: unknown }).meta === "object"
  ) {
    const value = (body as { meta: { requestId?: unknown } }).meta.requestId;
    if (typeof value === "string" && value) return value;
  }
  return response.headers.get("x-request-id") ?? randomUUID();
}

function issueFrom(status: number, body: unknown): OperationError {
  const raw =
    body && typeof body === "object" && "error" in body
      ? (body as { error?: unknown }).error
      : undefined;
  const error =
    raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const code =
    typeof error["code"] === "string" ? error["code"] : `hub_http_${status}`;
  const retryable =
    typeof error["retryable"] === "boolean"
      ? error["retryable"]
      : status === 429 || status >= 500 || code === "revision_conflict";
  const message =
    typeof error["message"] === "string"
      ? error["message"]
      : `Hub returned HTTP ${status}.`;
  const repairHint =
    typeof error["repairHint"] === "string"
      ? error["repairHint"]
      : status === 401
        ? "Run dshx-hub auth login and retry."
        : status === 409
          ? "Read the latest resource, merge the change, and retry when appropriate."
          : retryable
            ? "Retry after the remote service recovers."
            : "Correct the request before retrying.";
  return {
    code,
    message,
    retryable,
    repairHint,
    ...(typeof error["path"] === "string" ? { path: error["path"] } : {}),
    ...(error["details"] === undefined
      ? {}
      : {
          details: Array.isArray(error["details"])
            ? error["details"]
            : typeof error["details"] === "object" && error["details"] !== null
              ? (error["details"] as Record<string, unknown>)
              : { value: error["details"] },
        }),
  };
}

export async function api<T>(
  hub: string,
  path: string,
  init: RequestInit = {},
  authentication: AuthenticationMode = "required",
): Promise<SuccessEnvelope<T>> {
  const headers = new Headers(init.headers);
  if (init.body && !(init.body instanceof FormData))
    headers.set("content-type", "application/json");
  if (authentication !== "none") {
    const token = readToken(hub);
    if (!token && authentication === "required")
      throw new ApiError(
        401,
        {
          code: "authentication_required",
          message: "No Hub token is available.",
          retryable: false,
          repairHint: "Run dshx-hub auth login and retry.",
        },
        randomUUID(),
        null,
      );
    if (token) headers.set("authorization", `Bearer ${token}`);
  }

  let response: Response;
  try {
    const timeoutSignal = AbortSignal.timeout(hubRequestTimeoutMs);
    response = await fetch(new URL(path, hub), {
      ...init,
      headers,
      signal: init.signal
        ? AbortSignal.any([init.signal, timeoutSignal])
        : timeoutSignal,
    });
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "TimeoutError";
    throw new ApiError(
      0,
      {
        code: timedOut ? "hub_request_timeout" : "hub_unreachable",
        message: timedOut
          ? `Hub request exceeded ${hubRequestTimeoutMs / 1_000} seconds.`
          : error instanceof Error
            ? error.message
            : "Unable to reach the Hub.",
        retryable: true,
        repairHint: timedOut
          ? "Retry once after the Hub recovers; report the slow route if it persists."
          : "Check the Hub URL and network, then retry.",
      },
      randomUUID(),
      null,
    );
  }

  const body =
    response.status === 204
      ? null
      : ((await response.json().catch(() => null)) as unknown);
  const requestId = requestIdFrom(response, body);
  if (!response.ok || isFailureEnvelope(body))
    throw new ApiError(
      response.status,
      issueFrom(response.status, body),
      requestId,
      body,
    );
  if (response.status === 204 && !path.startsWith("/api/ops/v1"))
    return successEnvelope(undefined as T, [], requestId);
  if (isSuccessEnvelope(body)) return body as SuccessEnvelope<T>;
  if (
    body === null ||
    typeof body !== "object" ||
    ("ok" in body && (body as { ok?: unknown }).ok !== undefined) ||
    path.startsWith("/api/ops/v1")
  )
    throw new ApiError(
      response.status,
      {
        code: "invalid_hub_response",
        message: "Hub returned a malformed success response.",
        retryable: true,
        repairHint:
          "Retry after the Hub recovers; report a contract mismatch if it persists.",
      },
      requestId,
      body,
    );
  return successEnvelope(body as T, [], requestId);
}

export async function apiData<T>(
  hub: string,
  path: string,
  init: RequestInit = {},
  authentication: AuthenticationMode = "required",
): Promise<T> {
  return (await api<T>(hub, path, init, authentication)).data;
}
