import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const publicRoutes = [
  "../../routes/$locale/index.tsx",
  "../../routes/$locale/plugins/index.tsx",
  "../../routes/$locale/categories/$slug.tsx",
];

describe("public catalog surfaces", () => {
  it.each(publicRoutes)("keeps %s on discovery instead of installability", (route) => {
    const source = readFileSync(new URL(route, import.meta.url), "utf8");

    expect(source).toContain("loadCatalog");
    expect(source).not.toContain("loadMarketplaceCatalog");
  });

  it("keeps Operations beside Plugins and Docs across public navigation", () => {
    const nav = readFileSync(new URL("../../components/dshx/nav.tsx", import.meta.url), "utf8");
    const footer = readFileSync(
      new URL("../../components/dshx/footer.tsx", import.meta.url),
      "utf8",
    );
    expect(nav.indexOf('to: "/plugins"')).toBeLessThan(nav.indexOf('to: "/operations"'));
    expect(nav.indexOf('to: "/operations"')).toBeLessThan(nav.indexOf('to: "/docs"'));
    expect(footer).toContain('{ key: "nav.operations", to: "/operations" }');
  });

  it("offers an account-free plugin submission dialog on the Plugins page", () => {
    const page = readFileSync(
      new URL("../../routes/$locale/plugins/index.tsx", import.meta.url),
      "utf8",
    );
    const dialog = readFileSync(
      new URL("../../components/community/plugin-submission-dialog.tsx", import.meta.url),
      "utf8",
    );
    expect(page).toContain("PluginSubmissionDialog");
    expect(dialog).toContain('apiRequest("/api/submissions"');
    expect(dialog).toContain('mode="direct"');
    expect(dialog).not.toMatch(/authClient|useSession|account\/submissions/);
    const endpoint = readFileSync(
      new URL("../../routes/api/submissions/index.ts", import.meta.url),
      "utf8",
    );
    expect(endpoint).toContain("getOptionalSession");
    expect(endpoint).toContain("verifyTurnstileToken");
    // The constructor refuses cross-origin writes, so the endpoint cannot
    // forget to; the session stays optional so a visitor can still submit.
    expect(endpoint).toContain("publicRoute(");
    expect(endpoint).not.toContain("sameOrigin");
    expect(endpoint).not.toMatch(/requireSession\s*\(/);
  });

  it("renders daily operations reports as Markdown and includes SEO/sitemap entries", () => {
    const page = readFileSync(
      new URL("../../routes/$locale/operations/index.tsx", import.meta.url),
      "utf8",
    );
    const detail = readFileSync(
      new URL("../../routes/$locale/operations/$reportKey.tsx", import.meta.url),
      "utf8",
    );
    const markdown = readFileSync(
      new URL("../../components/dshx/markdown-report.tsx", import.meta.url),
      "utf8",
    );
    const sitemap = readFileSync(new URL("../sitemap.ts", import.meta.url), "utf8");
    const sitemapRepository = readFileSync(
      new URL("../sitemap.repository.server.ts", import.meta.url),
      "utf8",
    );
    expect(page).toContain("operationReportExcerpt");
    expect(page).toContain('localizedAlternates("/operations")');
    expect(page).toContain('to="/$locale/operations/$reportKey"');
    expect(detail).toContain("loadPublicOperationReportDay");
    expect(detail).toContain("MarkdownReport");
    expect(detail).toContain("PluginCard");
    expect(detail).not.toContain("dangerouslySetInnerHTML");
    expect(markdown).toContain("ReactMarkdown");
    expect(markdown).toContain("remarkGfm");
    expect(markdown).toContain("img: () => null");
    expect(markdown).not.toContain("rehype-raw");
    expect(sitemap).toContain('"/operations"');
    expect(sitemap).toContain('"operation-report"');
    expect(sitemapRepository).toContain("operationReportRows");
  });

  it("renders changelog copy as safe Markdown with inline source links", () => {
    const detail = readFileSync(
      new URL("../../routes/$locale/changelog/$slug.tsx", import.meta.url),
      "utf8",
    );
    const markdown = readFileSync(
      new URL("../../components/dshx/markdown-report.tsx", import.meta.url),
      "utf8",
    );
    expect(detail).toContain("MarkdownText");
    expect(detail).not.toContain("dangerouslySetInnerHTML");
    expect(markdown).toContain("export function MarkdownText");
    expect(markdown).toContain("img: () => null");
    expect(markdown).not.toContain("rehype-raw");
  });

  it("renders the curated overview and the source README as safe Markdown", () => {
    const detail = readFileSync(
      new URL("../../routes/$locale/plugins/$slug.tsx", import.meta.url),
      "utf8",
    );
    const markdown = readFileSync(
      new URL("../../components/dshx/plugin-markdown.tsx", import.meta.url),
      "utf8",
    );
    expect(detail).toContain('section === "readme"');
    expect(detail).toContain("hidden={active !== section}");
    expect(detail).toContain("detail.sourceReadme");
    expect(detail).toContain("detail.overviewMarkdown");
    expect(detail).toContain("plugin.curatedOverview");
    expect(detail).toContain("<PluginMarkdown");
    expect(detail).toContain('timeZone: "UTC"');
    expect(detail).not.toMatch(/dangerouslySetInnerHTML|marked\(/);
    // The source README is untrusted third-party text: Markdown only, never
    // raw HTML, and images restricted to HTTPS.
    expect(markdown).toContain("ReactMarkdown");
    expect(markdown).toContain("remarkGfm");
    expect(markdown).not.toContain("rehype-raw");
    expect(markdown).not.toContain("dangerouslySetInnerHTML");
    expect(markdown).toMatch(/safeImageSource\s*=\s*\/\^https:/u);
  });
});
