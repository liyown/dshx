import { describe, expect, it } from "vitest";

import {
  buildPluginOverview,
  buildPluginSeoDescription,
  buildPluginSeoTitle,
  improveShortDescription,
  isLowInformationCatalogCopy,
} from "./content-quality";

describe("catalog content quality", () => {
  it("recovers a complete source sentence when a generated description was clipped", () => {
    const recovered = improveShortDescription(
      "Enterprise plugin with billing, audit and a reviewed third-party plu",
      "Example is maintained from its public source. Enterprise plugin with billing, audit and a reviewed third-party plugin marketplace.\n\nDocumented capabilities and behavior include: The public source does not provide a separate feature list; consult the preserved README for exact behavior.",
      "en",
    );
    expect(recovered).toBe(
      "Enterprise plugin with billing, audit and a reviewed third-party plugin marketplace.",
    );
  });

  it("builds concise keyworded SEO metadata", () => {
    expect(buildPluginSeoTitle("dsh-memory", "en")).toBe(
      "dsh-memory – DeepSeek Harness Plugin | DSHX",
    );
    expect(buildPluginSeoDescription("Persistent project memory and search.", "en")).toBe(
      "Persistent project memory and search. A DeepSeek Harness plugin.",
    );
  });

  it("replaces generic overview placeholders with useful install and provenance context", () => {
    const overview = buildPluginOverview({
      description: "Adds searchable project memory to DSH.",
      previousOverview:
        "dsh-memory is maintained from its public source. Adds searchable project memory to DSH.\n\nDocumented capabilities and behavior include: The public source does not provide a separate feature list; consult the preserved README for exact behavior.",
      installCommand: "dsh plugin --profile web add github:example/dsh-memory#main",
      locale: "en",
      hasReadme: true,
    });
    expect(overview).toContain("default web profile");
    expect(overview).toContain("DeepSeek Harness's default web profile");
    expect(overview).toContain("public README");
    expect(overview).not.toContain("does not provide a separate feature list");
  });

  it("rejects name-only Chinese copy that redirects readers to the README", () => {
    expect(
      isLowInformationCatalogCopy(
        "示例插件是面向 DeepSeek Harness 的插件，具体用途以已保存的公开 README 为准。",
      ),
    ).toBe(true);
    expect(
      isLowInformationCatalogCopy(
        "为 DSH Web 增加 Git 面板，可暂存、提交、推送并切换分支。",
      ),
    ).toBe(false);
  });
});
