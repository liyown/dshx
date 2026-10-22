import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { PluginMarkdown } from "./plugin-markdown";

const readme = [
  "# coderag",
  "",
  "Jump to [Install](#install) or read the [docs](https://example.com/docs).",
  "",
  "## Install",
  "",
  "```bash",
  "dsh plugin --profile web add github:VermilionPasvikin/dsh-coderag#main",
  "```",
  "",
  "- [x] indexed",
  "- item with `inline code`",
  "",
  "| target | kind |",
  "| ------ | ---- |",
  "| web    | npm  |",
  "",
  "![screenshot](https://example.com/shot.png)",
  "![local](./docs/local.png)",
  '<img src="https://evil.example/pixel.png" onerror="alert(1)">',
].join("\n");

describe("PluginMarkdown", () => {
  it("renders GitHub-flavoured Markdown with heading anchors", () => {
    const html = renderToStaticMarkup(<PluginMarkdown anchors>{readme}</PluginMarkdown>);
    expect(html).toContain('id="install"');
    expect(html).toContain('href="#install"');
    expect(html).toContain("<table");
    expect(html).toContain('type="checkbox"');
    expect(html).toContain("dsh plugin --profile web add");
  });

  it("opens external links in a new tab", () => {
    const html = renderToStaticMarkup(<PluginMarkdown>{readme}</PluginMarkdown>);
    expect(html).toContain(
      'href="https://example.com/docs" target="_blank" rel="noreferrer noopener"',
    );
  });

  it("drops raw HTML and non-HTTPS images from untrusted READMEs", () => {
    const html = renderToStaticMarkup(<PluginMarkdown>{readme}</PluginMarkdown>);
    expect(html).not.toContain("onerror");
    expect(html).not.toContain("evil.example");
    expect(html).not.toContain("./docs/local.png");
    expect(html).not.toContain("&lt;img");
    expect(html).toContain('src="https://example.com/shot.png"');
    expect(html).toMatch(/referrerpolicy="no-referrer"/iu);
  });

  it("leaves heading ids out when anchors are not requested", () => {
    const html = renderToStaticMarkup(<PluginMarkdown>{readme}</PluginMarkdown>);
    expect(html).not.toContain('id="install"');
  });
});
