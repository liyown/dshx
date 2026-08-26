import type { Readable, Writable } from 'node:stream'
import { createRequire } from 'node:module'
import { resolve as resolvePath } from 'node:path'
import { isCancel, select, text } from '@clack/prompts'
import { buildClient, buildHost } from '../compiler/index.js'
import { resolveDshxConfig } from '../config/resolve.js'
import { startDevSession } from '../dev/index.js'
import type { DevEvent, DevSession } from '../dev/index.js'
import { DshxError } from '../diagnostics.js'
import { ensureProjectProfile, inspectProjectProfile, resolveDshInstallation } from '../profile/index.js'
import type { PreparedProjectProfile, ProjectProfileLink, ResolvedDshInstallation } from '../profile/types.js'
import {
  applyManifestRepairPlan,
  checkMigrationDiagnostics,
  checkPackageTargets,
  checkProjectManifest,
  createManifestRepairPlan,
  rollbackManifestRepairPlan,
  typecheckProject,
} from '../project/index.js'
import type { ProjectTypecheckResult } from '../project/index.js'
import type { ResolvedDshxConfig } from '../config/types.js'
import { inspectProjectComposition } from '../inspect/index.js'
import type { InspectResult, InspectTarget } from '../inspect/index.js'
import { inspectBridgeStatus } from '../inspect/bridge.js'
import type { InspectBridgeStatus } from '../inspect/bridge.js'
import { inspectRuntimePlugins } from '../runtime-status.js'
import type { RuntimePluginReport } from '../runtime-status.js'
import { createCommandScaffold, createHookScaffold, createToolScaffold, createUiScaffold } from '../scaffold/index.js'
import type {
  AddCommandOptions,
  AddCommandResult,
  AddHookOptions,
  AddHookResult,
  AddToolOptions,
  AddToolResult,
  AddUiOptions,
  AddUiResult,
} from '../scaffold/index.js'
import { assessProjectCompatibility, detectInstalledDshVersion, projectCompatibilityDiagnostics } from '../compat/index.js'
import type { DshProjectCompatibilityAssessment } from '../compat/index.js'
import { CliUsageError, parseCliArgs, type CliArgs } from './args.js'
import type { DshxDiagnostic } from '../diagnostics.js'
import type { RuntimePluginStatus } from '../host/runtime-plugins.js'

export interface CliIO {
  readonly stdin: Readable & { isTTY?: boolean; setRawMode?: (mode: boolean) => void }
  readonly stdout: Writable
  readonly stderr: Writable
}

export interface CliRuntime {
  readonly resolveConfig?: typeof resolveDshxConfig
  readonly checkManifest?: typeof checkProjectManifest
  readonly checkMigrations?: typeof checkMigrationDiagnostics
  readonly checkPackageTargets?: typeof checkPackageTargets
  readonly typecheckProject?: typeof typecheckProject
  readonly resolveDsh?: typeof resolveDshInstallation
  readonly inspectProfile?: typeof inspectProjectProfile
  readonly ensureProfile?: typeof ensureProjectProfile
  readonly buildHost?: typeof buildHost
  readonly buildClient?: typeof buildClient
  readonly startDev?: typeof startDevSession
  readonly inspectComposition?: typeof inspectProjectComposition
  readonly inspectRuntimePlugins?: typeof inspectRuntimePlugins
  readonly inspectBridgeStatus?: typeof inspectBridgeStatus
  readonly createRepairPlan?: typeof createManifestRepairPlan
  readonly applyRepairPlan?: typeof applyManifestRepairPlan
  readonly rollbackRepairPlan?: typeof rollbackManifestRepairPlan
  readonly addUi?: (options: AddUiOptions) => Promise<AddUiResult>
  readonly addTool?: (options: AddToolOptions) => Promise<AddToolResult>
  readonly addCommand?: (options: AddCommandOptions) => Promise<AddCommandResult>
  readonly addHook?: (options: AddHookOptions) => Promise<AddHookResult>
}

export interface CliRunOptions {
  readonly io?: CliIO
  readonly runtime?: CliRuntime
  readonly cwd?: string
  readonly version?: string
}

const require = createRequire(import.meta.url)

function packageVersion(): string {
  try {
    const manifest = require('../../package.json') as { version?: unknown }
    if (typeof manifest.version === 'string' && manifest.version !== '') return manifest.version
  } catch {
    /* source-only environments may not have package metadata */
  }
  return '0.0.0'
}

const VERSION = packageVersion()

function defaultIO(): CliIO {
  return { stdin: process.stdin, stdout: process.stdout, stderr: process.stderr }
}

function write(stream: Writable, text: string): void {
  stream.write(text)
}

function diagnosticFromError(error: unknown, fallbackFile = ''): DshxDiagnostic {
  if (error instanceof DshxError) {
    return {
      code: error.code,
      severity: 'error',
      message: error.message.replace(/^DSHX\d+\n\n/, ''),
      file: error.file ?? fallbackFile,
      hint: error.hint ?? 'Fix the reported problem and run DSHX again.',
    }
  }
  return {
    code: 'DSHX0001',
    severity: 'error',
    message: error instanceof Error ? error.message : String(error),
    file: fallbackFile,
    hint: 'Run with --verbose to inspect the original error.',
  }
}

function printDiagnostic(io: CliIO, item: DshxDiagnostic): void {
  const location = item.file === '' ? '' : `\n  file: ${item.file}`
  write(io.stderr, `${item.code} [${item.severity}] ${item.message}${location}\n  hint: ${item.hint}\n`)
}

function printVerboseCause(io: CliIO, error: unknown): void {
  if (!(error instanceof Error) || error.cause === undefined) return
  const cause = error.cause
  if (cause !== null && typeof cause === 'object') {
    const record = cause as Record<string, unknown>
    if (typeof record.stderr === 'string' && record.stderr.trim() !== '') {
      write(io.stderr, `stderr:\n${record.stderr.trim()}\n`)
    }
    if (typeof record.stdout === 'string' && record.stdout.trim() !== '') {
      write(io.stderr, `stdout:\n${record.stdout.trim()}\n`)
    }
    if (typeof record.shortMessage === 'string' && record.shortMessage.trim() !== '') {
      write(io.stderr, `cause: ${record.shortMessage.trim()}\n`)
      return
    }
  }
  write(io.stderr, `cause: ${cause instanceof Error ? (cause.stack ?? cause.message) : String(cause)}\n`)
}

function hasErrors(items: readonly DshxDiagnostic[]): boolean {
  return items.some(item => item.severity === 'error')
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

function projectSummary(project: ResolvedDshxConfig): Record<string, unknown> {
  return {
    root: project.root,
    packageId: project.packageId,
    name: project.name,
    profile: project.profile,
    hostEntry: project.hostEntry,
    clientEntry: project.clientEntry,
    outDir: project.outDir,
  }
}

function installationSummary(dsh: ResolvedDshInstallation | undefined): Record<string, unknown> | null {
  if (dsh === undefined) return null
  return {
    version: dsh.version,
    executable: dsh.executable ?? null,
    support: dsh.support,
    adapterId: dsh.adapterId,
    protocolGeneration: dsh.protocolGeneration,
    supportedRange: dsh.supportedRange,
    compatibility: dsh.compatibility,
    diagnostics: dsh.diagnostics,
  }
}

function compatibilitySummary(assessment: DshProjectCompatibilityAssessment, dshxVersion: string): Record<string, unknown> {
  const support = assessment.installedVersion === undefined ? null : (assessment.resolution?.support ?? 'unsupported')
  return {
    dshxVersion,
    declaredRange: assessment.declaredRange ?? null,
    developmentSpecifier: assessment.developmentSpecifier ?? null,
    installedVersion: assessment.installedVersion ?? null,
    installedWithinDeclaredRange: assessment.installedWithinDeclaredRange ?? null,
    rangeStatus: assessment.rangeAnalysis?.status ?? 'missing',
    support,
    adapterId: assessment.compatibility.id,
    protocolGeneration: assessment.compatibility.protocolGeneration,
    lifecycle: assessment.compatibility.lifecycle,
    supportedRange: assessment.compatibility.dshRange,
    capabilities: assessment.capabilities,
  }
}

function printCompatibilitySummary(io: CliIO, assessment: DshProjectCompatibilityAssessment, dshxVersion: string): void {
  const status = assessment.installedVersion === undefined ? 'not detected' : (assessment.resolution?.support ?? 'unsupported')
  write(io.stdout, 'DSH compatibility\n')
  write(io.stdout, `  DSHX: ${dshxVersion}\n`)
  write(io.stdout, `  Plugin peer range: ${assessment.declaredRange ?? 'not declared'}\n`)
  write(io.stdout, `  Installed DSH: ${assessment.installedVersion ?? 'not detected'}${assessment.installedVersion === undefined ? '' : ` (${status})`}\n`)
  write(io.stdout, `  Adapter: ${assessment.compatibility.id} / ${assessment.compatibility.protocolGeneration} (${assessment.compatibility.lifecycle})\n`)
  write(io.stdout, `  Capabilities: ${assessment.capabilities.join(', ')}\n`)
}

async function runBuild(args: CliArgs, options: CliRunOptions, project: ResolvedDshxConfig): Promise<number> {
  const io = options.io ?? defaultIO()
  const runtime = options.runtime ?? {}
  const installed = detectInstalledDshVersion(project.packageFile)
  const assessment = assessProjectCompatibility(project.manifest, installed)
  const installedResolution = assessment.resolution
  const compatibility = assessment.compatibility
  const versionDiagnostics: DshxDiagnostic[] = [...projectCompatibilityDiagnostics(assessment, project.packageFile, project.compatibility)]
  if (installed === undefined) {
    versionDiagnostics.push({
      code: 'DSHX5101',
      severity: 'warning',
      message: 'No project-local @deepseek-ai/dsh package was found; build is using the declared/default compatibility adapter.',
      file: project.packageFile,
      hint: 'Install @deepseek-ai/dsh in devDependencies to make the build protocol deterministic.',
    })
  } else if (installedResolution === undefined) {
    const severity = project.compatibility.allowUnsupported ? 'warning' : 'error'
    versionDiagnostics.push({
      code: 'DSHX5101',
      severity,
      message: `Installed DSH ${installed} is outside the supported compatibility ranges.`,
      file: project.packageFile,
      hint: project.compatibility.allowUnsupported
        ? `The ${compatibility.id} adapter will be used at your own risk.`
        : 'Install a DSH version supported by this DSHX release or set compatibility.allowUnsupported to true for a temporary override.',
    })
  } else if (installedResolution.support === 'compatible' || installedResolution.support === 'experimental') {
    versionDiagnostics.push({
      code: 'DSHX5101',
      severity: 'warning',
      message:
        installedResolution.support === 'experimental'
          ? `Installed DSH ${installed} is an unverified prerelease in the ${compatibility.protocolGeneration} compatibility generation.`
          : `Installed DSH ${installed} is in the ${compatibility.protocolGeneration} compatibility generation but has not been verified by DSHX.`,
      file: project.packageFile,
      hint: `Verified boundaries are ${compatibility.verified.minimum} and ${compatibility.verified.latest}.`,
    })
  }
  const typecheck = await (runtime.typecheckProject ?? typecheckProject)(project.root)
  const diagnostics = [
    ...versionDiagnostics,
    ...(await (runtime.checkManifest ?? checkProjectManifest)(project, { compatibility })),
    ...(await (runtime.checkMigrations ?? checkMigrationDiagnostics)(project)),
    ...typecheck.diagnostics,
  ]
  for (const item of diagnostics) printDiagnostic(io, item)
  if (hasErrors(diagnostics)) return 1
  const jobs: Array<{ readonly fallback: string; readonly task: Promise<unknown> }> = []
  // DSH loads every linked package through its root export, including an
  // explicit Client-only package. The compiler's undefined entry is a
  // deliberate no-op Host module that satisfies that loader contract without
  // enabling the Host face in DSHX config or scaffold commands.
  jobs.push({
    fallback: resolvePath(project.outDir, 'index.js'),
    task: (runtime.buildHost ?? buildHost)({
      packageId: project.packageId,
      logicalName: project.name,
      root: project.root,
      ...(project.hostEntry === undefined ? {} : { entry: project.hostEntry }),
      outDir: project.outDir,
      sourcemap: project.build.sourcemap,
      declarations: project.build.declarations ?? true,
      ...(project.hostVitePlugins === undefined ? {} : { vite: { plugins: project.hostVitePlugins } }),
      compatibility,
    }),
  })
  if (project.clientEntry !== undefined) {
    const dsh = project.manifest.dsh
    const client =
      typeof dsh === 'object' && dsh !== null && !Array.isArray(dsh) && typeof (dsh as Record<string, unknown>).client === 'object'
        ? ((dsh as Record<string, unknown>).client as Record<string, unknown>)
        : undefined
    const external = Array.isArray(client?.external) && client.external.every(value => typeof value === 'string') ? (client.external as string[]) : []
    const inject = Array.isArray(client?.inject) && client.inject.every(value => typeof value === 'string') ? (client.inject as string[]) : []
    jobs.push({
      fallback: resolvePath(project.outDir, 'client.js'),
      task: (runtime.buildClient ?? buildClient)({
        packageId: project.packageId,
        logicalName: project.name,
        root: project.root,
        entry: project.clientEntry,
        outDir: project.outDir,
        sourcemap: project.build.sourcemap,
        declarations: project.build.declarations ?? true,
        ...(project.clientVitePlugins === undefined ? {} : { vite: { plugins: project.clientVitePlugins } }),
        external,
        inject,
        compatibility,
      }),
    })
  }
  const results = await Promise.allSettled(jobs.map(job => job.task))
  let failed = false
  const artifacts: string[] = []
  results.forEach((result, index) => {
    if (result.status === 'rejected') {
      failed = true
      const item = diagnosticFromError(result.reason, project.packageFile)
      printDiagnostic(io, item)
      if (args.verbose) printVerboseCause(io, result.reason)
      return
    }
    const fallback = jobs[index]?.fallback
    const output = result.value as { readonly output?: readonly { readonly fileName?: string }[] } | undefined
    const names = output?.output?.map(item => item.fileName).filter((name): name is string => typeof name === 'string' && name !== '') ?? []
    for (const name of names) artifacts.push(resolvePath(project.outDir, name))
    if (names.length === 0 && fallback !== undefined) artifacts.push(fallback)
  })
  if (failed) return 1
  const targetDiagnostics = await (runtime.checkPackageTargets ?? checkPackageTargets)(project)
  for (const item of targetDiagnostics) printDiagnostic(io, item)
  if (hasErrors(targetDiagnostics)) return 1
  write(io.stdout, `Built ${project.packageId} in ${project.outDir}\n`)
  for (const artifact of artifacts) write(io.stdout, `  ${artifact}\n`)
  return 0
}

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
  const installedVersion = dsh?.version ?? detectInstalledDshVersion(project.packageFile)
  const compatibilityAssessment = assessProjectCompatibility(project.manifest, installedVersion)
  const compatibility = compatibilityAssessment.compatibility
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
  const typecheck = await (runtime.typecheckProject ?? typecheckProject)(project.root)
  const staticDiagnostics = [
    ...(await (runtime.checkManifest ?? checkProjectManifest)(project, { compatibility })),
    ...(await (runtime.checkMigrations ?? checkMigrationDiagnostics)(project)),
    ...typecheck.diagnostics,
    ...projectCompatibilityDiagnostics(compatibilityAssessment, project.packageFile, project.compatibility),
  ]
  const diagnostics = [...staticDiagnostics, ...runtimeDiagnostics]
  const result: CheckResult = {
    project,
    diagnostics,
    staticDiagnostics,
    runtimeDiagnostics,
    ...(dsh === undefined ? {} : { dsh }),
    ...(profile === undefined ? {} : { profile }),
    runtimePlugins,
    bridge,
    connection,
    compatibility: compatibilityAssessment,
    typecheck,
    runtime: {
      requested: requireRuntime,
      status: requireRuntime ? (hasErrors(runtimeDiagnostics) ? 'failed' : 'passed') : 'skipped',
    },
  }
  return result
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

async function runCheck(args: CliArgs, options: CliRunOptions, project: ResolvedDshxConfig): Promise<number> {
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
  if (args.json) {
    write(
      io.stdout,
      `${JSON.stringify({ project: projectSummary(result.project), diagnostics, static: { status: hasErrors([...result.staticDiagnostics, ...fix.diagnostics]) ? 'failed' : 'passed' }, typecheck: { status: result.typecheck.status, configFile: result.typecheck.configFile }, runtime: result.runtime, compatibility: compatibilitySummary(result.compatibility, options.version ?? VERSION), dsh: installationSummary(result.dsh), profile: result.profile ?? null, runtimePlugins: result.runtimePlugins.plugins, bridge: { state: result.bridge.state, metadata: result.bridge.metadata ?? null }, connection: result.connection, fix: fixSummary(fix) }, null, 2)}\n`,
    )
  } else {
    for (const item of diagnostics) printDiagnostic(io, item)
    printCompatibilitySummary(io, result.compatibility, options.version ?? VERSION)
    write(io.stdout, `Typecheck: ${result.typecheck.status}\n`)
    write(io.stdout, `Runtime: ${result.runtime.status}${result.runtime.requested ? '' : ' (use dshx check --runtime to require it)'}\n`)
    if (args.fix && fix.diff !== '') {
      write(io.stdout, `${fix.applied ? 'Applied' : 'Planned'} manifest repair:\n${fix.diff}`)
    }
    if (!hasErrors(diagnostics)) write(io.stdout, `Check passed for ${result.project.packageId}\n`)
  }
  return hasErrors(diagnostics) ? 1 : 0
}

function inspectSummary(project: ResolvedDshxConfig, result: InspectResult): Record<string, unknown> {
  return {
    project: {
      root: project.root,
      packageId: project.packageId,
      profile: project.profile,
    },
    target: result.target,
    source: result.source,
    items: result.items,
    diagnostics: result.diagnostics,
  }
}

async function runInspect(args: CliArgs, options: CliRunOptions, project: ResolvedDshxConfig): Promise<number> {
  const io = options.io ?? defaultIO()
  const runtime = options.runtime ?? {}
  const target = args.inspectTarget as InspectTarget | undefined
  // The parser guarantees this in normal CLI use; retaining the guard keeps the
  // injected runtime API safe for callers that construct CliArgs themselves.
  if (target === undefined) throw new CliUsageError('Inspect requires a target: slots, tools, services, or events.')
  const result = await (runtime.inspectComposition ?? inspectProjectComposition)(project, target, args.root === undefined ? {} : { slotRoot: args.root })
  if (args.json) {
    write(io.stdout, `${JSON.stringify(inspectSummary(project, result), null, 2)}\n`)
  } else {
    for (const item of result.diagnostics) printDiagnostic(io, item)
    write(io.stdout, `Inspect ${target} (${result.source}) for ${project.packageId}\n`)
    for (const item of result.items) {
      if (target === 'slots') {
        const slot = item as {
          readonly name: string
          readonly provider?: string
          readonly kind?: string
          readonly scope?: string
          readonly metadata?: Readonly<Record<string, unknown>>
        }
        const details = [slot.provider, slot.kind, slot.scope].filter((value): value is string => value !== undefined).join(' / ')
        const purpose = args.root !== undefined && typeof slot.metadata?.purpose === 'string' ? slot.metadata.purpose : undefined
        write(io.stdout, `  ${slot.name}${details === '' ? '' : ` (${details})`}${purpose === undefined ? '' : `: ${purpose}`}\n`)
      } else if (target === 'tools') {
        const tool = item as { readonly name: string; readonly provider?: string; readonly description?: string }
        const details = [tool.provider, tool.description].filter((value): value is string => value !== undefined).join(' - ')
        write(io.stdout, `  ${tool.name}${details === '' ? '' : `: ${details}`}\n`)
      } else if (target === 'services') {
        const service = item as { readonly name: string; readonly provider?: string; readonly scope?: string }
        const details = [service.provider, service.scope].filter((value): value is string => value !== undefined).join(' / ')
        write(io.stdout, `  ${service.name}${details === '' ? '' : ` (${details})`}\n`)
      } else {
        const event = item as { readonly name: string; readonly provider?: string }
        const details = event.provider
        write(io.stdout, `  ${event.name}${details === undefined ? '' : ` (${details})`}\n`)
      }
    }
    if (args.verbose && result.cause !== undefined) printVerboseCause(io, result.cause)
  }
  if (args.json && args.verbose && result.cause !== undefined) printVerboseCause(io, result.cause)
  return hasErrors(result.diagnostics) ? 1 : 0
}

async function selectSlotInteractively(io: CliIO, items: readonly { readonly name: string }[]): Promise<string | undefined> {
  if (items.length === 0) return undefined
  const answer = await select({
    message: 'Select a Slot',
    options: items.map(item => ({ value: item.name, label: item.name })),
    input: io.stdin,
    output: io.stdout,
  })
  return isCancel(answer) ? undefined : answer
}

function addSummary(project: ResolvedDshxConfig, result: AddUiResult): Record<string, unknown> {
  return {
    project: projectSummary(project),
    slot: result.slot,
    provider: result.provider,
    changedFiles: result.changedFiles,
    generatedFiles: result.generatedFiles,
    manifestChanged: result.manifestChanged,
    diagnostics: result.diagnostics,
    ...(result.diff === undefined ? {} : { diff: result.diff }),
  }
}

async function runAddUi(args: CliArgs, options: CliRunOptions, project: ResolvedDshxConfig): Promise<number> {
  const io = options.io ?? defaultIO()
  const runtime = options.runtime ?? {}
  if (args.slot === undefined && (args.json || !io.stdin.isTTY)) {
    const item = {
      code: 'DSHX6101',
      severity: 'error' as const,
      message: 'A Slot name is required in non-interactive mode.',
      file: project.packageFile,
      hint: 'Pass --slot <slot-name>, or run in a TTY to choose a Slot interactively.',
    }
    if (args.json) write(io.stdout, `${JSON.stringify({ project: projectSummary(project), diagnostics: [item] }, null, 2)}\n`)
    else printDiagnostic(io, item)
    return 2
  }
  const addOptions: AddUiOptions = {
    project,
    ...(args.slot === undefined ? {} : { slot: args.slot }),
    ...(args.provider === undefined ? {} : { provider: args.provider }),
    ...(args.file === undefined ? {} : { file: args.file }),
    ...(args.id === undefined ? {} : { id: args.id }),
    ...(args.order === undefined ? {} : { order: args.order }),
    dryRun: args.dryRun,
  }
  const add =
    runtime.addUi ??
    (async (value: AddUiOptions) =>
      createUiScaffold(value, {
        ...(runtime.inspectComposition === undefined ? {} : { inspectComposition: runtime.inspectComposition }),
        ...(runtime.checkManifest === undefined ? {} : { checkManifest: runtime.checkManifest }),
        ...(args.slot === undefined ? { selectSlot: (items: readonly { readonly name: string }[]) => selectSlotInteractively(io, items) } : {}),
      }))
  let result: AddUiResult
  try {
    result = await add(addOptions)
  } catch (error) {
    const item = diagnosticFromError(error, project.packageFile)
    if (args.json) write(io.stdout, `${JSON.stringify({ project: projectSummary(project), diagnostics: [item] }, null, 2)}\n`)
    else {
      printDiagnostic(io, item)
    }
    if (args.verbose) printVerboseCause(io, error)
    return 1
  }
  if (args.json) write(io.stdout, `${JSON.stringify(addSummary(project, result), null, 2)}\n`)
  else {
    for (const item of result.diagnostics) printDiagnostic(io, item)
    if (result.diagnostics.some(item => item.severity === 'error')) return 1
    write(io.stdout, `${args.dryRun ? 'Planned' : 'Generated'} UI Slot ${result.slot.name} using ${result.provider}\n`)
    for (const file of result.changedFiles) write(io.stdout, `  ${file}\n`)
    if (result.diff !== undefined) write(io.stdout, result.diff)
  }
  return result.diagnostics.some(item => item.severity === 'error') ? 1 : 0
}

function toolSummary(project: ResolvedDshxConfig, result: AddToolResult): Record<string, unknown> {
  return {
    project: projectSummary(project),
    name: result.name,
    changedFiles: result.changedFiles,
    generatedFiles: result.generatedFiles,
    diagnostics: result.diagnostics,
    dryRun: result.dryRun,
    ...(result.diff === undefined ? {} : { diff: result.diff }),
  }
}

async function promptLine(io: CliIO, question: string): Promise<string> {
  const answer = await text({ message: question.replace(/:\s*$/, ''), input: io.stdin, output: io.stdout })
  return isCancel(answer) ? '' : answer
}

async function runAddTool(args: CliArgs, options: CliRunOptions, project: ResolvedDshxConfig): Promise<number> {
  const io = options.io ?? defaultIO()
  const runtime = options.runtime ?? {}
  let name = args.name
  if (name === undefined && io.stdin.isTTY && !args.json) name = (await promptLine(io, 'Tool name: ')).trim()
  if (name === undefined || name === '') {
    const item = {
      code: 'DSHX6201',
      severity: 'error' as const,
      message: 'A Tool name is required.',
      file: project.packageFile,
      hint: 'Pass --name <name>, or run in a TTY and enter a Tool name.',
    }
    if (args.json)
      write(
        io.stdout,
        `${JSON.stringify({ project: projectSummary(project), name: null, changedFiles: [], generatedFiles: [], diagnostics: [item], dryRun: args.dryRun }, null, 2)}\n`,
      )
    else printDiagnostic(io, item)
    return 2
  }
  const toolOptions: AddToolOptions = {
    project,
    name,
    ...(args.description === undefined ? {} : { description: args.description }),
    ...(args.file === undefined ? {} : { file: args.file }),
    dryRun: args.dryRun,
  }
  let result: AddToolResult
  try {
    result =
      runtime.addTool === undefined
        ? await createToolScaffold(toolOptions, { ...(runtime.checkManifest === undefined ? {} : { checkManifest: runtime.checkManifest }) })
        : await runtime.addTool(toolOptions)
  } catch (error) {
    const item = diagnosticFromError(error, project.packageFile)
    if (args.json)
      write(
        io.stdout,
        `${JSON.stringify({ project: projectSummary(project), name, changedFiles: [], generatedFiles: [], diagnostics: [item], dryRun: args.dryRun }, null, 2)}\n`,
      )
    else printDiagnostic(io, item)
    if (args.verbose) printVerboseCause(io, error)
    return 1
  }
  if (args.json) write(io.stdout, `${JSON.stringify(toolSummary(project, result), null, 2)}\n`)
  else {
    for (const item of result.diagnostics) printDiagnostic(io, item)
    if (!result.diagnostics.some(item => item.severity === 'error')) {
      write(io.stdout, `${result.dryRun ? 'Planned' : 'Generated'} Tool ${result.name}\n`)
      for (const file of result.changedFiles) write(io.stdout, `  ${file}\n`)
      if (result.diff !== undefined) write(io.stdout, result.diff)
    }
  }
  return result.diagnostics.some(item => item.severity === 'error') ? 1 : 0
}

async function runAddCommand(args: CliArgs, options: CliRunOptions, project: ResolvedDshxConfig): Promise<number> {
  const io = options.io ?? defaultIO()
  const runtime = options.runtime ?? {}
  let name = args.name
  if (name === undefined && io.stdin.isTTY && !args.json) name = (await promptLine(io, 'Command name: ')).trim()
  if (name === undefined || name === '') {
    const item = {
      code: 'DSHX6501',
      severity: 'error' as const,
      message: 'A Command name is required.',
      file: project.packageFile,
      hint: 'Pass --name <name>, or run in a TTY and enter a Command name.',
    }
    if (args.json)
      write(
        io.stdout,
        `${JSON.stringify({ project: projectSummary(project), name: null, changedFiles: [], generatedFiles: [], diagnostics: [item], dryRun: args.dryRun }, null, 2)}\n`,
      )
    else printDiagnostic(io, item)
    return 2
  }
  const commandOptions: AddCommandOptions = {
    project,
    name,
    ...(args.description === undefined ? {} : { description: args.description }),
    ...(args.file === undefined ? {} : { file: args.file }),
    dryRun: args.dryRun,
  }
  let result: AddCommandResult
  try {
    result =
      runtime.addCommand === undefined
        ? await createCommandScaffold(commandOptions, { ...(runtime.checkManifest === undefined ? {} : { checkManifest: runtime.checkManifest }) })
        : await runtime.addCommand(commandOptions)
  } catch (error) {
    const item = diagnosticFromError(error, project.packageFile)
    if (args.json)
      write(
        io.stdout,
        `${JSON.stringify({ project: projectSummary(project), name, changedFiles: [], generatedFiles: [], diagnostics: [item], dryRun: args.dryRun }, null, 2)}\n`,
      )
    else printDiagnostic(io, item)
    if (args.verbose) printVerboseCause(io, error)
    return 1
  }
  if (args.json) write(io.stdout, `${JSON.stringify(toolSummary(project, result), null, 2)}\n`)
  else {
    for (const item of result.diagnostics) printDiagnostic(io, item)
    if (!result.diagnostics.some(item => item.severity === 'error')) {
      write(io.stdout, `${result.dryRun ? 'Planned' : 'Generated'} Command ${result.name}\n`)
      for (const file of result.changedFiles) write(io.stdout, `  ${file}\n`)
      if (result.diff !== undefined) write(io.stdout, result.diff)
    }
  }
  return result.diagnostics.some(item => item.severity === 'error') ? 1 : 0
}

function hookSummary(project: ResolvedDshxConfig, result: AddHookResult): Record<string, unknown> {
  return {
    project: projectSummary(project),
    event: result.event,
    changedFiles: result.changedFiles,
    generatedFiles: result.generatedFiles,
    diagnostics: result.diagnostics,
    dryRun: result.dryRun,
    ...(result.diff === undefined ? {} : { diff: result.diff }),
  }
}

async function runAddHook(args: CliArgs, options: CliRunOptions, project: ResolvedDshxConfig): Promise<number> {
  const io = options.io ?? defaultIO()
  const runtime = options.runtime ?? {}
  let event = args.event
  if (event === undefined && io.stdin.isTTY && !args.json) event = (await promptLine(io, 'Hook event: ')).trim()
  if (event === undefined || event === '') {
    const item = {
      code: 'DSHX6301',
      severity: 'error' as const,
      message: 'A Hook event is required.',
      file: project.packageFile,
      hint: 'Pass --event <event.name>, or run in a TTY and enter a Hook event.',
    }
    if (args.json)
      write(
        io.stdout,
        `${JSON.stringify({ project: projectSummary(project), event: null, changedFiles: [], generatedFiles: [], diagnostics: [item], dryRun: args.dryRun }, null, 2)}\n`,
      )
    else printDiagnostic(io, item)
    return 2
  }
  const hookOptions: AddHookOptions = {
    project,
    event,
    ...(args.file === undefined ? {} : { file: args.file }),
    dryRun: args.dryRun,
  }
  let result: AddHookResult
  try {
    result =
      runtime.addHook === undefined
        ? await createHookScaffold(hookOptions, { ...(runtime.checkManifest === undefined ? {} : { checkManifest: runtime.checkManifest }) })
        : await runtime.addHook(hookOptions)
  } catch (error) {
    const item = diagnosticFromError(error, project.packageFile)
    if (args.json)
      write(
        io.stdout,
        `${JSON.stringify({ project: projectSummary(project), event, changedFiles: [], generatedFiles: [], diagnostics: [item], dryRun: args.dryRun }, null, 2)}\n`,
      )
    else printDiagnostic(io, item)
    if (args.verbose) printVerboseCause(io, error)
    return 1
  }
  if (args.json) write(io.stdout, `${JSON.stringify(hookSummary(project, result), null, 2)}\n`)
  else {
    for (const item of result.diagnostics) printDiagnostic(io, item)
    if (!result.diagnostics.some(item => item.severity === 'error')) {
      write(io.stdout, `${result.dryRun ? 'Planned' : 'Generated'} Hook ${result.event}\n`)
      for (const file of result.changedFiles) write(io.stdout, `  ${file}\n`)
      if (result.diff !== undefined) write(io.stdout, result.diff)
    }
  }
  return result.diagnostics.some(item => item.severity === 'error') ? 1 : 0
}

function eventLine(event: DevEvent): string | undefined {
  if (event.type === 'build-success') return `${event.face} build succeeded${event.initial ? ' (initial)' : ''}`
  if (event.type === 'client-rebuilt') return 'client rebuilt'
  if (event.type === 'host-restart-required') return 'Host rebuilt; press r to restart DSH'
  if (event.type === 'dsh-exit') return `DSH exited${event.code === null ? ` by ${event.signal ?? 'signal'}` : ` with code ${event.code}`}`
  if (event.type === 'build-error') return `${event.face} build failed`
  return undefined
}

async function runDev(args: CliArgs, options: CliRunOptions, project: ResolvedDshxConfig): Promise<number> {
  const io = options.io ?? defaultIO()
  const runtime = options.runtime ?? {}
  const installed = detectInstalledDshVersion(project.packageFile)
  const initialAssessment = assessProjectCompatibility(project.manifest, installed)
  const diagnostics = [
    ...projectCompatibilityDiagnostics(initialAssessment, project.packageFile, project.compatibility),
    ...(await (runtime.checkManifest ?? checkProjectManifest)(project, { compatibility: initialAssessment.compatibility })),
  ]
  if (hasErrors(diagnostics)) {
    for (const item of diagnostics) printDiagnostic(io, item)
    return 1
  }
  let profile: PreparedProjectProfile
  try {
    profile = await (runtime.ensureProfile ?? ensureProjectProfile)(project)
  } catch (error) {
    const item = diagnosticFromError(error, project.packageFile)
    printDiagnostic(io, item)
    return 1
  }
  const assessment = assessProjectCompatibility(project.manifest, profile.dsh.version)
  const finalDiagnostics = [
    ...projectCompatibilityDiagnostics(assessment, project.packageFile, project.compatibility),
    ...(await (runtime.checkManifest ?? checkProjectManifest)(project, { compatibility: assessment.compatibility })),
    ...profile.diagnostics,
  ]
  for (const item of finalDiagnostics) printDiagnostic(io, item)
  if (hasErrors(finalDiagnostics)) return 1
  printCompatibilitySummary(io, assessment, options.version ?? VERSION)
  let session: DevSession
  try {
    session = await (runtime.startDev ?? startDevSession)(project, {
      preparedProfile: profile,
      inspectBridge: true,
      dshArgs: [...(args.port === undefined ? [] : ['--port', String(args.port)]), ...(args.open ? ['--open'] : [])],
    })
  } catch (error) {
    const item = diagnosticFromError(error, project.packageFile)
    printDiagnostic(io, item)
    return 1
  }
  let closing = false
  let resolveExit: (code: number) => void = () => undefined
  const done = new Promise<number>(resolve => {
    resolveExit = resolve
  })
  const close = async (code: number): Promise<void> => {
    if (closing) return
    closing = true
    if (io.stdin.isTTY && io.stdin.setRawMode) io.stdin.setRawMode(false)
    await session.close()
    resolveExit(code)
  }
  const onSignal = (): void => {
    void close(0)
  }
  process.once('SIGINT', onSignal)
  process.once('SIGTERM', onSignal)
  const onEvent = session.on(event => {
    const line = eventLine(event)
    if (line !== undefined) write(io.stderr, `${line}\n`)
    if (event.type === 'dsh-exit' && !io.stdin.isTTY) void close(1)
  })
  const onData = (chunk: Buffer | string): void => {
    const value = String(chunk)
    if (value.includes('q') || value.includes('\u0003')) void close(0)
    else if (value.includes('r')) void session.restart().catch(error => printDiagnostic(io, diagnosticFromError(error, project.packageFile)))
  }
  if (io.stdin.isTTY) {
    if (io.stdin.setRawMode) io.stdin.setRawMode(true)
    io.stdin.on('data', onData)
  }
  write(io.stdout, `Dev session started for ${project.packageId}\n`)
  const code = await done
  onEvent()
  if (io.stdin.isTTY) io.stdin.off('data', onData)
  process.removeListener('SIGINT', onSignal)
  process.removeListener('SIGTERM', onSignal)
  return code
}

export async function runCli(argv: readonly string[], options: CliRunOptions = {}): Promise<number> {
  const io = options.io ?? defaultIO()
  let args: CliArgs
  try {
    args = parseCliArgs(argv)
  } catch (error) {
    write(io.stderr, `error: ${error instanceof CliUsageError ? error.message : String(error)}\n`)
    write(io.stderr, 'Run "dshx --help" for usage.\n')
    return 2
  }
  if (args.help) {
    write(
      io.stdout,
      'Usage: dshx <build|check|dev|inspect|add> [target] [options]\n\nOptions: --cwd <path> --verbose --help --version\ncheck/inspect/add: --json\ncheck: --runtime --fix --dry-run\ndev: --open --port <port>\ninspect targets: slots, tools, services, events\ninspect slots: --root <slot-name>\nadd targets: ui, tool, command, hook\nadd ui options: --slot <name> --provider <package> --file <path> --id <id> --order <integer> --dry-run\nadd tool options: --name <name> --description <text> --file <path> --dry-run\nadd command options: --name <name> --description <text> --file <path> --dry-run\nadd hook options: --event <name> --file <path> --dry-run\n',
    )
    return 0
  }
  if (args.version) {
    write(io.stdout, `${options.version ?? VERSION}\n`)
    return 0
  }
  try {
    const runtime = options.runtime ?? {}
    const project = await (runtime.resolveConfig ?? resolveDshxConfig)(
      args.cwd === undefined ? (options.cwd === undefined ? {} : { cwd: options.cwd }) : { cwd: args.cwd },
    )
    if (args.command === 'build') return await runBuild(args, options, project)
    if (args.command === 'check') return await runCheck(args, options, project)
    if (args.command === 'inspect') return await runInspect(args, options, project)
    if (args.command === 'add') {
      if (args.addTarget === 'tool') return await runAddTool(args, options, project)
      if (args.addTarget === 'command') return await runAddCommand(args, options, project)
      if (args.addTarget === 'hook') return await runAddHook(args, options, project)
      return await runAddUi(args, options, project)
    }
    return await runDev(args, options, project)
  } catch (error) {
    const item = diagnosticFromError(error)
    if ((args.command === 'check' || args.command === 'inspect' || args.command === 'add') && args.json) {
      write(
        io.stdout,
        `${JSON.stringify(
          args.command === 'inspect'
            ? { project: null, target: args.inspectTarget ?? null, source: 'runtime', items: [], diagnostics: [item] }
            : args.command === 'add'
              ? args.addTarget === 'tool' || args.addTarget === 'command'
                ? { project: null, name: args.name ?? null, changedFiles: [], generatedFiles: [], diagnostics: [item], dryRun: args.dryRun }
                : args.addTarget === 'hook'
                  ? { project: null, event: args.event ?? null, changedFiles: [], generatedFiles: [], diagnostics: [item], dryRun: args.dryRun }
                  : { project: null, slot: null, provider: null, changedFiles: [], generatedFiles: [], manifestChanged: false, diagnostics: [item] }
              : { project: null, diagnostics: [item], dsh: null, profile: null },
          null,
          2,
        )}\n`,
      )
      if (args.verbose) printVerboseCause(io, error)
    } else {
      printDiagnostic(io, item)
      if (args.verbose) printVerboseCause(io, error)
    }
    return 1
  }
}
