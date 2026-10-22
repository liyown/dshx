/**
 * The canonical serialization every Hub content hash is computed over.
 *
 * Observation ids, content fingerprints, curation source hashes and the
 * capability manifest all compare strings, so "structurally equal" has to mean
 * "byte equal". Two serializers with the same intent drift on the first change
 * to either, and the failure shows up as an id mismatch between two processes
 * rather than as a failing test — hence one definition, used by the server and
 * the CLI alike.
 */

export type JsonRecord = Record<string, unknown>;

/** Sorts object keys and drops `undefined`, so key order cannot change a hash. */
function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value as JsonRecord)
        .filter(([, entry]) => entry !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, canonicalize(entry)]),
    );
  return value;
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}
