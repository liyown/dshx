import { describe, expect, it } from "vitest";

import {
  DSHX_DEVELOPMENT_SKILL,
  DSHX_DEVELOPMENT_SKILL_INSTALL,
  DSHX_DEVELOPMENT_SKILL_URL,
  getDshxDeveloperPrompt,
} from "./agent-prompt";

describe("DSHX developer Agent prompt", () => {
  it.each(["en", "zh"] as const)("installs and loads the development skill in %s", (locale) => {
    const prompt = getDshxDeveloperPrompt(locale);
    expect(prompt).toContain(DSHX_DEVELOPMENT_SKILL_INSTALL);
    expect(prompt).toContain(`$${DSHX_DEVELOPMENT_SKILL}`);
    expect(prompt).toContain(DSHX_DEVELOPMENT_SKILL_URL);
    expect(prompt).toContain("pnpm");
    expect(prompt).toContain("pnpm check");
    expect(prompt).toContain("dshx check --runtime");
    expect(prompt).toContain(`https://dshx.io/${locale}/docs`);
  });

  it("keeps publishing outside the copied prompt's authorization", () => {
    const prompt = getDshxDeveloperPrompt("en");
    expect(prompt).toContain("Do not publish, push, or deploy unless I explicitly ask.");
  });
});
