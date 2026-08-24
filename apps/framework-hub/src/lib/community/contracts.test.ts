import { describe, expect, it } from "vitest";
import { sanitizeUserText } from "./contracts";

describe("sanitizeUserText", () => {
  it("reduces HTML to plain user text", () => {
    expect(sanitizeUserText("  Hello <strong>Hub</strong>  ")).toBe("Hello Hub");
  });

  it("does not leave executable content from malformed or nested tags", () => {
    expect(sanitizeUserText("safe<scr<script>ipt>alert(1)</scr</script>ipt>end")).not.toMatch(
      /<\/?script/i,
    );
  });

  it("removes disallowed controls while preserving newlines and tabs", () => {
    expect(sanitizeUserText("line\u0000 one\n\tline two")).toBe("line one\n\tline two");
  });
});
