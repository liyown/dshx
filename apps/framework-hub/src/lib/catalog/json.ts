export type JsonRecord = Record<string, unknown>;

/** Treats arrays and primitives as "no object", so callers never index garbage. */
export function jsonRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : {};
}

/**
 * A JSON value with object keys sorted, so two structurally equal documents
 * serialize to the same string. Used for content hashes, audit details, and
 * "did this change?" comparisons, all of which compare strings.
 */
export function canonicalize(value: unknown): unknown {
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

export function stableJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}
