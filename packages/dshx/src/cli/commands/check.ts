import type { DshProjectCompatibilityAssessment } from '../../compat/index.js'
import { resolveDshxConfig } from '../../config/resolve.js'
import type { ResolvedDshxConfig } from '../../config/types.js'
import { DshxError } from '../../diagnostics.js'
import type { DshxDiagnostic } from '../../diagnostics.js'
import type { RuntimePluginStatus } from '../../host/runtime-plugins.js'
import { inspectBridgeStatus } from '../../inspect/bridge.js'
import type { InspectBridgeStatus } from '../../inspect/bridge.js'
import { inspectProjectProfile, resolveDshInstallation } from '../../profile/index.js'
import type { ProjectProfileLink, ResolvedDshInstallation } from '../../profile/types.js'
import { applyManifestRepairPlan, checkProjectManifest, createManifestRepairPlan, rollbackManifestRepairPlan } from '../../project/index.js'
import type { ProjectTypecheckResult } from '../../project/index.js'
import { inspectRuntimePlugins } from '../../runtime-status.js'
import type { RuntimePluginReport } from '../../runtime-status.js'
import type { CliArgs } from '../args.js'
import type { CliRunOptions } from '../context.js'
import { compatibilitySummary, installationSummary, projectSummary, renderReport } from '../report.js'
import { defaultIO, diagnosticFromError, hasErrors, paint, printCompatibilitySummary, statusSymbol, write } from '../presentation.js'
import { preflight } from '../preflight.js'
import { VERSION } from '../version.js'

interface CheckResult {
  readonly project: ResolvedDshxConfig
  readonly diagnostics: readonly DshxDiagnostic[]
  readonly staticDiagnostics: readonly DshxDiagnostic[]
  readonly runtimeDiagnostics: readonly DshxDiagnostic[]
  readonly dsh?: ResolvedDshInstallation
  readonly profile?: ProjectProfileLink
  readonly runtimePlugins: RuntimePluginReport
  readonly bridge: InspectBridgeStatus
  readonly connection: ConnectionReport
  readonly compatibility: DshProjectCompatibilityAssessment
  readonly typecheck: ProjectTypecheckResult
  readonly runtime: {
    readonly requested: boolean
    readonly status: 'skipped' | 'passed' | 'failed'
  }
}

interface ConnectionReport {
  readonly provider: 'runtime' | 'unavailable'
  readonly package: string
  readonly hostApi: boolean
  readonly clientApi: boolean
  readonly status: 'available' | 'unavailable'
}

interface CheckFixResult {
  readonly requested: boolean
  readonly dryRun: boolean
  readonly applied: boolean
  readonly changedFiles: readonly string[]
  readonly diff: string
  readonly diagnostics: readonly DshxDiagnostic[]
}

/** The document `--json` reports when `check` fails before it can collect a result. */
export function checkFailureEnvelope(item: DshxDiagnostic): Record<string, unknown> {
  return { project: null, diagnostics: [item], dsh: null, profile: null }
}

function mergeRuntimePluginStatus(report: RuntimePluginReport, bridge: InspectBridgeStatus): RuntimePluginReport {
  const raw = bridge.metadata?.runtimePlugins
  if (!Array.isArray(raw)) return report
  const runtime = new Map<string, RuntimePluginStatus>()
  for (const item of raw) {
    if (typeof item !== 'object' || item === null || Array.isArray(item)) continue
    const value = item as Record<string, unknown>
    if (
      typeof value.id !== 'string' ||
      typeof value.packageName !== 'string' ||
      !Array.isArray(value.provides) ||
      value.provides.some(entry => typeof entry !== 'string') ||
      (value.status !== 'loaded' && value.status !== 'skipped' && value.status !== 'failed')
    )
      continue
    runtime.set(value.id, {
      id: value.id,
      packageName: value.packageName,
      provides: value.provides as string[],
      status: value.status,
      ...(typeof value.message === 'string' ? { message: value.message } : {}),
    })
  }
  if (runtime.size === 0) return report
  return { ...report, plugins: report.plugins.map(plugin => runtime.get(plugin.id) ?? plugin) }
}

function fixSummary(value: CheckFixResult): Record<string, unknown> {
  return {
    requested: value.requested,
    dryRun: value.dryRun,
    applied: value.applied,
    changedFiles: value.changedFiles,
    diff: value.diff,
    diagnostics: value.diagnostics,
  }
}

async function collectCheck(options: CliRunOptions, project: ResolvedDshxConfig, requireRuntime: boolean): Promise<CheckResult> {
  const runtime = options.runtime ?? {}
  const runtimeDiagnostics: DshxDiagnostic[] = []
  let dsh: ResolvedDshInstallation | undefined
  let profile: ProjectProfileLink | undefined
  let runtimePlugins: RuntimePluginReport = { plugins: [], diagnostics: [] }
  let bridge: InspectBridgeStatus = { state: 'disabled', diagnostics: [] }
  if (requireRuntime) {
    try {
      dsh = await (runtime.resolveDsh ?? resolveDshInstallation)(project)
      runtimeDiagnostics.push(...dsh.diagnostics)
      profile = await (runtime.inspectProfile ?? inspectProjectProfile)(project)
      if (profile.state === 'absent')
        runtimeDiagnostics.push({
          code: 'DSHX4305',
          severity: 'error',
          message: `Project ${JSON.stringify(project.packageId)} is not linked in profile ${JSON.stringify(project.profile)}.`,
          file: project.packageFile,
          hint: `Run "dshx dev" or "pnpm exec dsh plugin --profile ${project.profile} add ${project.root}".`,
        })
    } catch (error) {
      runtimeDiagnostics.push(diagnosticFromError(error, project.packageFile))
    }
  }
  const checked = await preflight({ project, runtime, ...(dsh === undefined ? {} : { installedVersion: dsh.version }) })
  const compatibility = checked.compatibility
  const connectionSpec = compatibility.connection
  const connection: ConnectionReport =
    connectionSpec === undefined
      ? { provider: 'unavailable', package: '@deepseek-ai/dsh-client-connection', hostApi: false, clientApi: false, status: 'unavailable' }
      : { provider: 'runtime', package: connectionSpec.packageName, hostApi: connectionSpec.hostRpc, clientApi: connectionSpec.clientRpc, status: 'available' }
  if (requireRuntime) {
    runtimePlugins = await (runtime.inspectRuntimePlugins ?? inspectRuntimePlugins)(project, compatibility)
    bridge = await (runtime.inspectBridgeStatus ?? inspectBridgeStatus)(project)
    runtimePlugins = mergeRuntimePluginStatus(runtimePlugins, bridge)
    runtimeDiagnostics.push(...runtimePlugins.diagnostics, ...bridge.diagnostics)
  }
  const staticDiagnostics = [
    ...checked.manifestDiagnostics,
    ...checked.migrationDiagnostics,
    ...checked.typecheckDiagnostics,
    ...checked.compatibilityDiagnostics,
  ]
  const diagnostics = [...staticDiagnostics, ...runtimeDiagnostics]
  return {
    project,
    diagnostics,
    staticDiagnostics,
    runtimeDiagnostics,
    ...(dsh === undefined ? {} : { dsh }),
    ...(profile === undefined ? {} : { profile }),
    runtimePlugins,
    bridge,
    connection,
    compatibility: checked.assessment,
    typecheck: checked.typecheck,
    runtime: {
      requested: requireRuntime,
      status: requireRuntime ? (hasErrors(runtimeDiagnostics) ? 'failed' : 'passed') : 'skipped',
    },
  }
}

export async function runCheck(args: CliArgs, options: CliRunOptions, project: ResolvedDshxConfig): Promise<number> {
  const io = options.io ?? defaultIO()
  const runtime = options.runtime ?? {}
  let result = await collectCheck(options, project, args.runtime)
  let fix: CheckFixResult = { requested: args.fix, dryRun: args.dryRun, applied: false, changedFiles: [], diff: '', diagnostics: [] }

  if (args.fix) {
    const compatibility = result.compatibility.compatibility
    const plan = await (runtime.createRepairPlan ?? createManifestRepairPlan)(project, { compatibility })
    const fixDiagnostics: DshxDiagnostic[] = [...plan.diagnostics]
    if (plan.diagnostics.some(item => item.severity === 'error')) {
      fixDiagnostics.push({
        code: 'DSHX4144',
        severity: 'error',
        message: 'The manifest repair plan is not safe to apply.',
        file: project.packageFile,
        hint: 'Resolve the repair plan diagnostics manually before retrying --fix.',
      })
    }
    let applied = false
    if (!args.dryRun && plan.files.length > 0 && !plan.diagnostics.some(item => item.severity === 'error')) {
      try {
        await (runtime.applyRepairPlan ?? applyManifestRepairPlan)(plan)
        applied = true
      } catch (error) {
        if (error instanceof DshxError && error.code === 'DSHX4144') fixDiagnostics.push(diagnosticFromError(error, project.packageFile))
        else
          fixDiagnostics.push({
            code: 'DSHX4145',
            severity: 'error',
            message: `Manifest repair could not be written: ${error instanceof Error ? error.message : String(error)}`,
            file: project.packageFile,
            hint: 'Check filesystem permissions and run dshx check --fix again.',
          })
      }
      if (applied) {
        try {
          const refreshed = await (runtime.resolveConfig ?? resolveDshxConfig)({ cwd: project.root })
          const manifestDiagnostics = await (runtime.checkManifest ?? checkProjectManifest)(refreshed, { compatibility })
          if (manifestDiagnostics.some(item => item.severity === 'error')) {
            await (runtime.rollbackRepairPlan ?? rollbackManifestRepairPlan)(plan)
            applied = false
            fixDiagnostics.push({
              code: 'DSHX4146',
              severity: 'error',
              message: 'Manifest validation failed after repair; all changes were rolled back.',
              file: project.packageFile,
              hint: 'Review the reported manifest errors and repair ambiguous fields manually.',
            })
            result = await collectCheck(options, project, args.runtime)
          } else {
            result = await collectCheck(options, refreshed, args.runtime)
          }
        } catch (error) {
          await (runtime.rollbackRepairPlan ?? rollbackManifestRepairPlan)(plan)
          applied = false
          fixDiagnostics.push({
            code: 'DSHX4146',
            severity: 'error',
            message: `Manifest validation could not complete after repair: ${error instanceof Error ? error.message : String(error)}; all changes were rolled back.`,
            file: project.packageFile,
            hint: 'Run dshx check --fix again after resolving the project configuration error.',
          })
          result = await collectCheck(options, project, args.runtime)
        }
      }
    }
    fix = {
      requested: true,
      dryRun: args.dryRun,
      applied,
      changedFiles: plan.changedFiles,
      diff: plan.diff,
      diagnostics: fixDiagnostics,
    }
  }
  const diagnostics = [...result.diagnostics, ...fix.diagnostics]
  const dshxVersion = options.version ?? VERSION
  return renderReport(io, args.json, {
    code: hasErrors(diagnostics) ? 1 : 0,
    diagnostics,
    json: {
      project: projectSummary(result.project),
      diagnostics,
      static: { status: hasErrors([...result.staticDiagnostics, ...fix.diagnostics]) ? 'failed' : 'passed' },
      typecheck: { status: result.typecheck.status, configFile: result.typecheck.configFile },
      runtime: result.runtime,
      compatibility: compatibilitySummary(result.compatibility, dshxVersion),
      dsh: installationSummary(result.dsh),
      profile: result.profile ?? null,
      runtimePlugins: result.runtimePlugins.plugins,
      bridge: { state: result.bridge.state, metadata: result.bridge.metadata ?? null },
      connection: result.connection,
      fix: fixSummary(fix),
    },
    text: () => {
      printCompatibilitySummary(io, result.compatibility, dshxVersion, args.verbose)
      write(
        io.stdout,
        `${statusSymbol(io.stdout, result.typecheck.status === 'passed' ? 'success' : 'failure')} Typecheck: ${paint(io.stdout, result.typecheck.status === 'passed' ? 'green' : 'red', result.typecheck.status)}\n`,
      )
      write(
        io.stdout,
        `${statusSymbol(io.stdout, result.runtime.status === 'passed' ? 'success' : result.runtime.status === 'failed' ? 'failure' : 'pending')} Runtime: ${paint(io.stdout, result.runtime.status === 'passed' ? 'green' : result.runtime.status === 'failed' ? 'red' : 'yellow', result.runtime.status)}${result.runtime.requested ? '' : paint(io.stdout, 'gray', ' (use dshx check --runtime to require it)')}\n`,
      )
      if (args.fix && fix.diff !== '') {
        write(io.stdout, `${fix.applied ? 'Applied' : 'Planned'} manifest repair:\n${fix.diff}`)
      }
      if (!hasErrors(diagnostics))
        write(io.stdout, `${statusSymbol(io.stdout, 'success')} ${paint(io.stdout, ['bold', 'green'], `Check passed for ${result.project.packageId}`)}\n`)
    },
  })
}
