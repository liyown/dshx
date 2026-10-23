import type { Readable, Writable } from 'node:stream'
import type { detectInstalledDshVersion } from '../compat/index.js'
import type { buildClient, buildHost } from '../compiler/index.js'
import type { resolveDshxConfig } from '../config/resolve.js'
import type { startDevSession } from '../dev/index.js'
import type { inspectBridgeStatus } from '../inspect/bridge.js'
import type { inspectProjectComposition } from '../inspect/index.js'
import type { ensureProjectProfile, inspectProjectProfile, resolveDshInstallation } from '../profile/index.js'
import type {
  applyManifestRepairPlan,
  checkMigrationDiagnostics,
  checkPackageTargets,
  checkProjectManifest,
  createManifestRepairPlan,
  rollbackManifestRepairPlan,
  typecheckProject,
} from '../project/index.js'
import type { inspectRuntimePlugins } from '../runtime-status.js'
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

export interface CliIO {
  readonly stdin: Readable & { isTTY?: boolean; setRawMode?: (mode: boolean) => void }
  readonly stdout: Writable
  readonly stderr: Writable
}

/**
 * Every boundary a command crosses, injectable. A command reads this and never
 * imports a process, a signal handler or a filesystem directly, which is what
 * lets the CLI suite run a whole command in-process.
 */
export interface CliRuntime {
  readonly resolveConfig?: typeof resolveDshxConfig
  readonly detectInstalledDsh?: typeof detectInstalledDshVersion
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
  /** Subscribes to a stop signal and returns the way to unsubscribe. */
  readonly onProcessSignal?: (signal: 'SIGINT' | 'SIGTERM', handler: () => void) => () => void
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
