import dshxPackage from "../../../../packages/dshx/package.json";
import marketplacePackage from "../../../../packages/plugin-marketplace/package.json";

export const DSHX_VERSION = dshxPackage.version;

export const MARKETPLACE_REFERENCE_PLUGIN = {
  packageName: marketplacePackage.name,
  version: marketplacePackage.version,
  installCommand: `dsh plugin --profile <profile> add ${marketplacePackage.name}@preview`,
  sourceUrl: "https://github.com/liyown/dshx/tree/main/packages/plugin-marketplace",
} as const;
