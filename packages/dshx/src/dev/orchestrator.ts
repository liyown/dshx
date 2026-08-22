import { execa } from 'execa'
import type { BuildClientOptions } from '../compiler/client/build.js'
import { startClientWatcher } from '../compiler/client/build.js'
import type { BuildHostOptions } from '../compiler/host/build.js'
import { startHostWatcher } from '../compiler/host/build.js'
import { DshxError } from '../diagnostics.js'
import type { DshxDiagnostic } from '../diagnostics.js'
import { ensureProjectProfile } from '../profile/orchestrator.js'
import type {
  DevBuildEvent,
  DevChildProcess,
  DevEvent,
  DevSession,
  DevSessionOptions,
  DevState,
  DevWatcher,
} from './types.js'
import type { ResolvedDshxConfig } from '../config/types.js'

const DEFAULT_STOP_TIMEOUT_MS = 3_000

function diagnostic(
  code: string,
  message: string,
  file: string,
  hint: string,
): DshxDiagnostic {
  return { code, severity: 'error', message, file, hint }
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  return String(error)
}

function clientExternals(project: ResolvedDshxConfig): readonly string[] {
  const dsh = project.manifest.dsh
  if (typeof dsh !== 'object' || dsh === null || Array.isArray(dsh)) return []
  const client = (dsh as Record<string, unknown>).client
  if (typeof client !== 'object' || client === null || Array.isArray(client)) return []
  const external = (client as Record<string, unknown>).external
  return Array.isArray(external) && external.every(value => typeof value === 'string') ? external : []
}

function childFromExeca(
  project: ResolvedDshxConfig,
  args: readonly string[],
  env: NodeJS.ProcessEnv,
  executable: 'local' | 'global',
): Promise<DevChildProcess> {
  const command = executable === 'global' ? 'dsh' : 'pnpm'
  const commandArgs = executable === 'global' ? [...args] : ['exec', 'dsh', ...args]
  const subprocess = execa(command, commandArgs, {
    cwd: project.root,
    env,
    stdio: 'inherit',
    reject: false,
  })
  const child = subprocess.nodeChildProcess
  if (child === undefined) {
    return Promise.reject(new DshxError('DSHX4401', 'Failed to start the DSH process.', {
      file: project.packageFile,
      hint: 'Install @deepseek-ai/dsh in the project or make the official dsh command available on PATH, then retry.',
    }))
  }
  void subprocess.catch(() => undefined)
  return Promise.resolve(child as unknown as DevChildProcess)
}

function buildOptions(project: ResolvedDshxConfig, compatibility: import('../compat/types.js').DshCompatibility): {
  host?: BuildHostOptions
  client?: BuildClientOptions
} {
  return {
    ...(project.hostEntry === undefined ? {} : {
      host: {
        packageId: project.packageId,
        logicalName: project.name,
        root: project.root,
        entry: project.hostEntry,
        outDir: project.outDir,
        sourcemap: project.build.sourcemap,
        watch: true,
        compatibility,
      },
    }),
    ...(project.clientEntry === undefined ? {} : {
      client: {
        packageId: project.packageId,
        logicalName: project.name,
        root: project.root,
        entry: project.clientEntry,
        outDir: project.outDir,
        sourcemap: project.build.sourcemap,
        watch: true,
        external: clientExternals(project),
        compatibility,
      },
    }),
  }
}

/** Start a coordinated Host/Client watch build and selected DSH process. */
export async function startDevSession(
  project: ResolvedDshxConfig,
  options: DevSessionOptions = {},
): Promise<DevSession> {
  const environment = { ...process.env, ...options.profile?.env, ...options.env }
  const profileOptions = { ...options.profile, env: environment }
  const profile = options.preparedProfile
    ?? await (options.ensureProfile ?? ensureProjectProfile)(project, profileOptions)
  const buildPaths = buildOptions(project, profile.dsh.compatibility)
  const listeners = new Set<(event: DevEvent) => void>()
  const diagnostics: DshxDiagnostic[] = [...profile.diagnostics]
  const watchers: { host?: DevWatcher; client?: DevWatcher } = {}
  let child: DevChildProcess | undefined
  let childStart: Promise<void> | undefined
  let closed = false
  let restartChain: Promise<void> = Promise.resolve()
  let hostBuilt = project.hostEntry === undefined
  let clientBuilt = project.clientEntry === undefined
  let initialDshAttempted = false
  const ignoredExit = new WeakSet<object>()
  const observedExit = new WeakSet<object>()
  let state: DevState = {
    hostBuild: project.hostEntry === undefined ? 'idle' : 'building',
    clientBuild: project.clientEntry === undefined ? 'idle' : 'building',
    hostRestartRequired: false,
    dshProcess: 'stopped',
  }

  const emit = (event: DevEvent): void => {
    for (const listener of [...listeners]) listener(event)
  }
  const setState = (next: Partial<DevState>): void => {
    state = { ...state, ...next }
    emit({ type: 'state', state })
  }
  const emitDiagnostic = (item: DshxDiagnostic): void => {
    diagnostics.push(item)
    emit({ type: 'diagnostic', diagnostic: item })
  }

  const stopChild = async (target: DevChildProcess): Promise<void> => {
    ignoredExit.add(target as object)
    const exited = new Promise<void>(resolve => {
      target.on('exit', () => resolve())
    })
    target.kill('SIGTERM')
    const timeout = options.stopTimeoutMs ?? DEFAULT_STOP_TIMEOUT_MS
    let timer: ReturnType<typeof setTimeout> | undefined
    const didExit = await Promise.race([
      exited.then(() => true),
      new Promise<false>(resolve => { timer = setTimeout(() => resolve(false), timeout) }),
    ])
    if (timer !== undefined) clearTimeout(timer)
    if (!didExit) target.kill('SIGKILL')
  }

  const startChildNow = async (restarting = false): Promise<void> => {
    if (closed || child !== undefined || state.dshProcess === 'starting' || !hostBuilt || !clientBuilt) return
    setState({ dshProcess: 'starting', hostRestartRequired: false })
    const args = [
      '--profile',
      profile.profile,
      ...(options.inspectBridge === true ? ['--inspect-bridge'] : []),
      ...(profile.profile === 'web' && !(options.dshArgs ?? []).some(arg => arg === '--no-open' || arg === '--open') ? ['--no-open'] : []),
      ...(options.dshArgs ?? []),
    ]
    try {
      const childFactory = options.child ?? ((childProject, childArgs, childEnv) => childFromExeca(
        childProject,
        childArgs,
        childEnv,
        profile.dsh.executable ?? 'local',
      ))
      const started = await childFactory(project, args, environment)
      if (closed) {
        await stopChild(started)
        return
      }
      child = started
      started.on('error', error => {
        if (ignoredExit.has(started as object) || observedExit.has(started as object)) return
        ignoredExit.add(started as object)
        if (child === started) child = undefined
        const item = diagnostic(restarting ? 'DSHX4404' : 'DSHX4401', `DSH process failed to start: ${errorMessage(error)}`, project.packageFile, 'Install DSH locally or make the official dsh command available on PATH, then retry.')
        setState({ dshProcess: 'failed' })
        emitDiagnostic(item)
      })
      started.on('exit', (code, signal) => {
        if (observedExit.has(started as object)) return
        observedExit.add(started as object)
        if (ignoredExit.has(started as object)) {
          if (child === started) child = undefined
          return
        }
        if (child === started) child = undefined
        const item = diagnostic(
          code === null ? 'DSHX4403' : 'DSHX4402',
          code === null ? `DSH process exited due to signal ${signal ?? 'unknown'}.` : `DSH process exited with code ${code}.`,
          project.packageFile,
          'Inspect the DSH stderr output, then call restart() after fixing the issue.',
        )
        setState({ dshProcess: 'failed' })
        emit({ type: 'dsh-exit', code, signal, diagnostic: item })
        emitDiagnostic(item)
      })
      setState({ dshProcess: 'running' })
    } catch (error) {
      const item = diagnostic(restarting ? 'DSHX4404' : 'DSHX4401', `Failed to start DSH process: ${errorMessage(error)}`, project.packageFile, 'Install DSH locally or make the official dsh command available on PATH, then retry.')
      setState({ dshProcess: 'failed' })
      emitDiagnostic(item)
    }
  }

  const startChild = (restarting = false): Promise<void> => {
    if (childStart !== undefined) return childStart
    const operation = startChildNow(restarting)
    childStart = operation
    void operation.then(
      () => { if (childStart === operation) childStart = undefined },
      () => { if (childStart === operation) childStart = undefined },
    )
    return operation
  }

  const startInitialChild = async (): Promise<void> => {
    if (initialDshAttempted || !hostBuilt || !clientBuilt) return
    initialDshAttempted = true
    await startChild()
  }

  const stopDsh = async (): Promise<void> => {
    const target = child
    child = undefined
    if (target === undefined) {
      if (state.dshProcess !== 'stopped') setState({ dshProcess: 'stopped' })
      return
    }
    setState({ dshProcess: 'stopped' })
    await stopChild(target)
  }

  const restartInternal = async (): Promise<void> => {
    if (closed) return
    setState({ hostRestartRequired: false })
    await stopDsh()
    await startChild(true)
  }

  const restart = (): Promise<void> => {
    restartChain = restartChain.then(restartInternal, restartInternal)
    return restartChain
  }

  const handleBuildEvent = async (face: 'host' | 'client', event: DevBuildEvent): Promise<void> => {
    if (closed) return
    if (event.code === 'START' || event.code === 'BUNDLE_START') {
      setState({ [face === 'host' ? 'hostBuild' : 'clientBuild']: 'building' })
      return
    }
    if (event.code === 'ERROR') {
      const file = face === 'host' ? (project.hostEntry ?? project.packageFile) : (project.clientEntry ?? project.packageFile)
      const item = diagnostic('DSHX4406', `${face === 'host' ? 'Host' : 'Client'} build failed: ${errorMessage(event.error)}`, file, 'Fix the source error; the watcher remains active and will retry on the next change.')
      setState({ [face === 'host' ? 'hostBuild' : 'clientBuild']: 'error' })
      emit({ type: 'build-error', face, error: event.error, diagnostic: item })
      emitDiagnostic(item)
      return
    }
    if (event.code !== 'BUNDLE_END') return
    const initial = face === 'host' ? !hostBuilt : !clientBuilt
    if (face === 'host') {
      hostBuilt = true
      setState({ hostBuild: 'ok' })
    } else {
      clientBuilt = true
      setState({ clientBuild: 'ok' })
    }
    emit({ type: 'build-success', face, initial })
    if (!initial && state.dshProcess === 'running') {
      if (face === 'client') {
        emit({ type: 'client-rebuilt' })
      } else if (project.dev.hostRestart === 'auto') {
        await restart()
      } else {
        setState({ hostRestartRequired: true })
        emit({ type: 'host-restart-required' })
      }
    }
    await startInitialChild()
  }

  const attachWatcher = async (face: 'host' | 'client'): Promise<void> => {
    try {
      const created = face === 'host'
        ? await (options.hostWatcher ?? (async (opts: BuildHostOptions): Promise<DevWatcher> => startHostWatcher({ ...opts, watch: true } as BuildHostOptions)))(buildPaths.host!)
        : await (options.clientWatcher ?? (async (opts: BuildClientOptions): Promise<DevWatcher> => startClientWatcher({ ...opts, watch: true } as BuildClientOptions)))(buildPaths.client!)
      watchers[face] = created
      created.on('event', event => { void handleBuildEvent(face, event).catch(error => {
        const item = diagnostic('DSHX4405', `${face} watcher failed: ${errorMessage(error)}`, project.packageFile, 'Close and restart the development session.')
        emitDiagnostic(item)
      }) })
    } catch (error) {
      const item = diagnostic('DSHX4405', `Failed to start ${face} watcher: ${errorMessage(error)}`, project.packageFile, 'Fix the compiler configuration, then restart the development session.')
      emitDiagnostic(item)
      throw new DshxError(item.code, item.message, { cause: error, file: item.file, hint: item.hint })
    }
  }

  const session: DevSession = {
    get state() { return state },
    get diagnostics() { return diagnostics },
    on<T extends DevEvent['type']>(
      eventOrListener: T | ((event: DevEvent) => void),
      typedListener?: (event: Extract<DevEvent, { type: T }>) => void,
    ) {
      const listener = typeof eventOrListener === 'function'
        ? eventOrListener
        : (event: DevEvent): void => {
            if (event.type === eventOrListener) typedListener?.(event as Extract<DevEvent, { type: T }>)
          }
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    restart,
    async close() {
      if (closed) return
      closed = true
      await Promise.all(Object.values(watchers).filter((watcher): watcher is DevWatcher => watcher !== undefined).map(async watcher => {
        try {
          await watcher.close()
        } catch (error) {
          emitDiagnostic(diagnostic('DSHX4405', `Failed to close a ${watcher === watchers.host ? 'Host' : 'Client'} watcher: ${errorMessage(error)}`, project.packageFile, 'Check for stale file watchers and restart the session.'))
        }
      }))
      await stopDsh()
      await childStart?.catch(() => undefined)
      await restartChain.catch(() => undefined)
      await stopDsh()
    },
  }

  emit({ type: 'state', state })
  try {
    if (buildPaths.host !== undefined) await attachWatcher('host')
    if (buildPaths.client !== undefined) await attachWatcher('client')
  } catch (error) {
    closed = true
    await Promise.all(Object.values(watchers).map(watcher => watcher?.close().catch(() => undefined)))
    throw error
  }
  await startInitialChild()
  return session
}
