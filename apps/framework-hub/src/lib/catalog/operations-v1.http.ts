import type { ZodType } from "zod";
import { ZodError } from "zod";

import { HttpError } from "@/lib/http";

export type OperationErrorBody = {
  code: string;
  message: string;
  retryable: boolean;
  repairHint?: string;
  path?: string;
  details?: Record<string, unknown> | unknown[];
};

export class OperationHttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly retryable = false,
    readonly options: {
      repairHint?: string;
      path?: string;
      details?: Record<string, unknown> | unknown[];
    } = {},
  ) {
    super(message);
    this.name = "OperationHttpError";
  }
}

const repairHints: Record<string, string> = {
  unauthorized: "Run auth login and retry the command.",
  invalid_token: "Run auth login to replace the expired or revoked token.",
  insufficient_scope: "Log in again with the catalog:write scope.",
  invalid_json: "Provide a valid JSON document.",
  invalid_body: "Correct the reported input paths and retry.",
  contract_version_unsupported: "Regenerate the input with the current CLI contract.",
  observation_id_mismatch:
    "Regenerate the observation with source inspect instead of editing observationId.",
  observation_identity_conflict: "Inspect the conflicting plugin identities before retrying.",
  plugin_not_found: "Run plugin list to resolve the current plugin id or slug.",
  revision_conflict: "Run plugin get, merge the latest content, and retry.",
  submission_not_found: "Run submission list to resolve the current submission id.",
  submission_resolved: "Run submission get and use its existing resolution.",
  submission_plugin_incomplete:
    "Complete the plugin README, publisher, target, metadata, and bilingual curation needs, then retry.",
  invalid_cursor: "Restart the query without the cursor.",
  rate_limited: "Wait for the upstream limit to reset, then retry.",
  database_unavailable: "Retry after the Hub database becomes available.",
  media_unavailable: "Retry after Hub media storage becomes available.",
};

export function operationRequestId(request: Request): string {
  const supplied = request.headers.get("x-request-id")?.trim();
  if (supplied && /^[A-Za-z0-9._:-]{1,128}$/.test(supplied)) return supplied;
  return request.headers.get("cf-ray")?.trim() || crypto.randomUUID();
}

export async function readOperationJson<T>(request: Request, schema: ZodType<T>): Promise<T> {
  let input: unknown;
  try {
    input = await request.json();
  } catch {
    throw new OperationHttpError(400, "invalid_json", "Expected a JSON request body", false, {
      ...(repairHints["invalid_json"] ? { repairHint: repairHints["invalid_json"] } : {}),
    });
  }
  return parseOperationInput(schema, input);
}

export function parseOperationInput<T>(schema: ZodType<T>, input: unknown): T {
  try {
    return schema.parse(input);
  } catch (error) {
    if (!(error instanceof ZodError)) throw error;
    const record =
      input && typeof input === "object" && !Array.isArray(input)
        ? (input as Record<string, unknown>)
        : null;
    if (
      record?.["schemaVersion"] !== undefined &&
      record["schemaVersion"] !== 1 &&
      error.issues.some((issue) => issue.path.length === 1 && issue.path[0] === "schemaVersion")
    )
      throw new OperationHttpError(
        422,
        "contract_version_unsupported",
        `Unsupported schemaVersion: ${String(record["schemaVersion"])}`,
        false,
        {
          ...(repairHints["contract_version_unsupported"]
            ? { repairHint: repairHints["contract_version_unsupported"] }
            : {}),
          path: "schemaVersion",
          details: { supportedVersions: [1] },
        },
      );
    const issues = error.issues.map((issue) => ({
      path: issue.path.join("."),
      message: issue.message,
    }));
    throw new OperationHttpError(422, "invalid_body", "Request validation failed", false, {
      ...(repairHints["invalid_body"] ? { repairHint: repairHints["invalid_body"] } : {}),
      ...(issues[0]?.path ? { path: issues[0].path } : {}),
      details: issues,
    });
  }
}

export function serializeOperationError(error: unknown): OperationErrorBody {
  if (error instanceof OperationHttpError)
    return {
      code: error.code,
      message: error.message,
      retryable: error.retryable,
      ...(error.options.repairHint ? { repairHint: error.options.repairHint } : {}),
      ...(error.options.path ? { path: error.options.path } : {}),
      ...(error.options.details ? { details: error.options.details } : {}),
    };
  if (error instanceof HttpError) {
    const retryable = error.status === 429 || error.status >= 500;
    const details = Array.isArray(error.details)
      ? error.details
      : error.details && typeof error.details === "object"
        ? (error.details as Record<string, unknown>)
        : undefined;
    const firstPath = Array.isArray(details)
      ? details.find(
          (entry): entry is { path: string } =>
            Boolean(entry) && typeof entry === "object" && typeof entry.path === "string",
        )?.path
      : undefined;
    return {
      code: error.code,
      message: error.message,
      retryable,
      ...(repairHints[error.code] ? { repairHint: repairHints[error.code] } : {}),
      ...(firstPath ? { path: firstPath } : {}),
      ...(details ? { details } : {}),
    };
  }
  if (error instanceof Error && error.name === "DatabaseUnavailableError")
    return {
      code: "database_unavailable",
      message: error.message,
      retryable: true,
      ...(repairHints["database_unavailable"]
        ? { repairHint: repairHints["database_unavailable"] }
        : {}),
    };
  return {
    code: "internal_error",
    message: "Internal server error",
    retryable: true,
    repairHint: "Retry once. If the error persists, inspect Hub service logs with the requestId.",
  };
}

function errorStatus(error: unknown): number {
  if (error instanceof OperationHttpError || error instanceof HttpError) return error.status;
  if (error instanceof Error && error.name === "DatabaseUnavailableError") return 503;
  return 500;
}

export function operationSuccess(
  request: Request,
  data: unknown,
  options: { status?: number; warnings?: unknown[]; requestId?: string } = {},
): Response {
  const requestId = options.requestId ?? operationRequestId(request);
  return Response.json(
    {
      ok: true,
      data,
      warnings: options.warnings ?? [],
      meta: { requestId },
    },
    {
      status: options.status ?? 200,
      headers: { "x-request-id": requestId },
    },
  );
}

export function operationFailure(request: Request, error: unknown, requestId?: string): Response {
  if (!(error instanceof OperationHttpError) && !(error instanceof HttpError)) console.error(error);
  const resolvedRequestId = requestId ?? operationRequestId(request);
  return Response.json(
    {
      ok: false,
      error: serializeOperationError(error),
      meta: { requestId: resolvedRequestId },
    },
    {
      status: errorStatus(error),
      headers: { "x-request-id": resolvedRequestId },
    },
  );
}
