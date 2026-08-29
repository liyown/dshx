import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { HomeSocialCard, PluginSocialCard, SOCIAL_CARD_TOKENS } from "./social-card";
import { socialCardPattern, truncateSocialText } from "./social-card-data";

describe("social card templates", () => {
  it("uses a stable, slug-specific technical pattern", () => {
    expect(socialCardPattern("smelt-ai-dsh-acp-rich")).toEqual(
      socialCardPattern("smelt-ai-dsh-acp-rich"),
    );
    expect(socialCardPattern("smelt-ai-dsh-acp-rich")).not.toEqual(
      socialCardPattern("another-plugin"),
    );
  });

  it("truncates copy without leaving trailing punctuation", () => {
    expect(truncateSocialText("A useful plugin, with detailed behavior.", 24)).toBe(
      "A useful plugin, with…",
    );
    expect(truncateSocialText("简洁但有信息量的中文插件描述。", 12)).toBe(
      "简洁但有信息量的中文插…",
    );
  });

  it("renders the homepage card from the shared brand palette", () => {
    const html = renderToStaticMarkup(
      <HomeSocialCard
        locale="en"
        title="Build DSH plugins with React and Vite."
        description="Typed build tooling for the official DeepSeek Harness runtime."
        version="0.1.2"
      />,
    );
    expect(html).toContain("FRAMEWORK / HUB");
    expect(html).toContain("pnpm create dshx my-plugin");
    expect(html).toContain(SOCIAL_CARD_TOKENS.background);
    expect(html).toContain(SOCIAL_CARD_TOKENS.accent);
  });

  it("renders real plugin identity and the exact web-profile install command", () => {
    const html = renderToStaticMarkup(
      <PluginSocialCard
        locale="zh"
        slug="smelt-ai-dsh-acp-rich"
        name="DSH ACP Rich"
        packageName="@smelt-ai/dsh-acp-rich"
        description="为 DeepSeek Harness 提供富 ACP 协议交互、工具调用与会话展示能力。"
        author="smelt-ai"
        version="0.1.8"
        category="Agent"
        installCommand="dsh plugin --profile web add @smelt-ai/dsh-acp-rich@0.1.8"
        badge="community"
      />,
    );
    expect(html).toContain("DSH ACP Rich");
    expect(html).toContain("@smelt-ai/dsh-acp-rich");
    expect(html).toContain("dsh plugin --profile web add @smelt-ai/dsh-acp-rich@0.1.8");
    expect(html).toContain("PROFILE / WEB");
  });
});
