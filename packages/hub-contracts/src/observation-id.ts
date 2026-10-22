import { canonicalJson } from "./canonical-json.js";
import type { ObservationIdentity, ObservationSource } from "./contracts.js";

/**
 * The exact text an observation id is the sha-256 of.
 *
 * The producer derives the id and the server re-derives it before accepting a
 * write; any difference in this text is a 422 `observation_id_mismatch` that
 * costs a round trip and tells the operator nothing. So the text is defined
 * once here, and each side hashes it with its platform's primitive: WebCrypto
 * on the Worker, node:crypto in the CLI.
 *
 * The source is reduced to the three fields that identify *this* observation:
 * the URL, the ref it was read at, and the strongest available fingerprint.
 * ETag wins over content hash because an ETag describes the response we asked
 * for, while a content hash describes whatever bytes came back.
 */
export function observationIdInput(
  identity: ObservationIdentity,
  source: ObservationSource,
): string {
  return canonicalJson({
    identity,
    source: {
      url: source.url,
      ref: source.ref ?? null,
      fingerprint: source.etag ?? source.contentHash ?? null,
    },
  });
}
