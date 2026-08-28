import { describe, expect, it } from "vitest";

import { estimateMarkdownTokens, renderAgentDocument } from "./agent-document";
import {
  acceptsMarkdown,
  isMarkdownNegotiablePage,
  withMarkdownVary,
} from "./markdown-negotiation";

describe("Markdown content negotiation", () => {
  it("requires an explicit enabled Markdown range on supported public pages", () => {
    const markdown = new Request("https://dshx.io/en/docs", {
      headers: { accept: "application/json, text/markdown; q=0.8" },
    });
    const disabled = new Request("https://dshx.io/en/docs", {
      headers: { accept: "text/markdown;q=0, text/html" },
    });

    expect(acceptsMarkdown(markdown)).toBe(true);
    expect(acceptsMarkdown(disabled)).toBe(false);
    expect(isMarkdownNegotiablePage(markdown)).toBe(true);
    expect(
      isMarkdownNegotiablePage(
        new Request("https://dshx.io/en/docs", {
          method: "HEAD",
          headers: { accept: "text/markdown" },
        }),
      ),
    ).toBe(true);
    expect(isMarkdownNegotiablePage(new Request("https://dshx.io/en/account"))).toBe(false);
    expect(isMarkdownNegotiablePage(new Request("https://dshx.io/en/users/example"))).toBe(false);
    expect(isMarkdownNegotiablePage(new Request("https://dshx.io/api/health"))).toBe(false);
  });

  it("renders a structured agent document without parsing HTML", () => {
    const markdown = renderAgentDocument({
      title: "DSHX & Agents",
      description: "Clean content",
      canonical: "https://dshx.io/en/docs",
      locale: "en",
      sections: [
        {
          title: "Reference",
          blocks: [
            { kind: "paragraph", text: "Read the [docs](https://dshx.io/en/docs)." },
            { kind: "code", language: "console", code: "pnpm create dshx plugin" },
          ],
        },
      ],
      structuredData: [{ "@type": "TechArticle" }],
    });

    expect(markdown).toContain('title: "DSHX & Agents"');
    expect(markdown).toContain('description: "Clean content"');
    expect(markdown).toContain("# DSHX & Agents");
    expect(markdown).toContain("[docs](https://dshx.io/en/docs)");
    expect(markdown).toContain("```console\npnpm create dshx plugin\n```");
    expect(markdown).toContain('"@type":"TechArticle"');
    expect(estimateMarkdownTokens(markdown)).toBeGreaterThan(0);
  });

  it("adds a separate Accept cache variant without changing the body", async () => {
    const html = "<main><h1>DSHX</h1></main>";
    const response = withMarkdownVary(
      new Response(html, {
        headers: { "content-type": "text/html; charset=utf-8", vary: "Accept-Encoding" },
      }),
    );

    expect(response.headers.get("content-type")).toBe("text/html; charset=utf-8");
    expect(response.headers.get("vary")).toBe("Accept-Encoding, Accept");
    expect(await response.text()).toBe(html);
  });
});
