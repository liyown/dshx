import { describe, expect, it } from "vitest";

import { selectInstallTarget, type PublicInstallTarget } from "./install-target";

const githubTarget: PublicInstallTarget = {
  kind: "github",
  spec: "github:buchylx/dsh-crosspost#main",
  package_name: "dsh-crosspost",
  version: "0.2.0",
  status: "active",
  is_primary: 1,
};

describe("selectInstallTarget", () => {
  it("accepts one active server-approved GitHub branch target without requiring a release tag", () => {
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

  it("rejects ambiguous, mismatched, and structurally unsafe targets", () => {
    expect(
      selectInstallTarget(
        [githubTarget, { ...githubTarget }],
        "dsh-crosspost",
        "0.2.0",
        "https://github.com/buchylx/dsh-crosspost",
      ),
    ).toBeNull();
    expect(
      selectInstallTarget(
        [{ ...githubTarget, package_name: "different" }],
        "dsh-crosspost",
        "0.2.0",
        "https://github.com/buchylx/dsh-crosspost",
      ),
    ).toBeNull();
    expect(
      selectInstallTarget(
        [{ ...githubTarget, spec: "github:buchylx/dsh-crosspost#main;rm" }],
        "dsh-crosspost",
        "0.2.0",
        "https://github.com/buchylx/dsh-crosspost",
      ),
    ).toBeNull();
  });
});
