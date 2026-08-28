import { describe, expect, it } from "vitest";

import { resolveTheme, themeInitializationScript, themeStorageKey } from "./theme";

describe("color theme", () => {
  it("uses an explicit saved theme before the system preference", () => {
    expect(resolveTheme("dark", false)).toBe("dark");
    expect(resolveTheme("light", true)).toBe("light");
  });

  it("follows the system when no valid preference is saved", () => {
    expect(resolveTheme(null, true)).toBe("dark");
    expect(resolveTheme("unknown", false)).toBe("light");
  });

  it("initializes the document theme before hydration", () => {
    expect(themeInitializationScript).toContain(themeStorageKey);
    expect(themeInitializationScript).toContain("prefers-color-scheme: dark");
    expect(themeInitializationScript).toContain('classList.toggle("dark"');
  });
});
