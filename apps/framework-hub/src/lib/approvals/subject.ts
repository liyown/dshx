/**
 * What an approval is *about*: the subject's live state, and the conditions a
 * decision must still find true.
 *
 * Every approval names a subject (`user:…`, `plugin:…`, `maintainer:…`), and
 * an administrator approves a specific reading of it. The reading has one
 * canonical spelling — the same one the catalog hashes with — so "did the
 * subject change since this was reviewed?" is a string comparison rather than
 * a JSON-equality guess.
 *
 * Pure: a row in, a fingerprint or a refusal out.
 */

import { canonicalJson } from "@becomeopc/dshx-hub-contracts";

import { HttpError } from "@/lib/http";

/**
 * The canonical text an approval's source hash is taken over.
 *
 * This is `canonicalJson`, not a local serializer: the catalog, the wire
 * contract and the approval ledger must agree on what "the same row" means,
 * or the same unchanged subject reads as changed on one side only.
 */
export function subjectStateJson(state: Record<string, unknown>): string {
  return canonicalJson(state);
}

/**
 * The preconditions a request carried must still hold against the subject's
 * current state. An unknown key is a malformed request, not a subject that
 * moved: the two get different statuses so an operator can tell them apart.
 */
export function assertSubjectPreconditions(
  state: Record<string, unknown>,
  preconditions: Record<string, unknown>,
): void {
  for (const [key, expected] of Object.entries(preconditions)) {
    if (!Object.prototype.hasOwnProperty.call(state, key))
      throw new HttpError(
        422,
        `Unknown subject precondition: ${key}`,
        "invalid_effect_precondition",
      );
    if (subjectStateJson({ value: state[key] }) !== subjectStateJson({ value: expected }))
      throw new HttpError(
        409,
        `Approval precondition no longer holds: ${key}`,
        "effect_precondition_failed",
      );
  }
}
