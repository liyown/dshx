export type { JsonRecord } from "@becomeopc/dshx-hub-contracts";

import type { JsonRecord } from "@becomeopc/dshx-hub-contracts";

/** Treats arrays and primitives as "no object", so callers never index garbage. */
export function jsonRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : {};
}
