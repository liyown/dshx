import { describe, expect, it } from "vitest";

import { decodeCursor, encodeCursor } from "./cursor";

const pluginListShape = ["timestamp", "text"] as const;
const catalogPageShape = ["timestamp", "timestamp", "text", "page"] as const;

describe("encodeCursor", () => {
  it("writes a URL-safe token that survives a round trip", () => {
    const cursor = encodeCursor([1_727_000_000_000, "plugin-1"]);
    expect(cursor).toMatch(/^[A-Za-z0-9_-]+$/u);
    expect(decodeCursor(cursor, pluginListShape)).toEqual({
      ok: true,
      value: [1_727_000_000_000, "plugin-1"],
    });
  });
});

describe("decodeCursor", () => {
  it("treats an absent cursor as the first page", () => {
    expect(decodeCursor(undefined, pluginListShape)).toEqual({ ok: true, value: null });
    expect(decodeCursor(null, pluginListShape)).toEqual({ ok: true, value: null });
    expect(decodeCursor("", pluginListShape)).toEqual({ ok: true, value: null });
  });

  it("accepts a cursor whose base64 padding was stripped in a URL", () => {
    const cursor = encodeCursor(["2026-10-22"]);
    expect(cursor).not.toContain("=");
    expect(decodeCursor(cursor, ["day"])).toEqual({ ok: true, value: ["2026-10-22"] });
  });

  it("reports a token it cannot decode", () => {
    expect(decodeCursor("not-a-cursor", pluginListShape).ok).toBe(false);
    expect(decodeCursor(btoa(JSON.stringify({ updatedAt: 1 })), pluginListShape).ok).toBe(false);
  });

  it("rejects a cursor whose fields do not match the caller's shape", () => {
    expect(decodeCursor(encodeCursor(["id"]), pluginListShape).ok).toBe(false);
    expect(decodeCursor(encodeCursor([1, 2, "id"]), pluginListShape).ok).toBe(false);
    expect(decodeCursor(encodeCursor([1, 2, "id", 3]), pluginListShape).ok).toBe(false);
    expect(decodeCursor(encodeCursor(["1", "id"]), pluginListShape).ok).toBe(false);
  });

  it("only accepts a page number a list could resume from", () => {
    expect(decodeCursor(encodeCursor([9, 8, "id", 3]), catalogPageShape)).toEqual({
      ok: true,
      value: [9, 8, "id", 3],
    });
    for (const page of [1, 0, -2, 2.5, "3"])
      expect(decodeCursor(encodeCursor([9, 8, "id", page]), catalogPageShape).ok).toBe(false);
  });

  it("only accepts a calendar day where a day is expected", () => {
    for (const day of ["2026-13-01", "2026-1-1", "yesterday", "2026-10-22T00:00:00Z"])
      expect(decodeCursor(encodeCursor([day]), ["day"]).ok).toBe(false);
  });
});
