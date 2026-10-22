import { describe, expect, it } from "vitest";

import { weakCurationSql } from "../../curation-policy";
import type { JsonRecord } from "../../json";
import {
  CURRENT_DSH_VERSION,
  README_RECHECK_MS,
  SOURCE_STALE_MS,
  needsFor,
  needsPrefilterSql,
  pluginStatusFor,
  readmeNeedsRecheck,
  riskSignals,
  sourceStale,
} from "./policy";
import type { SourceSummary } from "../observation/merge";

const DAY = 86_400_000;
const NOW = Date.parse("2026-10-22T12:00:00.000Z");

function iso(offset: number): string {
  return new Date(NOW + offset).toISOString();
}

function source(overrides: Partial<SourceSummary> = {}): SourceSummary {
  return {
    kind: "npm",
    url: "https://registry.npmjs.org/dsh-crosspost",
    availability: "available",
    lastObservedAt: iso(-DAY),
    observationId: "observation-1",
    ...overrides,
  };
}

function facts(overrides: JsonRecord = {}): JsonRecord {
  return {
    package: {
      name: "dsh-crosspost",
      version: "1.2.3",
      repositoryUrl: "https://github.com/example/dsh-crosspost",
    },
    repository: { fullName: "example/dsh-crosspost" },
    publisher: {
      githubId: "42",
      avatarUrl: "https://avatars.example.com/42",
      profileUrl: "https://github.com/example",
    },
    compatibility: { declaredRange: `>=${CURRENT_DSH_VERSION} <0.3.0` },
    readme: { availability: "available", contentHash: "hash-1" },
    installTargets: [{ kind: "npm", spec: "dsh-crosspost", primary: true, available: true }],
    ...overrides,
  };
}

const curated = { sourceReadmeHash: "hash-1" };

function risks(
  value: JsonRecord = facts(),
  overrides: { hasContent?: boolean; now?: number } = {},
) {
  return riskSignals(value, [source()], { hasContent: true, now: NOW, ...overrides });
}

describe("sourceStale", () => {
  it("calls a plugin with no sources stale", () => {
    expect(sourceStale([], NOW)).toBe(true);
  });

  it("stays fresh while one source was observed inside the window", () => {
    const sources = [
      source({ lastObservedAt: iso(-SOURCE_STALE_MS - 1) }),
      source({ url: "https://github.com/example/dsh-crosspost", lastObservedAt: iso(0) }),
    ];
    expect(sourceStale(sources, NOW)).toBe(false);
  });

  it("goes stale once every source is older than the window", () => {
    expect(sourceStale([source({ lastObservedAt: iso(-SOURCE_STALE_MS - 1) })], NOW)).toBe(true);
    expect(sourceStale([source({ lastObservedAt: iso(-SOURCE_STALE_MS) })], NOW)).toBe(false);
  });
});

describe("readmeNeedsRecheck", () => {
  it("trusts an available README", () => {
    expect(readmeNeedsRecheck({ availability: "available" }, [source()], NOW)).toBe(false);
  });

  it("asks again when the README was never observed", () => {
    expect(readmeNeedsRecheck({}, [source()], NOW)).toBe(true);
  });

  it("retries an unavailable README only after the recheck window", () => {
    expect(
      readmeNeedsRecheck(
        { availability: "unavailable" },
        [source({ lastObservedAt: iso(-README_RECHECK_MS) })],
        NOW,
      ),
    ).toBe(false);
    expect(
      readmeNeedsRecheck(
        { availability: "unavailable" },
        [source({ lastObservedAt: iso(-README_RECHECK_MS - 1) })],
        NOW,
      ),
    ).toBe(true);
    expect(readmeNeedsRecheck({ availability: "unavailable" }, [], NOW)).toBe(true);
  });
});

describe("riskSignals", () => {
  it("always records that runtime behaviour was not verified", () => {
    expect(risks()).toEqual(["runtime-not-verified"]);
  });

  it("flags an undeclared compatibility range", () => {
    for (const declaredRange of [undefined, "", "*"])
      expect(risks(facts({ compatibility: { declaredRange } }))).toContain(
        "compatibility-not-declared",
      );
  });

  it("flags a range the current harness does not satisfy", () => {
    expect(risks(facts({ compatibility: { declaredRange: "^0.1.0" } }))).toContain(
      "declared-range-mismatch",
    );
    expect(risks(facts({ compatibility: { declaredRange: "not a range" } }))).toContain(
      "declared-range-mismatch",
    );
  });

  it("flags an archived or disabled repository and a deprecated package", () => {
    expect(
      risks(facts({ repository: { fullName: "example/dsh-crosspost", archived: true } })),
    ).toContain("repository-archived");
    expect(
      risks(facts({ repository: { fullName: "example/dsh-crosspost", disabled: true } })),
    ).toContain("repository-disabled");
    expect(
      risks(facts({ package: { name: "dsh-crosspost", version: "1.2.3", deprecated: true } })),
    ).toContain("package-deprecated");
  });

  it("flags an unavailable install target whether it is a fact or a stored row", () => {
    expect(
      risks(
        facts({
          installTargets: [{ kind: "npm", spec: "dsh-crosspost", primary: true, available: false }],
        }),
      ),
    ).toContain("install-target-unavailable");
    expect(
      riskSignals(facts(), [source()], {
        hasContent: true,
        unavailableTargetCount: 1,
        now: NOW,
      }),
    ).toContain("install-target-unavailable");
  });

  it("flags stale sources and missing content", () => {
    expect(
      riskSignals(facts(), [source({ lastObservedAt: iso(-SOURCE_STALE_MS - 1) })], {
        hasContent: true,
        now: NOW,
      }),
    ).toContain("source-stale");
    expect(risks(facts(), { hasContent: false })).toContain("metadata-incomplete");
  });

  it("flags incomplete metadata and identity conflicts", () => {
    expect(risks(facts({ package: { name: "dsh-crosspost" } }))).toContain("metadata-incomplete");
    expect(
      riskSignals(facts(), [source()], { hasContent: true, identityConflict: true, now: NOW }),
    ).toContain("identity-conflict");
  });

  it("sorts its output so two runs compare equal", () => {
    const value = risks(
      facts({ repository: { fullName: "example/dsh-crosspost", archived: true } }),
      { hasContent: false },
    );
    expect(value).toEqual([...value].sort());
  });
});

describe("needsFor", () => {
  it("asks for nothing when the profile and its copy are complete", () => {
    expect(needsFor(facts(), [source()], curated, risks(), NOW)).toEqual([]);
  });

  it("asks for a refresh when every source is stale", () => {
    const stale = [source({ lastObservedAt: iso(-SOURCE_STALE_MS - 1) })];
    expect(needsFor(facts(), stale, curated, [], NOW)).toContain("refresh");
  });

  it("asks for a README when the public source has not produced one", () => {
    expect(needsFor(facts({ readme: {} }), [source()], curated, [], NOW)).toContain("readme");
    // A README-only source cannot answer for a package registry.
    expect(
      needsFor(facts({ readme: {} }), [source({ kind: "readme" })], curated, [], NOW),
    ).not.toContain("readme");
  });

  it("asks for content when there is no curation, weak copy, or a newer README", () => {
    expect(needsFor(facts(), [source()], null, [], NOW)).toContain("content");
    expect(needsFor(facts(), [source()], { lowQuality: true }, [], NOW)).toContain("content");
    expect(needsFor(facts(), [source()], { sourceReadmeHash: "older" }, [], NOW)).toContain(
      "content",
    );
    // Localized copy without a curation row predates the README on disk.
    expect(needsFor(facts(), [source()], {}, [], NOW)).toContain("content");
  });

  it("asks for a source when every source is unavailable", () => {
    expect(
      needsFor(facts(), [source({ availability: "unavailable" })], curated, [], NOW),
    ).toContain("source");
    expect(needsFor(facts(), [], curated, [], NOW)).toContain("source");
  });

  it("asks for publisher details once the repository is known", () => {
    expect(needsFor(facts({ publisher: {} }), [source()], curated, [], NOW)).toContain("publisher");
    expect(
      needsFor(facts({ repository: {}, publisher: {} }), [source()], curated, [], NOW),
    ).not.toContain("publisher");
  });

  it("asks for metadata when the package facts are incomplete or in conflict", () => {
    expect(needsFor(facts({ package: {} }), [source()], curated, [], NOW)).toContain("metadata");
    expect(needsFor(facts(), [source()], curated, ["identity-conflict"], NOW)).toContain(
      "metadata",
    );
  });

  it("asks for a target unless exactly one available one is primary", () => {
    const targetNeed = (installTargets: unknown[]) =>
      needsFor(facts({ installTargets }), [source()], curated, [], NOW).includes("target");
    expect(targetNeed([])).toBe(true);
    expect(
      targetNeed([
        { kind: "npm", spec: "dsh-crosspost", primary: true, available: true },
        { kind: "npm", spec: "dsh-crosspost@1.0.0", primary: true, available: true },
      ]),
    ).toBe(true);
    expect(
      targetNeed([{ kind: "npm", spec: "dsh-crosspost", primary: true, available: false }]),
    ).toBe(true);
    expect(
      targetNeed([{ kind: "npm", spec: "dsh-crosspost", primary: false, available: true }]),
    ).toBe(true);
    expect(
      targetNeed([
        { kind: "npm", spec: "dsh-crosspost", primary: true, available: true },
        { kind: "npm", spec: "dsh-crosspost@1.0.0", primary: false, available: true },
      ]),
    ).toBe(false);
  });
});

describe("needsPrefilterSql", () => {
  it("filters nothing when no need is requested", () => {
    expect(needsPrefilterSql(undefined, NOW)).toEqual({ condition: "1=1", parameters: [] });
    expect(needsPrefilterSql([], NOW)).toEqual({ condition: "1=1", parameters: [] });
  });

  it("binds one timestamp per time-based need and none for the rest", () => {
    expect(needsPrefilterSql(["refresh", "readme", "content", "target"], NOW).parameters).toEqual([
      new Date(NOW - SOURCE_STALE_MS).toISOString(),
      new Date(NOW - README_RECHECK_MS).toISOString(),
    ]);
  });

  it("has a branch for every need", () => {
    for (const need of [
      "refresh",
      "readme",
      "content",
      "source",
      "publisher",
      "metadata",
      "target",
    ] as const) {
      const { condition } = needsPrefilterSql([need], NOW);
      expect(condition).not.toBe("1=1");
      expect(condition.startsWith("(")).toBe(true);
    }
  });

  it("reads the curation quality rule from its policy module", () => {
    expect(needsPrefilterSql(["content"], NOW).condition).toContain(weakCurationSql);
  });
});

describe("pluginStatusFor", () => {
  it("archives a hidden plugin whatever its operational state", () => {
    expect(pluginStatusFor("published", "hidden", true)).toBe("archived");
    expect(pluginStatusFor("draft", "hidden", false)).toBe("archived");
  });

  it("publishes only a visible plugin the operation state published and the copy supports", () => {
    expect(pluginStatusFor("published", "visible", true)).toBe("published");
    expect(pluginStatusFor("published", "visible", false)).toBe("draft");
    expect(pluginStatusFor("draft", "visible", true)).toBe("draft");
  });
});
