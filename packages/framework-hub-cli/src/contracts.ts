import { createHash } from "node:crypto";

import { z } from "zod";
import {
  observationIdInput,
  operationMediaMetadataSchema,
  opsPluginListQuerySchema,
  pluginObservationPayloadSchema,
  submissionListQuerySchema,
  type ObservationIdentity,
  type ObservationSource,
  type PluginObservationV1,
} from "@becomeopc/dshx-hub-contracts";

import { CliError } from "./errors.js";

/**
 * The CLI's view of the Hub operations contract.
 *
 * Every payload and query shape lives in `@becomeopc/dshx-hub-contracts`,
 * which the Hub validates against, so the producer cannot disagree with the
 * validator. What stays here is the part that is genuinely the CLI's: the hash
 * primitive its runtime provides, the id it derives before uploading, and the
 * local input encodings — a file path where the wire wants a content hash,
 * flags where the wire wants a query string.
 */

export {
  canonicalJson,
  operationReportInputSchema,
  pluginCurationContentSchema,
  pluginObservationPayloadSchema,
  pluginVisibilityRequestSchema,
  submissionResolutionSchema,
  type ObservationIdentity,
  type ObservationSource,
  type OperationReportInput,
  type PluginObservationV1,
} from "@becomeopc/dshx-hub-contracts";

/** The contract owns what the id is made of; the runtime owns the hash. */
export function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

export function observationIdFor(
  identity: ObservationIdentity,
  source: ObservationSource,
): string {
  return sha256(observationIdInput(identity, source));
}

/**
 * Parses a producer's document into a stored-form observation.
 *
 * An id may be supplied, must not be wrong, and is replaced by the derived one
 * either way: the derived value is the only one the Hub will accept.
 */
export function parsePluginObservation(raw: unknown): PluginObservationV1 {
  const parsed = pluginObservationPayloadSchema.parse(raw);
  const generated = observationIdFor(parsed.identity, parsed.source);
  if (parsed.observationId && parsed.observationId !== generated)
    throw new CliError({
      code: "observation_id_mismatch",
      message:
        "observationId does not match the canonical identity and source fingerprint.",
      retryable: false,
      repairHint:
        "Remove observationId and let the CLI regenerate it from identity and source.",
      path: "observationId",
      details: { expected: generated, received: parsed.observationId },
    });
  return { ...parsed, observationId: generated };
}

/**
 * `media upload` input: the wire metadata minus the fields the CLI computes
 * from the file it was handed, plus the local path it reads that file from.
 */
const mediaMetadata = operationMediaMetadataSchema;
export const mediaInputSchema = mediaMetadata
  .omit({ schemaVersion: true, observedAt: true, sourceSha256: true })
  .extend({
    localPath: z.string().trim().min(1),
    observedAt: mediaMetadata.shape.observedAt.optional(),
    sourceSha256: mediaMetadata.shape.sourceSha256.optional(),
  });

/** Query filters, plus the CLI-only "walk every page" switch. */
export const pluginListOptionsSchema = opsPluginListQuerySchema.extend({
  all: z.boolean().optional(),
});

export const submissionListOptionsSchema = submissionListQuerySchema.extend({
  all: z.boolean().optional(),
});
