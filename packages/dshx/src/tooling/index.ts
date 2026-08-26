/**
 * Experimental Node-side tooling APIs.
 *
 * These exports are intentionally separate from the browser-safe authoring
 * entries. They may change while the build and compatibility protocol evolves.
 * @experimental
 */
export { buildClient, buildHost, watchClient, watchHost } from '../compiler/index.js'
export type {
  BuildArtifact,
  BuildClientOptions,
  BuildEvent,
  BuildHostOptions,
  BuildReport,
  BuildWatcher,
  ClientBuildResult,
  HostBuildResult,
  ViteExtensionOptions,
} from '../compiler/index.js'
export {
  resolveCompatibility,
  classifyCompatibility,
  resolveDeclaredCompatibility,
  analyzeDeclaredDshRange,
  assessProjectCompatibility,
  declaredDshRange,
  developmentDshSpecifier,
  getCompatibilityCapabilities,
  getCompatibilitySmokeMatrix,
  projectCompatibilityDiagnostics,
  COMPATIBILITY_ADAPTERS,
  DSH_0_1_COMPATIBILITY,
  PROTOCOL_1_COMPATIBILITY,
  RC8_COMPATIBILITY,
  DEFAULT_COMPATIBILITY,
} from '../compat/index.js'
export type {
  DshCompatibility,
  DshCompatibilityLifecycle,
  DshCompatibilityResolution,
  DshConnectionCompatibility,
  DshDeclaredRangeAnalysis,
  DshDeclaredRangeStatus,
  DshInspectCompatibility,
  DshProfileCompatibility,
  DshProjectCompatibilityAssessment,
  DshSupportStatus,
  DshxRuntimePluginSpec,
} from '../compat/index.js'
export { resolveDshxConfig } from '../config/resolve.js'
export type { ResolvedDshxConfig, ResolveDshxConfigOptions } from '../config/types.js'
export { DshxError } from '../diagnostics.js'
export type { DshxDiagnostic, DshxDiagnosticSeverity } from '../diagnostics.js'
export { parseCliArgs, CliUsageError } from '../cli/args.js'
export type { CliAddTarget, CliArgs, CliCommand, CliInspectTarget } from '../cli/args.js'
export { runCli } from '../cli/run.js'
export type { CliIO, CliRunOptions, CliRuntime } from '../cli/run.js'
export { applyManifestRepairPlan, checkPackageTargets, createManifestRepairPlan, rollbackManifestRepairPlan } from '../project/index.js'
export type { ManifestRepairOptions, ManifestRepairPlan } from '../project/index.js'
