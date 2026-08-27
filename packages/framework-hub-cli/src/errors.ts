import { randomUUID } from "node:crypto";

import { ZodError } from "zod";

import { ApiError } from "./api.js";
import type { OperationError } from "./protocol.js";

export class CliError extends Error {
  constructor(
    readonly issue: OperationError,
    readonly requestId: string = randomUUID(),
  ) {
    super(issue.message);
    this.name = "CliError";
  }
}

export function normalizedError(error: unknown): {
  error: OperationError;
  requestId: string;
} {
  if (error instanceof CliError)
    return { error: error.issue, requestId: error.requestId };
  if (error instanceof ApiError)
    return { error: error.issue, requestId: error.requestId };
  if (error instanceof ZodError) {
    const first = error.issues[0];
    return {
      error: {
        code: "invalid_input",
        message: "Input validation failed.",
        retryable: false,
        repairHint: "Correct the referenced input fields and retry.",
        ...(first?.path.length ? { path: first.path.join(".") } : {}),
        details: error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      },
      requestId: randomUUID(),
    };
  }
  if (error instanceof SyntaxError)
    return {
      error: {
        code: "invalid_json",
        message: "Input is not valid JSON.",
        retryable: false,
        repairHint: "Correct the JSON document and retry.",
      },
      requestId: randomUUID(),
    };
  return {
    error: {
      code: "operation_failed",
      message: error instanceof Error ? error.message : String(error),
      retryable: false,
      repairHint: "Inspect the command input and help before retrying.",
    },
    requestId: randomUUID(),
  };
}
