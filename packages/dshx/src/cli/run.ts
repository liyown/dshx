import type { Readable, Writable } from 'node:stream'
import { resolve as resolvePath } from 'node:path'
import { buildClient, buildHost } from '../compiler/index.js'
import { resolveDshxConfig } from '../config/index.js'
import { startDevSession } from '../dev/index.js'
import type { DevEvent, DevSession } from '../dev/index.js'
import { DshxError } from '../diagnostics.js'
import { ensureProjectProfile, inspectProjectProfile, resolveDshInstallation } from '../profile/index.js'
import type { PreparedProjectProfile, ProjectProfileLink, ResolvedDshInstallation } from '../profile/types.js'
import { checkProjectManifest } from '../project/index.js'
import type { ResolvedDshxConfig } from '../config/types.js'
import { CliUsageError, parseCliArgs, type CliArgs } from './args.js'
import type { DshxDiagnostic } from '../diagnostics.js'

export interface CliIO {
  readonly stdin: Readable & { isTTY?: boolean; setRawMode?: (mode: boolean) => void }
  readonly stdout: Writable
  readonly stderr: Writable
}

export interface CliRuntime {
  readonly resolveConfig?: typeof resolveDshxConfig
  readonly checkManifest?: typeof checkProjectManifest
  readonly resolveDsh?: typeof resolveDshInstallation
  readonly inspectProfile?: typeof inspectProjectProfile
  readonly ensureProfile?: typeof ensureProjectProfile
  readonly buildHost?: typeof buildHost
  readonly buildClient?: typeof buildClient
  readonly startDev?: typeof startDevSession
}

export interface CliRunOptions {
  readonly io?: CliIO
  readonly runtime?: CliRuntime
  readonly cwd?: string
  readonly version?: string
}

const VERSION = '0.0.0'

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
  write(io.stderr, `cause: ${cause instanceof Error ? cause.stack ?? cause.message : String(cause)}\n`)
}

function hasErrors(items: readonly DshxDiagnostic[]): boolean {
  return items.some(item => item.severity === 'error')
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

async function runBuild(args: CliArgs, options: CliRunOptions, project: ResolvedDshxConfig): Promise<number> {
  const io = options.io ?? defaultIO()
  const runtime = options.runtime ?? {}
  const diagnostics = await (runtime.checkManifest ?? checkProjectManifest)(project)
  for (const item of diagnostics) printDiagnostic(io, item)
  if (hasErrors(diagnostics)) return 1
  const jobs: Array<{ readonly fallback: string; readonly task: Promise<unknown> }> = []
  if (project.hostEntry !== undefined) jobs.push({ fallback: resolvePath(project.outDir, 'index.js'), task: (runtime.buildHost ?? buildHost)({
    packageId: project.packageId,
    logicalName: project.name,
    root: project.root,
    entry: project.hostEntry,
    outDir: project.outDir,
    sourcemap: project.build.sourcemap,
  }) })
  if (project.clientEntry !== undefined) {
    const dsh = project.manifest.dsh
    const client = typeof dsh === 'object' && dsh !== null && !Array.isArray(dsh) && typeof (dsh as Record<string, unknown>).client === 'object'
      ? (dsh as Record<string, unknown>).client as Record<string, unknown>
      : undefined
    const external = Array.isArray(client?.external) && client.external.every(value => typeof value === 'string')
      ? client.external as string[]
      : []
    jobs.push({ fallback: resolvePath(project.outDir, 'client.js'), task: (runtime.buildClient ?? buildClient)({
      packageId: project.packageId,
      logicalName: project.name,
      root: project.root,
      entry: project.clientEntry,
      outDir: project.outDir,
      sourcemap: project.build.sourcemap,
      external,
    }) })
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
  write(io.stdout, `Built ${project.packageId} in ${project.outDir}\n`)
  for (const artifact of artifacts) write(io.stdout, `  ${artifact}\n`)
  return 0
}

interface CheckResult {
  readonly project: ResolvedDshxConfig
  readonly diagnostics: readonly DshxDiagnostic[]
  readonly dsh?: ResolvedDshInstallation
  readonly profile?: ProjectProfileLink
}

async function runCheck(args: CliArgs, options: CliRunOptions, project: ResolvedDshxConfig): Promise<number> {
  const io = options.io ?? defaultIO()
  const runtime = options.runtime ?? {}
  const diagnostics: DshxDiagnostic[] = [...await (runtime.checkManifest ?? checkProjectManifest)(project)]
  let dsh: ResolvedDshInstallation | undefined
  let profile: ProjectProfileLink | undefined
  try {
    dsh = await (runtime.resolveDsh ?? resolveDshInstallation)(project)
    diagnostics.push(...dsh.diagnostics)
    profile = await (runtime.inspectProfile ?? inspectProjectProfile)(project)
    if (profile.state === 'absent') diagnostics.push({
      code: 'DSHX4305', severity: 'error',
      message: `Project ${JSON.stringify(project.packageId)} is not linked in profile ${JSON.stringify(project.profile)}.`,
      file: project.packageFile,
      hint: `Run "dshx dev" or "pnpm exec dsh plugin --profile ${project.profile} add ${project.root}".`,
    })
  } catch (error) {
    diagnostics.push(diagnosticFromError(error, project.packageFile))
  }
  const result: CheckResult = { project, diagnostics, ...(dsh === undefined ? {} : { dsh }), ...(profile === undefined ? {} : { profile }) }
  if (args.json) {
    write(io.stdout, `${JSON.stringify({ project: projectSummary(project), diagnostics, dsh: dsh ?? null, profile: profile ?? null }, null, 2)}\n`)
  } else {
    for (const item of diagnostics) printDiagnostic(io, item)
    if (!hasErrors(diagnostics)) write(io.stdout, `Check passed for ${project.packageId}\n`)
  }
  return hasErrors(result.diagnostics) ? 1 : 0
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
  const diagnostics = await (runtime.checkManifest ?? checkProjectManifest)(project)
  for (const item of diagnostics) printDiagnostic(io, item)
  if (hasErrors(diagnostics)) return 1
  let profile: PreparedProjectProfile
  try {
    profile = await (runtime.ensureProfile ?? ensureProjectProfile)(project)
  } catch (error) {
    const item = diagnosticFromError(error, project.packageFile)
    printDiagnostic(io, item)
    return 1
  }
  for (const item of profile.diagnostics) printDiagnostic(io, item)
  let session: DevSession
  try {
    session = await (runtime.startDev ?? startDevSession)(project, {
      preparedProfile: profile,
      dshArgs: args.open ? ['--open'] : [],
    })
  } catch (error) {
    const item = diagnosticFromError(error, project.packageFile)
    printDiagnostic(io, item)
    return 1
  }
  let closing = false
  let resolveExit: (code: number) => void = () => undefined
  const done = new Promise<number>(resolve => { resolveExit = resolve })
  const close = async (code: number): Promise<void> => {
    if (closing) return
    closing = true
    if (io.stdin.isTTY && io.stdin.setRawMode) io.stdin.setRawMode(false)
    await session.close()
    resolveExit(code)
  }
  const onSignal = (): void => { void close(0) }
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
    write(io.stdout, 'Usage: dshx <build|check|dev> [options]\n\nOptions: --cwd <path> --verbose --help --version\ncheck: --json\ndev: --open\n')
    return 0
  }
  if (args.version) {
    write(io.stdout, `${options.version ?? VERSION}\n`)
    return 0
  }
  try {
    const runtime = options.runtime ?? {}
    const project = await (runtime.resolveConfig ?? resolveDshxConfig)(args.cwd === undefined
      ? (options.cwd === undefined ? {} : { cwd: options.cwd })
      : { cwd: args.cwd })
    if (args.command === 'build') return await runBuild(args, options, project)
    if (args.command === 'check') return await runCheck(args, options, project)
    return await runDev(args, options, project)
  } catch (error) {
    const item = diagnosticFromError(error)
    if (args.command === 'check' && args.json) {
      write(io.stdout, `${JSON.stringify({ project: null, diagnostics: [item], dsh: null, profile: null }, null, 2)}\n`)
    } else {
      printDiagnostic(io, item)
      if (args.verbose) printVerboseCause(io, error)
    }
    return 1
  }
}
