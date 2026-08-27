#!/usr/bin/env node
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { runCli } from "./cli.js";

export { runCli } from "./cli.js";
export {
  canonicalJson,
  observationIdFor,
  operationReportInputSchema,
  parsePluginObservation,
  type OperationReportInput,
  type PluginObservationV1,
} from "./contracts.js";
export {
  discoverSources,
  inspectSource,
  parseSourceTarget,
  type DiscoveredSource,
  type DiscoverSourceOptions,
} from "./source.js";

function isEntryPoint() {
  if (!process.argv[1]) return false;
  try {
    return (
      realpathSync(process.argv[1]) ===
      realpathSync(fileURLToPath(import.meta.url))
    );
  } catch {
    return false;
  }
}

if (isEntryPoint()) process.exitCode = await runCli(process.argv.slice(2));
