import { randomUUID } from "node:crypto";

import { readToken } from "./keychain.js";
import { verifyOperationGuard } from "./operation-context.js";
import {
  isFailureEnvelope,
  isSuccessEnvelope,
  successEnvelope,
  type OperationError,
  type SuccessEnvelope,
} from "./protocol.js";

export type AuthenticationMode = "required" | "optional" | "none";

const REQUEST_TIMEOUT_MS = 30_000;

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

function requestDetails(
  url: URL,
  response?: Response,
): Record<string, unknown> {
  return {
    requestPath: url.pathname,
    httpStatus: response?.status ?? 0,
    ...(response?.headers.get("cf-ray")
      ? { cfRay: response.headers.get("cf-ray") }
      : {}),
  };
}

function retryAfterDetails(response: Response): Record<string, unknown> {
  const value = response.headers.get("retry-after")?.trim();
  if (response.status !== 429 || !value) return {};
  const seconds = /^\d+$/.test(value)
    ? Number(value)
    : /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun), \d{2} [A-Z][a-z]{2} \d{4} \d{2}:\d{2}:\d{2} GMT$/.test(
          value,
        )
      ? Math.max(0, Math.ceil((Date.parse(value) - Date.now()) / 1_000))
      : NaN;
  // Keep usable backoff advice; never let an untrusted header request an
  // unbounded delay or carry arbitrary response text into diagnostics.
  if (!Number.isSafeInteger(seconds) || seconds < 0 || seconds > 86_400)
    return {};
  return { retryAfter: value, retryAfterSeconds: seconds };
}

function issueFrom(
  response: Response,
  body: unknown,
  url: URL,
): OperationError {
  const status = response.status;
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
      : status === 403
        ? "The request was denied with HTTP 403; the rejecting layer is unknown."
        : `Hub returned HTTP ${status}.`;
  const repairHint =
    typeof error["repairHint"] === "string"
      ? error["repairHint"]
      : status === 401
        ? "Run dshx-hub auth login and retry."
        : status === 403
          ? "Check edge access rules and Hub permissions using the request diagnostics. Do not assume token expiry or repeat login."
          : status === 409
            ? "Read the latest resource, merge the change, and retry when appropriate."
            : retryable
              ? status === 429
                ? "Wait for Retry-After when provided before retrying."
                : "Retry after the remote service recovers."
              : "Correct the request before retrying.";
  const includeDiagnostics =
    typeof error["code"] !== "string" || status === 403 || status === 429;
  const details = Array.isArray(error["details"])
    ? error["details"]
    : typeof error["details"] === "object" && error["details"] !== null
      ? (error["details"] as Record<string, unknown>)
      : error["details"] === undefined
        ? undefined
        : { value: error["details"] };
  const diagnostics = includeDiagnostics
    ? { ...requestDetails(url, response), ...retryAfterDetails(response) }
    : undefined;
  return {
    code,
    message,
    retryable,
    repairHint,
    ...(typeof error["path"] === "string" ? { path: error["path"] } : {}),
    ...(diagnostics
      ? {
          details: {
            ...(Array.isArray(details)
              ? { responseDetails: details }
              : details),
            ...diagnostics,
          },
        }
      : details === undefined
        ? {}
        : { details }),
  };
}

async function withAbort<T>(
  operation: () => Promise<T>,
  signal: AbortSignal,
): Promise<T> {
  signal.throwIfAborted();
  let abort = () => {};
  const aborted = new Promise<never>((_resolve, reject) => {
    abort = () => reject(signal.reason);
    signal.addEventListener("abort", abort, { once: true });
  });
  try {
    return await Promise.race([operation(), aborted]);
  } finally {
    signal.removeEventListener("abort", abort);
  }
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

  const url = new URL(path, hub);
  await verifyOperationGuard(init.method);
  const controller = new AbortController();
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, REQUEST_TIMEOUT_MS);
  timeout.unref();
  const cancel = () => controller.abort(init.signal?.reason);
  if (init.signal?.aborted) cancel();
  else init.signal?.addEventListener("abort", cancel, { once: true });

  let response: Response | undefined;
  let body: unknown;
  try {
    body = await withAbort(async () => {
      response = await fetch(url, {
        ...init,
        headers,
        signal: controller.signal,
      });
      if (
        response.headers.get("cf-mitigated")?.trim().toLowerCase() ===
        "challenge"
      ) {
        void response.body?.cancel().catch(() => undefined);
        throw new ApiError(
          response.status,
          {
            code: "hub_edge_challenge",
            message: "Cloudflare challenged the Hub API request.",
            retryable: false,
            repairHint:
              "Check Cloudflare security events and configure API access for this operating machine. A browser challenge cannot be completed by the CLI; do not repeat auth login.",
            details: requestDetails(url, response),
          },
          requestIdFrom(response, null),
          null,
        );
      }
      if (response.status === 204) return null;
      const text = await response.text();
      try {
        return JSON.parse(text) as unknown;
      } catch {
        return null;
      }
    }, controller.signal);
  } catch (error) {
    const aborted = controller.signal.aborted;
    if (!aborted && error instanceof ApiError) throw error;
    throw new ApiError(
      response?.status ?? 0,
      {
        code: timedOut
          ? "hub_request_timeout"
          : aborted
            ? "hub_request_aborted"
            : "hub_unreachable",
        message: timedOut
          ? "The Hub request did not complete within 30 seconds."
          : aborted
            ? "The Hub request was cancelled."
            : "Unable to complete the Hub request.",
        retryable: timedOut || !aborted,
        repairHint:
          aborted && !timedOut
            ? "Resume only when the caller requests another operation."
            : "Check Hub connectivity. Before resubmitting a write, verify its result or reuse the same idempotency key.",
        details: {
          ...requestDetails(url, response),
          ...(timedOut ? { timeoutMs: REQUEST_TIMEOUT_MS } : {}),
        },
      },
      response ? requestIdFrom(response, null) : randomUUID(),
      null,
    );
  } finally {
    clearTimeout(timeout);
    init.signal?.removeEventListener("abort", cancel);
  }

  // The operation above only resolves after fetch has assigned the response.
  if (!response) throw new Error("Hub response was not received.");
  const requestId = requestIdFrom(response, body);
  if (!response.ok || isFailureEnvelope(body))
    throw new ApiError(
      response.status,
      issueFrom(response, body, url),
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
        details: requestDetails(url, response),
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
