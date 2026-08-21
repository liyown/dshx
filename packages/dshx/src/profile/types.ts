import type { DshCompatibility } from '../compat/types.js'
import type { ResolvedDshxConfig } from '../config/types.js'
import type { DshxDiagnostic } from '../diagnostics.js'

/** Compatibility confidence for one installed DSH CLI. */
export type DshSupportStatus = 'verified' | 'compatible-range' | 'unsupported'

/** Captured result of one finite official DSH CLI command. */
export interface DshCommandResult {
  readonly exitCode?: number
  readonly stdout: string
  readonly stderr: string
  readonly failureCode?: string
  readonly cause?: unknown
  /** Which executable resolved the command. The default runner uses project-local first. */
  readonly executable?: 'local' | 'global'
}

/** Execution context supplied to an injectable DSH command runner. */
export interface DshCommandRunOptions {
  readonly cwd: string
  readonly env: NodeJS.ProcessEnv
  readonly timeoutMs: number
  readonly executable?: 'local' | 'global'
}

/** Testable command seam whose arguments begin after the DSH executable. */
export type DshCommandRunner = (
  args: readonly string[],
  options: DshCommandRunOptions,
) => Promise<DshCommandResult>

/** Internal overrides for profile orchestration and isolated compatibility smoke tests. */
export interface ProfileOrchestratorOptions {
  readonly env?: Readonly<NodeJS.ProcessEnv>
  readonly runner?: DshCommandRunner
  readonly executable?: 'local' | 'global'
}

/** Installed DSH version and the adapter DSHX will use for it. */
export interface ResolvedDshInstallation {
  readonly version: string
  readonly executable?: 'local' | 'global'
  readonly support: DshSupportStatus
  readonly compatibility: DshCompatibility
  readonly diagnostics: readonly DshxDiagnostic[]
}

/** Read-only link state reported by the official profile plugin command. */
export type ProjectProfileLink =
  | {
    readonly state: 'absent'
    readonly profile: string
    readonly packageId: string
    readonly root: string
  }
  | {
    readonly state: 'linked'
    readonly profile: string
    readonly packageId: string
    readonly root: string
  }

/** Profile state ready for a later dev process manager. */
export interface PreparedProjectProfile {
  readonly profile: string
  readonly packageId: string
  readonly root: string
  readonly dsh: ResolvedDshInstallation
  readonly link: 'existing' | 'added'
  readonly diagnostics: readonly DshxDiagnostic[]
}

/** Inputs shared by the profile operations. */
export type ProfileProject = ResolvedDshxConfig
