import dshxPackage from "../../../../packages/dshx/package.json";
import marketplacePackage from "../../../../packages/plugin-marketplace/package.json";
import { buildPluginInstallCommand } from "./catalog/install-target";

export const DSHX_VERSION = dshxPackage.version;

export const MARKETPLACE_REFERENCE_PLUGIN = {
  packageName: marketplacePackage.name,
  version: marketplacePackage.version,
  installCommand: buildPluginInstallCommand(`${marketplacePackage.name}@preview`),
  sourceUrl: "https://github.com/liyown/dshx/tree/main/packages/plugin-marketplace",
} as const;
