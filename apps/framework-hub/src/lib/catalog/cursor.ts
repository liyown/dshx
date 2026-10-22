/**
 * One pagination cursor format for every list the Hub serves.
 *
 * A cursor is a base64url JSON array. The caller names the fields it expects,
 * and the codec validates them, so no list re-derives `typeof parsed[0] ===
 * "number"` or the base64url dance by hand. What an invalid cursor *means* is
 * the adapter's decision: the public catalog restarts at page one so a shared
 * link still renders, while the operations API rejects it.
 */

export type CursorField = "text" | "timestamp" | "page" | "day";

type FieldValue<Field extends CursorField> = Field extends "timestamp" | "page" ? number : string;

export type CursorValues<Shape extends readonly CursorField[]> = {
  -readonly [Index in keyof Shape]: Shape[Index] extends CursorField
    ? FieldValue<Shape[Index]>
    : never;
};

export type ParsedCursor<Shape extends readonly CursorField[]> =
  { readonly ok: true; readonly value: CursorValues<Shape> | null } | { readonly ok: false };

const fieldAccepts: Record<CursorField, (value: unknown) => boolean> = {
  text: (value) => typeof value === "string",
  timestamp: (value) => typeof value === "number" && Number.isFinite(value),
  page: (value) => typeof value === "number" && Number.isSafeInteger(value) && value >= 2,
  day: (value) =>
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}$/u.test(value) &&
    !Number.isNaN(Date.parse(`${value}T00:00:00Z`)),
};

export function encodeCursor(values: readonly (string | number)[]): string {
  return btoa(JSON.stringify(values)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

export function decodeCursor<const Shape extends readonly CursorField[]>(
  cursor: string | null | undefined,
  shape: Shape,
): ParsedCursor<Shape> {
  if (!cursor) return { ok: true, value: null };
  let parsed: unknown;
  try {
    const normalized = cursor.replaceAll("-", "+").replaceAll("_", "/");
    const padding = "=".repeat((4 - (normalized.length % 4)) % 4);
    parsed = JSON.parse(atob(normalized + padding)) as unknown;
  } catch {
    return { ok: false };
  }
  if (
    !Array.isArray(parsed) ||
    parsed.length !== shape.length ||
    !shape.every((field, index) => fieldAccepts[field](parsed[index]))
  )
    return { ok: false };
  return { ok: true, value: parsed as CursorValues<Shape> };
}
