import { describe, expect, it } from "vitest";

import {
  GENERIC_SHORT_DESCRIPTIONS,
  MIN_OVERVIEW_EN,
  MIN_SHORT_DESCRIPTION_EN,
  MIN_SHORT_DESCRIPTION_ZH,
  isWeakCuration,
  weakCurationSql,
} from "./curation-policy";

const identity = {
  slug: "dsh-crosspost",
  name: "DSH Crosspost",
  packageName: "dsh-crosspost",
};

function copy(overrides: { en?: string; zh?: string; overview?: string } = {}) {
  return {
    shortDescription: {
      en: overrides.en ?? "Publish one post to every network from a single DSH command.",
      zh: overrides.zh ?? "用一条 DSH 命令把文章同步到所有平台。",
    },
    overviewMarkdown: { en: overrides.overview ?? "x".repeat(MIN_OVERVIEW_EN) },
  };
}

describe("isWeakCuration", () => {
  it("accepts curated copy that says something specific in both locales", () => {
    expect(isWeakCuration(copy(), identity)).toBe(false);
  });

  it("rejects copy shorter than the locale minimum", () => {
    expect(isWeakCuration(copy({ en: "x".repeat(MIN_SHORT_DESCRIPTION_EN - 1) }), identity)).toBe(
      true,
    );
    expect(isWeakCuration(copy({ zh: "x".repeat(MIN_SHORT_DESCRIPTION_ZH - 1) }), identity)).toBe(
      true,
    );
    expect(isWeakCuration(copy({ overview: "x".repeat(MIN_OVERVIEW_EN - 1) }), identity)).toBe(
      true,
    );
  });

  it("rejects placeholder text", () => {
    expect(isWeakCuration(copy({ en: "A Plugin" }), identity)).toBe(true);
    expect(isWeakCuration(copy({ en: "  TODO  " }), identity)).toBe(true);
    expect(isWeakCuration(copy({ en: "@scope/really-long-package-name" }), identity)).toBe(true);
  });

  it("rejects copy that only repeats the plugin identity, even when long enough", () => {
    const longIdentity = {
      slug: "slug-".repeat(9).trim(),
      name: "name-".repeat(9).trim(),
      packageName: "package-".repeat(6).trim(),
    };
    expect(isWeakCuration(copy({ en: longIdentity.slug }), longIdentity)).toBe(true);
    expect(isWeakCuration(copy({ en: longIdentity.name }), longIdentity)).toBe(true);
    expect(isWeakCuration(copy({ en: longIdentity.packageName }), longIdentity)).toBe(true);
    expect(
      isWeakCuration(
        copy({ en: "no package name here but long enough to pass the length check" }),
        {
          ...longIdentity,
          packageName: null,
        },
      ),
    ).toBe(false);
  });

  it("treats missing values as empty copy", () => {
    expect(isWeakCuration({}, identity)).toBe(true);
  });
});

describe("weakCurationSql", () => {
  it("inlines the same thresholds and phrases the predicate uses", () => {
    expect(weakCurationSql).toContain(`< ${MIN_SHORT_DESCRIPTION_EN}`);
    expect(weakCurationSql).toContain(`< ${MIN_SHORT_DESCRIPTION_ZH}`);
    expect(weakCurationSql).toContain(`< ${MIN_OVERVIEW_EN}`);
    for (const phrase of GENERIC_SHORT_DESCRIPTIONS)
      expect(weakCurationSql).toContain(`'${phrase}'`);
    expect(weakCurationSql).not.toMatch(/\$\{/u);
  });
});
