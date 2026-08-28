import { describe, expect, it } from "vitest";

import dshxPackage from "../../../../packages/dshx/package.json";
import marketplacePackage from "../../../../packages/plugin-marketplace/package.json";
import { DSHX_VERSION, MARKETPLACE_REFERENCE_PLUGIN } from "./reference-plugin";

describe("official reference plugin metadata", () => {
  it("uses the current workspace package names and versions", () => {
    expect(DSHX_VERSION).toBe(dshxPackage.version);
    expect(MARKETPLACE_REFERENCE_PLUGIN).toMatchObject({
      packageName: marketplacePackage.name,
      version: marketplacePackage.version,
      installCommand: `dsh plugin --profile web add ${marketplacePackage.name}@preview`,
    });
    expect(MARKETPLACE_REFERENCE_PLUGIN.sourceUrl).toMatch(/\/packages\/plugin-marketplace$/);
  });
});
