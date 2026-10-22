import { describe, expect, it } from "vitest";

import {
  selectInstallTarget,
  selectPublicInstallTargets,
  type PublicInstallTarget,
} from "./public";

const githubTarget: PublicInstallTarget = {
  kind: "github",
  spec: "github:buchylx/dsh-crosspost#main",
  package_name: "dsh-crosspost",
  version: "0.2.0",
  status: "active",
  is_primary: 1,
};

describe("selectInstallTarget", () => {
  it("accepts one active GitHub branch target without requiring a release tag", () => {
    expect(
      selectInstallTarget(
        [githubTarget],
        "dsh-crosspost",
        "0.2.0",
        "https://github.com/buchylx/dsh-crosspost",
      ),
    ).toEqual(githubTarget);
  });

  it("accepts an exact npm package and version", () => {
    const npmTarget: PublicInstallTarget = {
      ...githubTarget,
      kind: "npm",
      spec: "dsh-crosspost@0.2.0",
    };
    expect(selectInstallTarget([npmTarget], "dsh-crosspost", "0.2.0", null)).toEqual(npmTarget);
  });

  it("compares the GitHub repository without regard to case", () => {
    expect(
      selectInstallTarget(
        [{ ...githubTarget, spec: "github:Buchylx/DSH-Crosspost#main" }],
        "dsh-crosspost",
        "0.2.0",
        "https://github.com/buchylx/dsh-crosspost",
      ),
    ).not.toBeNull();
  });

  it("rejects ambiguous, mismatched, unavailable, and structurally unsafe targets", () => {
    const repository = "https://github.com/buchylx/dsh-crosspost";
    expect(
      selectInstallTarget(
        [githubTarget, { ...githubTarget }],
        "dsh-crosspost",
        "0.2.0",
        repository,
      ),
    ).toBeNull();
    expect(
      selectInstallTarget(
        [{ ...githubTarget, package_name: "different" }],
        "dsh-crosspost",
        "0.2.0",
        repository,
      ),
    ).toBeNull();
    expect(
      selectInstallTarget(
        [{ ...githubTarget, status: "unavailable" }],
        "dsh-crosspost",
        "0.2.0",
        repository,
      ),
    ).toBeNull();
    expect(
      selectInstallTarget(
        [{ ...githubTarget, spec: "github:buchylx/dsh-crosspost#main;rm" }],
        "dsh-crosspost",
        "0.2.0",
        repository,
      ),
    ).toBeNull();
    expect(
      selectInstallTarget(
        [{ ...githubTarget, spec: "github:buchylx/dsh-crosspost#a..b" }],
        "dsh-crosspost",
        "0.2.0",
        repository,
      ),
    ).toBeNull();
  });
});

describe("selectPublicInstallTargets", () => {
  it("lists active targets the policy accepts and drops the rest", () => {
    const repository = "https://github.com/buchylx/dsh-crosspost";
    const alternative: PublicInstallTarget = {
      ...githubTarget,
      spec: "github:buchylx/dsh-crosspost#dev",
      is_primary: 0,
    };
    expect(
      selectPublicInstallTargets(
        [
          githubTarget,
          alternative,
          { ...alternative, status: "unavailable" },
          { ...alternative, spec: "github:buchylx/dsh-crosspost#main;rm" },
          { ...alternative, spec: "github:other/repo#main" },
        ],
        "dsh-crosspost",
        repository,
      ),
    ).toEqual([githubTarget, alternative]);
  });

  it("keeps npm alternatives for any version of the same package", () => {
    const npmTarget: PublicInstallTarget = {
      ...githubTarget,
      kind: "npm",
      is_primary: 0,
    };
    expect(
      selectPublicInstallTargets(
        [
          { ...npmTarget, spec: "dsh-crosspost@0.2.0" },
          { ...npmTarget, spec: "dsh-crosspost@0.1.0" },
          { ...npmTarget, spec: "other-package@0.2.0" },
        ],
        "dsh-crosspost",
        "https://github.com/buchylx/dsh-crosspost",
      ),
    ).toEqual([
      { ...npmTarget, spec: "dsh-crosspost@0.2.0" },
      { ...npmTarget, spec: "dsh-crosspost@0.1.0" },
    ]);
  });
});
