export { buildClient, buildHost } from './compiler/index.js'
export type { BuildClientOptions, BuildHostOptions, ClientBuildResult, HostBuildResult } from './compiler/index.js'
export {
  resolveCompatibility,
  classifyCompatibility,
  resolveDeclaredCompatibility,
  getCompatibilitySmokeMatrix,
  COMPATIBILITY_ADAPTERS,
  DSH_0_1_COMPATIBILITY,
  RC8_COMPATIBILITY,
  DEFAULT_COMPATIBILITY,
} from './compat/index.js'
export type {
  DshCompatibility,
  DshCompatibilityResolution,
  DshInspectCompatibility,
  DshProfileCompatibility,
  DshSupportStatus,
  DshxRuntimePluginSpec,
} from './compat/index.js'
export type { DshConnectionCompatibility } from './compat/index.js'
export { defineApi, method } from './api/index.js'
export type { ApiContract, ApiMethodDefinition, ApiHostRegistration, ApiErrorKind } from './api/index.js'
export { DshxError } from './diagnostics.js'
export type { DshxDiagnostic, DshxDiagnosticSeverity } from './diagnostics.js'
export { runCli } from './cli/run.js'
export type { CliIO, CliRuntime, CliRunOptions } from './cli/run.js'
export { applyManifestRepairPlan, createManifestRepairPlan, rollbackManifestRepairPlan } from './project/index.js'
export type { ManifestRepairOptions, ManifestRepairPlan } from './project/index.js'
