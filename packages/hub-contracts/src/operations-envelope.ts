import { z } from "zod";

/**
 * The operations envelope.
 *
 * Every `/api/ops/v1` answer is either `{ ok: true, data, warnings, meta }` or
 * `{ ok: false, error, meta }`, and the Hub writes both while the CLI reads
 * both. The payload schemas in `contracts.ts` were already shared; the
 * envelope around them was written twice, so the failure vocabulary — `code`,
 * `retryable`, `repairHint` — could grow on one side and not the other.
 * It is defined here for the same reason the payloads are.
 *
 * The codes themselves stay open strings: the Hub and the CLI each emit a
 * vocabulary of their own, and a closed enum would make adding one a breaking
 * change for the other.
 */

/** Raw JSON: the review `details` may be an object or a list of issues. */
const operationDetailsSchema = z.union([z.record(z.string(), z.unknown()), z.array(z.unknown())]);

export const operationErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
  /** Whether running the same command again can succeed. */
  retryable: z.boolean(),
  /** What the caller should change before retrying, in the Hub's words. */
  repairHint: z.string().optional(),
  /** The input field the failure is about, when it is about one. */
  path: z.string().optional(),
  details: operationDetailsSchema.optional(),
});

export type OperationError = z.infer<typeof operationErrorSchema>;

/**
 * A warning is an error that did not stop the request: the same fields, with
 * `retryable` optional because a caller that already got its answer has
 * nothing to retry. The Hub reports a rejected token this way on `/status`.
 */
export const operationWarningSchema = operationErrorSchema.partial({ retryable: true });

export type OperationWarning = z.infer<typeof operationWarningSchema>;

/** `{ ok: true, data, warnings, meta }`, with the endpoint's own payload schema. */
export function operationSuccessEnvelopeSchema<Data extends z.ZodType>(data: Data) {
  return z.object({
    ok: z.literal(true),
    data,
    warnings: z.array(operationWarningSchema),
    meta: z.object({ requestId: z.string(), requestIds: z.array(z.string()).optional() }),
  });
}

/** `{ ok: false, error, meta }`. */
export const operationFailureEnvelopeSchema = z.object({
  ok: z.literal(false),
  error: operationErrorSchema,
  meta: z.object({ requestId: z.string() }),
});

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
