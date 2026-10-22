import { describe, expect, it } from "vitest";

import {
  assessObservationTargets,
  assessPrimaryTargets,
  assessTargetSpec,
  normalizeGithubFullName,
  parseInstallSpec,
  type InstallTargetInput,
} from "./policy";

const context = {
  packageName: "dsh-crosspost",
  version: "0.2.0",
  repositoryFullName: "buchylx/dsh-crosspost",
};

function target(overrides: Partial<InstallTargetInput> = {}): InstallTargetInput {
  return {
    kind: "github",
    spec: "github:buchylx/dsh-crosspost#main",
    primary: true,
    available: true,
    ...overrides,
  };
}

describe("parseInstallSpec", () => {
  it("parses exact and scoped npm specs", () => {
    expect(parseInstallSpec("dsh-crosspost@0.2.0")).toEqual({
      ok: true,
      parsed: { kind: "npm", name: "dsh-crosspost", version: "0.2.0" },
    });
    expect(parseInstallSpec("@example/plugin@1.0.0")).toEqual({
      ok: true,
      parsed: { kind: "npm", name: "@example/plugin", version: "1.0.0" },
    });
    expect(parseInstallSpec("@example/plugin")).toEqual({
      ok: true,
      parsed: { kind: "npm", name: "@example/plugin", version: null },
    });
  });

  it("parses GitHub specs and normalizes the repository name", () => {
    expect(parseInstallSpec("github:Example/Plugin#main")).toEqual({
      ok: true,
      parsed: { kind: "github", fullName: "example/plugin", ref: "main" },
    });
  });

  it("names the reason a spec is rejected", () => {
    expect(parseInstallSpec("dsh-crosspost@1.0.0 --ignore-scripts")).toEqual({
      ok: false,
      reason: "unsafe-character",
    });
    expect(parseInstallSpec("dsh-crosspost@")).toEqual({ ok: false, reason: "spec-shape" });
    expect(parseInstallSpec("github:buchylx/dsh-crosspost")).toEqual({
      ok: false,
      reason: "spec-shape",
    });
    expect(parseInstallSpec("github:buchylx/dsh-crosspost#a..b")).toEqual({
      ok: false,
      reason: "unsafe-ref",
    });
    expect(parseInstallSpec("github:buchylx/dsh-crosspost#a#b")).toEqual({
      ok: false,
      reason: "unsafe-ref",
    });
    expect(parseInstallSpec("github:buchylx/dsh-crosspost#-x")).toEqual({
      ok: false,
      reason: "unsafe-ref",
    });
    expect(parseInstallSpec("https://github.com/buchylx/dsh-crosspost")).toEqual({
      ok: false,
      reason: "spec-shape",
    });
  });
});

describe("normalizeGithubFullName", () => {
  it("accepts owner/repo and GitHub URLs", () => {
    expect(normalizeGithubFullName("Buchylx/DSH-Crosspost")).toBe("buchylx/dsh-crosspost");
    expect(normalizeGithubFullName("https://github.com/Buchylx/DSH-Crosspost.git")).toBe(
      "buchylx/dsh-crosspost",
    );
  });

  it("rejects non-GitHub hosts and non-repository paths", () => {
    expect(normalizeGithubFullName("https://gitlab.com/buchylx/dsh-crosspost")).toBeNull();
    expect(normalizeGithubFullName("https://github.com/buchylx")).toBeNull();
    expect(normalizeGithubFullName("https://github.com/a/b/tree/main")).toBeNull();
    expect(normalizeGithubFullName(null)).toBeNull();
  });
});

describe("assessTargetSpec", () => {
  it("matches the npm name case-sensitively and ignores the version", () => {
    expect(assessTargetSpec(target({ kind: "npm", spec: "dsh-crosspost@1.0.0" }), context)).toEqual(
      { ok: true, kind: "npm", spec: "dsh-crosspost@1.0.0" },
    );
    expect(
      assessTargetSpec(target({ kind: "npm", spec: "dsh-crosspost@1.0.0" }), {
        packageName: "different",
      }),
    ).toEqual({ ok: false, reason: "package-mismatch" });
  });

  it("compares GitHub repositories without regard to case", () => {
    expect(
      assessTargetSpec(target({ spec: "github:Buchylx/DSH-Crosspost#main" }), context),
    ).toEqual({ ok: true, kind: "github", spec: "github:Buchylx/DSH-Crosspost#main" });
    expect(assessTargetSpec(target({ spec: "github:other/repo#main" }), context)).toEqual({
      ok: false,
      reason: "repository-mismatch",
    });
  });

  it("rejects a spec whose shape contradicts its declared kind", () => {
    expect(assessTargetSpec(target({ kind: "npm" }), context)).toEqual({
      ok: false,
      reason: "kind-mismatch",
    });
    expect(
      assessTargetSpec(target({ kind: "github", spec: "dsh-crosspost@0.2.0" }), context),
    ).toEqual({ ok: false, reason: "kind-mismatch" });
    expect(assessTargetSpec(target({ kind: "pip", spec: "dsh-crosspost" }), context)).toEqual({
      ok: false,
      reason: "unsupported-kind",
    });
  });
});

describe("assessPrimaryTargets", () => {
  it("requires exactly one available primary", () => {
    expect(assessPrimaryTargets([], context)).toEqual({ ok: false, reason: "missing-primary" });
    expect(assessPrimaryTargets([target({ primary: false })], context)).toEqual({
      ok: false,
      reason: "missing-primary",
    });
    expect(
      assessPrimaryTargets(
        [target(), target({ spec: "github:buchylx/dsh-crosspost#dev" })],
        context,
      ),
    ).toEqual({ ok: false, reason: "ambiguous-primary" });
    expect(
      assessPrimaryTargets([target(), target({ primary: false, available: false })], context),
    ).toMatchObject({ ok: true });
  });

  it("requires the npm spec to name the plugin's current version", () => {
    expect(
      assessPrimaryTargets([target({ kind: "npm", spec: "dsh-crosspost@0.2.0" })], context),
    ).toEqual({ ok: true, kind: "npm", spec: "dsh-crosspost@0.2.0", index: 0 });
    expect(
      assessPrimaryTargets([target({ kind: "npm", spec: "dsh-crosspost@0.1.0" })], context),
    ).toEqual({ ok: false, reason: "version-mismatch" });
  });

  it("requires a repository for GitHub targets and a safe ref for every target", () => {
    expect(assessPrimaryTargets([target()], { ...context, repositoryFullName: null })).toEqual({
      ok: false,
      reason: "repository-mismatch",
    });
    expect(
      assessPrimaryTargets([target({ spec: "github:buchylx/dsh-crosspost#a..b" })], context),
    ).toEqual({ ok: false, reason: "unsafe-ref" });
    expect(assessPrimaryTargets([target()], context)).toEqual({
      ok: true,
      kind: "github",
      spec: "github:buchylx/dsh-crosspost#main",
      index: 0,
    });
  });
});

describe("assessObservationTargets", () => {
  it("reports duplicates, a second primary, and unsafe refs by index", () => {
    const issues = assessObservationTargets(
      [target(), target(), target({ spec: "github:other/repo#a..b", primary: false })],
      { repositoryFullName: "buchylx/dsh-crosspost" },
    );
    expect(issues).toContainEqual({ index: 1, reason: "duplicate-target" });
    expect(issues).toContainEqual({ index: -1, reason: "ambiguous-primary" });
    expect(issues).toContainEqual({ index: 2, reason: "unsafe-ref" });
  });

  it("accepts an observation whose targets all match its identity", () => {
    expect(
      assessObservationTargets(
        [target(), target({ spec: "github:buchylx/dsh-crosspost#dev", primary: false })],
        { repositoryFullName: "Buchylx/DSH-Crosspost" },
      ),
    ).toEqual([]);
  });
});
