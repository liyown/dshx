import type { Writable } from 'node:stream'
import type { ResolvedDshxConfig } from '../../config/types.js'
import { startDevSession } from '../../dev/index.js'
import type { DevEvent, DevSession } from '../../dev/index.js'
import { ensureProjectProfile } from '../../profile/index.js'
import type { PreparedProjectProfile } from '../../profile/types.js'
import type { CliArgs } from '../args.js'
import type { CliRunOptions } from '../context.js'
import {
  defaultIO,
  diagnosticFromError,
  hasErrors,
  paint,
  printCompatibilitySummary,
  printDiagnostic,
  printDiagnostics,
  statusSymbol,
  write,
} from '../presentation.js'
import { preflight } from '../preflight.js'
import { VERSION } from '../version.js'

function watchProcessSignal(signal: 'SIGINT' | 'SIGTERM', handler: () => void): () => void {
  process.once(signal, handler)
  return () => {
    process.removeListener(signal, handler)
  }
}

function eventLine(stream: Writable, event: DevEvent): string | undefined {
  const face = event.type === 'build-success' || event.type === 'build-error' ? `${event.face[0]?.toUpperCase()}${event.face.slice(1)}` : ''
  if (event.type === 'build-success')
    return `${statusSymbol(stream, 'success')} ${paint(stream, 'green', `${face} build succeeded`)}${event.initial ? paint(stream, 'gray', ' (initial)') : ''}`
  if (event.type === 'client-rebuilt') return `${statusSymbol(stream, 'success')} ${paint(stream, 'green', 'Client rebuilt')}`
  if (event.type === 'host-restart-required') return `${statusSymbol(stream, 'pending')} Host rebuilt; press ${paint(stream, 'cyan', 'r')} to restart DSH`
  if (event.type === 'dsh-exit')
    return `${statusSymbol(stream, 'failure')} ${paint(stream, 'red', `DSH exited${event.code === null ? ` by ${event.signal ?? 'signal'}` : ` with code ${event.code}`}`)}`
  if (event.type === 'build-error') return `${statusSymbol(stream, 'failure')} ${paint(stream, 'red', `${face} build failed`)}`
  return undefined
}

export async function runDev(args: CliArgs, options: CliRunOptions, project: ResolvedDshxConfig): Promise<number> {
  const io = options.io ?? defaultIO()
  const runtime = options.runtime ?? {}
  const steps = ['compatibility', 'manifest'] as const
  const initial = await preflight({ project, runtime, steps })
  if (hasErrors(initial.diagnostics)) {
    printDiagnostics(io, initial.diagnostics)
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
  // The profile decides which DSH the session actually runs, so compatibility
  // is assessed again against it rather than against whatever is installed.
  const checked = await preflight({ project, runtime, steps, installedVersion: profile.dsh.version })
  const finalDiagnostics = [...checked.diagnostics, ...profile.diagnostics]
  printDiagnostics(io, finalDiagnostics)
  if (hasErrors(finalDiagnostics)) return 1
  printCompatibilitySummary(io, checked.assessment, options.version ?? VERSION, args.verbose)
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
    if (io.stdin.isTTY) {
      if (io.stdin.setRawMode) io.stdin.setRawMode(false)
      io.stdin.pause()
      if (io.stdout === process.stdout) write(io.stdout, `\n${statusSymbol(io.stdout, 'pending')} Stopping development session...\n`)
    }
    await session.close()
    if (io.stdout === process.stdout) write(io.stdout, `${statusSymbol(io.stdout, 'success')} Development session stopped\n`)
    resolveExit(code)
  }
  const onSignal = (): void => {
    void close(0)
  }
  const watch = runtime.onProcessSignal ?? watchProcessSignal
  const unwatch = [watch('SIGINT', onSignal), watch('SIGTERM', onSignal)]
  const onEvent = session.on(event => {
    const line = eventLine(io.stderr, event)
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
  write(io.stdout, `${paint(io.stdout, ['bold', 'cyan'], '◆ Dev session')} ${paint(io.stdout, ['bold', 'white'], project.packageId)}\n`)
  if (io.stdin.isTTY) write(io.stdout, `  ${paint(io.stdout, 'gray', 'r restart  •  q / Ctrl+C stop')}\n`)
  const code = await done
  onEvent()
  if (io.stdin.isTTY) io.stdin.off('data', onData)
  for (const remove of unwatch) remove()
  return code
}
