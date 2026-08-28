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
    expect(endpoint).toContain("requireSameOrigin");
    expect(endpoint).not.toMatch(/requireSession\s*\(/);
  });

  it("renders localized operations reports as plain text and includes SEO/sitemap entries", () => {
    const page = readFileSync(
      new URL("../../routes/$locale/operations/index.tsx", import.meta.url),
      "utf8",
    );
    const sitemap = readFileSync(new URL("../sitemap.ts", import.meta.url), "utf8");
    expect(page).toContain("whitespace-pre-wrap");
    expect(page).toContain('localizedAlternates("/operations")');
    expect(page).not.toMatch(/dangerouslySetInnerHTML|ReactMarkdown|marked\(/);
    expect(sitemap).toContain('"/operations"');
  });

  it("separates localized curation from the escaped original README", () => {
    const detail = readFileSync(
      new URL("../../routes/$locale/plugins/$slug.tsx", import.meta.url),
      "utf8",
    );
    expect(detail).toContain('section === "readme"');
    expect(detail).toContain("hidden={active !== section}");
    expect(detail).toContain("detail.sourceReadme");
    expect(detail).toContain("plugin.curatedOverview");
    expect(detail).toContain("<pre");
    expect(detail).toContain('timeZone: "UTC"');
    expect(detail).not.toMatch(/dangerouslySetInnerHTML|ReactMarkdown|marked\(/);
  });
});
