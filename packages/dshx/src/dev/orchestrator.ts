import { execa } from 'execa'
import { resolve } from 'node:path'
import type { BuildClientOptions } from '../compiler/client/build.js'
import { watchClient } from '../compiler/client/build.js'
import type { BuildHostOptions } from '../compiler/host/build.js'
import { watchHost } from '../compiler/host/build.js'
import { DshxError } from '../diagnostics.js'
import type { DshxDiagnostic } from '../diagnostics.js'
import { resolveDshxConfig } from '../config/resolve.js'
import { ensureProjectProfile } from '../profile/orchestrator.js'
import { watchProjectFiles } from './project-watcher.js'
import type { DevBuildEvent, DevChildProcess, DevEvent, DevProjectWatcher, DevSession, DevSessionOptions, DevState, DevWatcher } from './types.js'
import type { ResolvedDshxConfig } from '../config/types.js'

const DEFAULT_STOP_TIMEOUT_MS = 3_000

interface CompilerWatcherGroup {
  readonly generation: number
  readonly watchers: { host?: DevWatcher; client?: DevWatcher }
  readonly pending: Array<{ readonly face: 'host' | 'client'; readonly event: DevBuildEvent }>
  active: boolean
  closed: boolean
  eventChain: Promise<void>
}

function diagnostic(code: string, message: string, file: string, hint: string): DshxDiagnostic {
  return { code, severity: 'error', message, file, hint }
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  return String(error)
}

function clientManifestArray(project: ResolvedDshxConfig, field: 'external' | 'inject'): readonly string[] {
  const dsh = project.manifest.dsh
  if (typeof dsh !== 'object' || dsh === null || Array.isArray(dsh)) return []
  const client = (dsh as Record<string, unknown>).client
  if (typeof client !== 'object' || client === null || Array.isArray(client)) return []
  const value = (client as Record<string, unknown>)[field]
  return Array.isArray(value) && value.every(item => typeof item === 'string') ? value : []
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
    return Promise.reject(
      new DshxError('DSHX4401', 'Failed to start the DSH process.', {
        file: project.packageFile,
        hint: 'Install @deepseek-ai/dsh in the project or make the official dsh command available on PATH, then retry.',
      }),
    )
  }
  void subprocess.catch(() => undefined)
  return Promise.resolve(child as unknown as DevChildProcess)
}

function buildOptions(
  project: ResolvedDshxConfig,
  compatibility: import('../compat/types.js').DshCompatibility,
): {
  host?: BuildHostOptions
  client?: BuildClientOptions
} {
  return {
    ...(project.hostEntry === undefined
      ? {}
      : {
          host: {
            packageId: project.packageId,
            logicalName: project.name,
            root: project.root,
            entry: project.hostEntry,
            outDir: project.outDir,
            sourcemap: project.build.sourcemap,
            declarations: project.build.declarations ?? true,
            ...(project.hostVitePlugins === undefined ? {} : { vite: { plugins: project.hostVitePlugins } }),
            compatibility,
          },
        }),
    ...(project.clientEntry === undefined
      ? {}
      : {
          client: {
            packageId: project.packageId,
            logicalName: project.name,
            root: project.root,
            entry: project.clientEntry,
            outDir: project.outDir,
            sourcemap: project.build.sourcemap,
            declarations: project.build.declarations ?? true,
            ...(project.clientVitePlugins === undefined ? {} : { vite: { plugins: project.clientVitePlugins } }),
            external: clientManifestArray(project, 'external'),
            inject: clientManifestArray(project, 'inject'),
            compatibility,
          },
        }),
  }
}

function projectInputs(project: ResolvedDshxConfig): readonly string[] {
  return [
    ...new Set([
      resolve(project.root, 'dshx.config.ts'),
      project.packageFile,
      ...(project.configFile === undefined ? [] : [project.configFile]),
      ...project.configDependencies,
    ]),
  ]
}

/** Start a coordinated Host/Client watch build and selected DSH process. */
export async function startDevSession(project: ResolvedDshxConfig, options: DevSessionOptions = {}): Promise<DevSession> {
  const environment = { ...process.env, ...options.profile?.env, ...options.env }
  const profileOptions = { ...options.profile, env: environment }
  const ensureProfile = options.ensureProfile ?? ensureProjectProfile
  let activeProject = project
  let activeProfile = options.preparedProfile ?? (await ensureProfile(project, profileOptions))
  const initialBuildPaths = buildOptions(project, activeProfile.dsh.compatibility)
  const listeners = new Set<(event: DevEvent) => void>()
  const diagnostics: DshxDiagnostic[] = [...activeProfile.diagnostics]
  let activeWatchers: CompilerWatcherGroup | undefined
  let projectWatcher: DevProjectWatcher | undefined
  let activeGeneration = 0
  let child: DevChildProcess | undefined
  let childStart: Promise<void> | undefined
  let closed = false
  let transitioning = false
  let restartChain: Promise<void> = Promise.resolve()
  let reloadCompletion: Promise<void> = Promise.resolve()
  let reloadRunning = false
  let reloadPending = false
  let reloadChangedFile = project.configFile ?? project.packageFile
  let hostBuilt = activeProject.hostEntry === undefined
  let clientBuilt = activeProject.clientEntry === undefined
  let initialDshAttempted = false
  const ignoredExit = new WeakSet<object>()
  const observedExit = new WeakSet<object>()
  let state: DevState = {
    hostBuild: activeProject.hostEntry === undefined ? 'idle' : 'building',
    clientBuild: activeProject.clientEntry === undefined ? 'idle' : 'building',
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
      new Promise<false>(resolve => {
        timer = setTimeout(() => resolve(false), timeout)
      }),
    ])
    if (timer !== undefined) clearTimeout(timer)
    if (!didExit) target.kill('SIGKILL')
  }

  const startChildNow = async (restarting = false): Promise<void> => {
    if (closed || transitioning || child !== undefined || state.dshProcess === 'starting' || !hostBuilt || !clientBuilt) return
    const childProject = activeProject
    const childProfile = activeProfile
    setState({ dshProcess: 'starting', hostRestartRequired: false })
    // `--open` is a DSHX-only policy flag. rc.2 opens the browser when no
    // `--no-open` flag is present, but rejects an explicit `--open` argument.
    const requestedDshArgs = options.dshArgs ?? []
    const forwardedDshArgs = requestedDshArgs.filter(arg => arg !== '--open')
    const args = [
      '--profile',
      childProfile.profile,
      ...(childProfile.profile === 'web' && !requestedDshArgs.includes('--open') && !forwardedDshArgs.includes('--no-open') ? ['--no-open'] : []),
      ...forwardedDshArgs,
    ]
    const childEnvironment = options.inspectBridge === true ? { ...environment, DSHX_INSPECT_BRIDGE: '1' } : environment
    try {
      const childFactory =
        options.child ?? ((projectValue, childArgs, childEnv) => childFromExeca(projectValue, childArgs, childEnv, childProfile.dsh.executable ?? 'local'))
      const started = await childFactory(childProject, args, childEnvironment)
      if (closed) {
        await stopChild(started)
        return
      }
      child = started
      started.on('error', error => {
        if (ignoredExit.has(started as object) || observedExit.has(started as object)) return
        ignoredExit.add(started as object)
        if (child === started) child = undefined
        const item = diagnostic(
          restarting ? 'DSHX4404' : 'DSHX4401',
          `DSH process failed to start: ${errorMessage(error)}`,
          childProject.packageFile,
          'Install DSH locally or make the official dsh command available on PATH, then retry.',
        )
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
          childProject.packageFile,
          'Inspect the DSH stderr output, then call restart() after fixing the issue.',
        )
        setState({ dshProcess: 'failed' })
        emit({ type: 'dsh-exit', code, signal, diagnostic: item })
        emitDiagnostic(item)
      })
      setState({ dshProcess: 'running' })
    } catch (error) {
      const item = diagnostic(
        restarting ? 'DSHX4404' : 'DSHX4401',
        `Failed to start DSH process: ${errorMessage(error)}`,
        childProject.packageFile,
        'Install DSH locally or make the official dsh command available on PATH, then retry.',
      )
      setState({ dshProcess: 'failed' })
      emitDiagnostic(item)
    }
  }

  const startChild = (restarting = false): Promise<void> => {
    if (childStart !== undefined) return childStart
    const operation = startChildNow(restarting)
    childStart = operation
    void operation.then(
      () => {
        if (childStart === operation) childStart = undefined
      },
      () => {
        if (childStart === operation) childStart = undefined
      },
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
    if (closed || transitioning) return
    setState({ hostRestartRequired: false })
    await stopDsh()
    await startChild(true)
  }

  const restart = (): Promise<void> => {
    restartChain = restartChain.then(restartInternal, restartInternal)
    return restartChain
  }

  const handleBuildEvent = async (generation: number, face: 'host' | 'client', event: DevBuildEvent): Promise<void> => {
    if (closed || transitioning || generation !== activeGeneration) return
    if (event.code === 'START' || event.code === 'BUNDLE_START') {
      setState({ [face === 'host' ? 'hostBuild' : 'clientBuild']: 'building' })
      return
    }
    if (event.code === 'ERROR') {
      const file = face === 'host' ? (activeProject.hostEntry ?? activeProject.packageFile) : (activeProject.clientEntry ?? activeProject.packageFile)
      const item = diagnostic(
        'DSHX4406',
        `${face === 'host' ? 'Host' : 'Client'} build failed: ${errorMessage(event.error)}`,
        file,
        'Fix the source error; the watcher remains active and will retry on the next change.',
      )
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
      } else if (activeProject.dev.hostRestart === 'auto') {
        await restart()
      } else {
        setState({ hostRestartRequired: true })
        emit({ type: 'host-restart-required' })
      }
    }
    await startInitialChild()
  }

  const closeCompilerWatchers = async (group: CompilerWatcherGroup, reportErrors = true): Promise<void> => {
    if (group.closed) return
    group.active = false
    group.closed = true
    await group.eventChain.catch(() => undefined)
    await Promise.all(
      Object.entries(group.watchers).map(async ([face, watcher]) => {
        if (watcher === undefined) return
        try {
          await watcher.close()
        } catch (error) {
          if (!reportErrors) return
          emitDiagnostic(
            diagnostic(
              'DSHX4405',
              `Failed to close the ${face === 'host' ? 'Host' : 'Client'} watcher: ${errorMessage(error)}`,
              activeProject.packageFile,
              'Check for stale file watchers and restart the session.',
            ),
          )
        }
      }),
    )
  }

  const createCompilerWatchers = async (
    candidate: ResolvedDshxConfig,
    paths: ReturnType<typeof buildOptions>,
    generation: number,
  ): Promise<CompilerWatcherGroup> => {
    const group: CompilerWatcherGroup = {
      generation,
      watchers: {},
      pending: [],
      active: false,
      closed: false,
      eventChain: Promise.resolve(),
    }
    const attach = async (face: 'host' | 'client'): Promise<void> => {
      try {
        const created =
          face === 'host'
            ? await (options.hostWatcher ?? (async (opts: BuildHostOptions): Promise<DevWatcher> => watchHost(opts)))(paths.host!)
            : await (options.clientWatcher ?? (async (opts: BuildClientOptions): Promise<DevWatcher> => watchClient(opts)))(paths.client!)
        group.watchers[face] = created
        created.on('event', event => {
          if (group.closed) return
          if (!group.active) {
            group.pending.push({ face, event })
            return
          }
          const operation = handleBuildEvent(group.generation, face, event).catch(error => {
            emitDiagnostic(
              diagnostic('DSHX4405', `${face} watcher failed: ${errorMessage(error)}`, candidate.packageFile, 'Close and restart the development session.'),
            )
          })
          group.eventChain = Promise.all([group.eventChain, operation]).then(() => undefined)
        })
      } catch (error) {
        const item = diagnostic(
          'DSHX4405',
          `Failed to start ${face} watcher: ${errorMessage(error)}`,
          candidate.packageFile,
          'Fix the compiler configuration, then restart the development session.',
        )
        await closeCompilerWatchers(group, false)
        throw new DshxError(item.code, item.message, { cause: error, file: item.file, hint: item.hint })
      }
    }
    if (paths.host !== undefined) await attach('host')
    if (paths.client !== undefined) await attach('client')
    return group
  }

  const activateCompilerWatchers = (group: CompilerWatcherGroup): void => {
    group.active = true
    for (const { face, event } of group.pending.splice(0)) {
      const operation = handleBuildEvent(group.generation, face, event).catch(error => {
        emitDiagnostic(
          diagnostic(
            'DSHX4405',
            `Watcher failed while activating a new project configuration: ${errorMessage(error)}`,
            activeProject.packageFile,
            'Fix the source error or restart the development session.',
          ),
        )
      })
      group.eventChain = Promise.all([group.eventChain, operation]).then(() => undefined)
    }
  }

  const createProjectWatcher = async (candidate: ResolvedDshxConfig): Promise<DevProjectWatcher> => {
    const factory = options.projectWatcher ?? watchProjectFiles
    return factory(projectInputs(candidate), file => requestProjectReload(file))
  }

  const reloadProject = async (changedFile: string): Promise<void> => {
    let candidateWatchers: CompilerWatcherGroup | undefined
    let candidateProjectWatcher: DevProjectWatcher | undefined
    try {
      const resolver = options.resolveProject ?? resolveDshxConfig
      const candidate = await resolver({ cwd: activeProject.root })
      if (closed) return
      const candidateProfile = await ensureProfile(candidate, profileOptions)
      if (closed) return
      const candidateBuildPaths = buildOptions(candidate, candidateProfile.dsh.compatibility)
      const candidateGeneration = activeGeneration + 1
      candidateWatchers = await createCompilerWatchers(candidate, candidateBuildPaths, candidateGeneration)
      try {
        candidateProjectWatcher = await createProjectWatcher(candidate)
      } catch (error) {
        await closeCompilerWatchers(candidateWatchers, false)
        candidateWatchers = undefined
        throw error
      }
      if (closed) {
        await closeCompilerWatchers(candidateWatchers, false)
        await candidateProjectWatcher.close().catch(() => undefined)
        return
      }

      transitioning = true
      activeGeneration = candidateGeneration
      await restartChain.catch(() => undefined)
      if (closed) {
        transitioning = false
        await closeCompilerWatchers(candidateWatchers, false)
        await candidateProjectWatcher.close().catch(() => undefined)
        return
      }
      const previousWatchers = activeWatchers
      const previousProjectWatcher = projectWatcher
      if (previousWatchers !== undefined) await closeCompilerWatchers(previousWatchers)
      await stopDsh()
      await previousProjectWatcher?.close().catch(error => {
        emitDiagnostic(
          diagnostic(
            'DSHX4408',
            `Failed to close the previous project watcher: ${errorMessage(error)}`,
            activeProject.packageFile,
            'Check for stale file watchers and restart the session.',
          ),
        )
      })
      if (closed) {
        transitioning = false
        await closeCompilerWatchers(candidateWatchers, false)
        await candidateProjectWatcher.close().catch(() => undefined)
        return
      }

      activeProject = candidate
      activeProfile = candidateProfile
      activeWatchers = candidateWatchers
      projectWatcher = candidateProjectWatcher
      candidateWatchers = undefined
      candidateProjectWatcher = undefined
      hostBuilt = activeProject.hostEntry === undefined
      clientBuilt = activeProject.clientEntry === undefined
      initialDshAttempted = false
      setState({
        hostBuild: activeProject.hostEntry === undefined ? 'idle' : 'building',
        clientBuild: activeProject.clientEntry === undefined ? 'idle' : 'building',
        hostRestartRequired: false,
        dshProcess: 'stopped',
      })
      transitioning = false
      activateCompilerWatchers(activeWatchers)
      for (const item of candidateProfile.diagnostics) emitDiagnostic(item)
      await activeWatchers.eventChain
      await startInitialChild()
    } catch (error) {
      transitioning = false
      if (candidateWatchers !== undefined) await closeCompilerWatchers(candidateWatchers, false)
      await candidateProjectWatcher?.close().catch(() => undefined)
      if (closed) return
      const file = error instanceof DshxError && error.file !== undefined ? error.file : changedFile
      emitDiagnostic(
        diagnostic(
          'DSHX4407',
          `Project configuration reload failed; the last-good development session is still active: ${errorMessage(error)}`,
          file,
          'Fix the config, package manifest, or imported config dependency. DSHX will retry on the next watched change.',
        ),
      )
    }
  }

  const drainProjectReloads = async (): Promise<void> => {
    while (reloadPending && !closed) {
      reloadPending = false
      const changedFile = reloadChangedFile
      await reloadProject(changedFile)
    }
  }

  function requestProjectReload(file: string): void {
    if (closed) return
    reloadChangedFile = file
    reloadPending = true
    if (reloadRunning) return
    reloadRunning = true
    const operation = drainProjectReloads().finally(() => {
      reloadRunning = false
      if (reloadPending && !closed) requestProjectReload(reloadChangedFile)
    })
    reloadCompletion = operation
    void operation.catch(() => undefined)
  }

  const session: DevSession = {
    get state() {
      return state
    },
    get diagnostics() {
      return diagnostics
    },
    on<T extends DevEvent['type']>(eventOrListener: T | ((event: DevEvent) => void), typedListener?: (event: Extract<DevEvent, { type: T }>) => void) {
      const listener =
        typeof eventOrListener === 'function'
          ? eventOrListener
          : (event: DevEvent): void => {
              if (event.type === eventOrListener) typedListener?.(event as Extract<DevEvent, { type: T }>)
            }
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    restart,
    async close() {
      if (closed) return
      closed = true
      reloadPending = false
      await projectWatcher?.close().catch(error => {
        emitDiagnostic(
          diagnostic(
            'DSHX4408',
            `Failed to close the project watcher: ${errorMessage(error)}`,
            activeProject.packageFile,
            'Check for stale file watchers and restart the session.',
          ),
        )
      })
      await reloadCompletion.catch(() => undefined)
      if (activeWatchers !== undefined) await closeCompilerWatchers(activeWatchers)
      await stopDsh()
      await childStart?.catch(() => undefined)
      await restartChain.catch(() => undefined)
      await stopDsh()
    },
  }

  emit({ type: 'state', state })
  try {
    activeWatchers = await createCompilerWatchers(activeProject, initialBuildPaths, activeGeneration)
    projectWatcher = await createProjectWatcher(activeProject)
    activateCompilerWatchers(activeWatchers)
  } catch (error) {
    closed = true
    if (activeWatchers !== undefined) await closeCompilerWatchers(activeWatchers, false)
    await projectWatcher?.close().catch(() => undefined)
    if (error instanceof DshxError) throw error
    throw new DshxError('DSHX4408', `Failed to start the project configuration watcher: ${errorMessage(error)}`, {
      cause: error,
      file: activeProject.configFile ?? activeProject.packageFile,
      hint: 'Check file watcher permissions and restart the development session.',
    })
  }
  await startInitialChild()
  return session
}
