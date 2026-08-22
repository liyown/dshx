import type { BuildClientOptions } from '../compiler/client/build.js'
import type { BuildHostOptions, DshxBuildEvent } from '../compiler/host/build.js'
import type { PreparedProjectProfile, ProfileOrchestratorOptions } from '../profile/types.js'
import type { ResolvedDshxConfig } from '../config/types.js'
import type { DshxDiagnostic } from '../diagnostics.js'

/** Build/process state exposed by one development session. */
export interface DevState {
  readonly hostBuild: 'idle' | 'building' | 'ok' | 'error'
  readonly clientBuild: 'idle' | 'building' | 'ok' | 'error'
  readonly hostRestartRequired: boolean
  readonly dshProcess: 'stopped' | 'starting' | 'running' | 'failed'
}

/** Normalized compiler event consumed by the dev state machine. */
export type DevBuildEvent = DshxBuildEvent

/** Minimal watcher seam used by the session and its tests. */
export interface DevWatcher {
  on(event: 'event', listener: (event: DevBuildEvent) => void): DevWatcher
  close(): Promise<void>
}

/** Minimal child-process seam used by the session and its tests. */
export interface DevChildProcess {
  on(event: 'exit', listener: (code: number | null, signal: string | null) => void): DevChildProcess
  on(event: 'error', listener: (error: unknown) => void): DevChildProcess
  kill(signal?: NodeJS.Signals): boolean
}

/** Events emitted by a development session. */
export type DevEvent =
  | { readonly type: 'state'; readonly state: DevState }
  | { readonly type: 'diagnostic'; readonly diagnostic: DshxDiagnostic }
  | { readonly type: 'build-success'; readonly face: 'host' | 'client'; readonly initial: boolean }
  | { readonly type: 'client-rebuilt' }
  | { readonly type: 'host-restart-required' }
  | { readonly type: 'build-error'; readonly face: 'host' | 'client'; readonly error: unknown; readonly diagnostic: DshxDiagnostic }
  | { readonly type: 'dsh-exit'; readonly code: number | null; readonly signal: string | null; readonly diagnostic: DshxDiagnostic }

/** Dev session controls owned by the later CLI layer. */
export interface DevSession {
  readonly state: DevState
  readonly diagnostics: readonly DshxDiagnostic[]
  on(listener: (event: DevEvent) => void): () => void
  on<T extends DevEvent['type']>(event: T, listener: (event: Extract<DevEvent, { type: T }>) => void): () => void
  restart(): Promise<void>
  close(): Promise<void>
}

/** Options for starting a dev process without taking over terminal input. */
export interface DevSessionOptions {
  /** Ask the DSH child to expose its local read-only Inspect bridge. */
  readonly inspectBridge?: boolean
  readonly env?: Readonly<NodeJS.ProcessEnv>
  readonly dshArgs?: readonly string[]
  readonly profile?: ProfileOrchestratorOptions
  readonly preparedProfile?: PreparedProjectProfile
  readonly ensureProfile?: (
    project: ResolvedDshxConfig,
    options: ProfileOrchestratorOptions,
  ) => Promise<PreparedProjectProfile>
  readonly hostWatcher?: (options: BuildHostOptions) => Promise<DevWatcher>
  readonly clientWatcher?: (options: BuildClientOptions) => Promise<DevWatcher>
  readonly child?: (
    project: ResolvedDshxConfig,
    args: readonly string[],
    env: NodeJS.ProcessEnv,
  ) => Promise<DevChildProcess>
  readonly stopTimeoutMs?: number
}
