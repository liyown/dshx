import { describe, expect, it } from "vitest";

import {
  DOC_CHAPTERS,
  DOC_SLUGS,
  LEGACY_DOC_HASH_TARGETS,
  getDocsChapter,
  getDocsNavigation,
  isDocsSlug,
} from ".";

describe("documentation registry", () => {
  it("publishes one stable entry for every chapter", () => {
    expect(DOC_SLUGS).toEqual([
      "getting-started",
      "project-model",
      "host-contributions",
      "settings",
      "typed-api",
      "conversation",
      "cli-and-inspect",
      "compatibility",
    ]);
    expect(new Set(DOC_SLUGS).size).toBe(DOC_SLUGS.length);
    expect(DOC_CHAPTERS.map((chapter) => chapter.slug)).toEqual(DOC_SLUGS);
    expect(isDocsSlug("conversation")).toBe(true);
    expect(isDocsSlug("missing")).toBe(false);
  });

  it.each(["en", "zh"] as const)("keeps %s navigation and content complete", (locale) => {
    const navigationSlugs = getDocsNavigation(locale).flatMap((group) =>
      group.items.map((item) => item.slug),
    );
    expect(navigationSlugs).toEqual(DOC_SLUGS);

    for (const slug of DOC_SLUGS) {
      const copy = getDocsChapter(slug).copy[locale];
      const englishSections = getDocsChapter(slug).copy.en.sections.map((section) => section.id);
      expect(copy.navigation).not.toBe("");
      expect(copy.title).not.toBe("");
      expect(copy.description).not.toBe("");
      expect(copy.sections.length).toBeGreaterThan(0);
      expect(new Set(copy.sections.map((section) => section.id)).size).toBe(copy.sections.length);
      expect(copy.sections.map((section) => section.id)).toEqual(englishSections);
    }
  });

  it("maps every legacy single-page anchor to an existing chapter section", () => {
    expect(LEGACY_DOC_HASH_TARGETS.installation).toEqual({
      slug: "getting-started",
      section: "create",
    });
    expect(LEGACY_DOC_HASH_TARGETS["project-structure"]).toEqual({
      slug: "getting-started",
      section: "structure",
    });

    for (const target of Object.values(LEGACY_DOC_HASH_TARGETS)) {
      for (const locale of ["en", "zh"] as const) {
        const sectionIds = getDocsChapter(target.slug).copy[locale].sections.map(
          (section) => section.id,
        );
        expect(sectionIds).toContain(target.section);
      }
    }
  });

  it.each(["en", "zh"] as const)("documents every primary public API in %s", (locale) => {
    const requiredApis = {
      "project-model": ["defineClient", "defineSlot", "useSettings", "useApi", "useQuery"],
      "host-contributions": [
        "defineHost",
        "defineTool",
        "defineCommand",
        "definePromptSection",
        "definePromptContext",
      ],
      settings: ["defineSettings", "useSettings", "SettingsContract", "SettingsReadError"],
      "typed-api": [
        "method",
        "defineApi",
        "useApi",
        "useQuery",
        "ApiError",
        "apiChannel",
        "registerApi",
        "createApiClient",
      ],
      conversation: ["defineConversation", "component", "ConversationComponentContribution"],
      "cli-and-inspect": [
        "defineConfig",
        "resolveDshxConfig",
        "buildHost",
        "buildClient",
        "parseCliArgs",
        "runCli",
        "createManifestRepairPlan",
        "applyManifestRepairPlan",
        "rollbackManifestRepairPlan",
        "DshxError",
      ],
      compatibility: [
        "analyzeDeclaredDshRange",
        "classifyCompatibility",
        "resolveCompatibility",
        "assessProjectCompatibility",
        "projectCompatibilityDiagnostics",
        "getCompatibilityCapabilities",
      ],
    } as const;

    for (const [slug, names] of Object.entries(requiredApis)) {
      const source = JSON.stringify(getDocsChapter(slug as keyof typeof requiredApis).copy[locale]);
      for (const name of names) expect(source, `${slug} should document ${name}`).toContain(name);
    }
  });
});
