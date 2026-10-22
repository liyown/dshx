export type JsonRecord = Record<string, unknown>;

/** Treats arrays and primitives as "no object", so callers never index garbage. */
export function jsonRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : {};
}
