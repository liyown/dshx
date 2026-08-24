import { ZodError } from "zod";

import { ApiError } from "./api.js";

export type CliIssue = {
  code: string;
  stage: string;
  path: string;
  message: string;
  retryable: boolean;
  repairHint: string;
  details?: unknown;
};

export class CliError extends Error {
  constructor(readonly issue: CliIssue) {
    super(issue.message);
    this.name = "CliError";
  }
}

function apiIssue(error: ApiError): CliIssue {
  const body = error.body as
    | { error?: { code?: string; message?: string; details?: unknown } }
    | undefined;
  const code = body?.error?.code ?? `hub_http_${error.status}`;
  return {
    code,
    stage: "hub",
    path: "",
    message: body?.error?.message ?? error.message,
    retryable: error.status === 429 || error.status >= 500,
    repairHint:
      error.status === 401
        ? "Run dshx-hub auth login and retry."
        : error.status === 409
          ? "Inspect the current Hub state before retrying the same idempotent operation."
          : error.status === 422
            ? "Correct the referenced input fields and run the local check again."
            : "Retry only when the Hub response indicates the failure is transient.",
    ...(body?.error?.details === undefined
      ? {}
      : { details: body.error.details }),
  };
}

export function issuesFrom(error: unknown, stage = "cli"): CliIssue[] {
  if (error instanceof CliError) return [error.issue];
  if (error instanceof ApiError) return [apiIssue(error)];
  if (error instanceof ZodError)
    return error.issues.map((issue) => ({
      code: "invalid_input",
      stage,
      path: issue.path.join("."),
      message: issue.message,
      retryable: false,
      repairHint:
        "Correct this field to match the current contract, then retry.",
    }));
  return [
    {
      code: "operation_failed",
      stage,
      path: "",
      message: error instanceof Error ? error.message : String(error),
      retryable: false,
      repairHint: "Inspect the input and command help before retrying.",
    },
  ];
}
