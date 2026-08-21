import type { ResolvedDshxConfig } from '../config/types.js'
import type { DshCommandRunner, ProfileOrchestratorOptions, ProjectProfileLink, ResolvedDshInstallation } from '../profile/types.js'
import type { DshxDiagnostic } from '../diagnostics.js'

export type InspectTarget = 'slots' | 'tools'

export interface SlotSummary {
  readonly name: string
  readonly provider?: string
  readonly kind?: string
  readonly scope?: string
  readonly metadata?: Readonly<Record<string, unknown>>
}

export interface ToolSummary {
  readonly name: string
  readonly provider?: string
  readonly description?: string
  readonly metadata?: Readonly<Record<string, unknown>>
}

export interface InspectProvider {
  readonly listSlots: () => Promise<readonly SlotSummary[]>
  readonly listTools: () => Promise<readonly ToolSummary[]>
}

export interface InspectResult {
  readonly profile: string
  readonly target: InspectTarget
  readonly source: 'runtime'
  readonly items: readonly SlotSummary[] | readonly ToolSummary[]
  readonly diagnostics: readonly DshxDiagnostic[]
  /** Original provider/DSH failure, exposed only to verbose CLI output. */
  readonly cause?: unknown
  readonly dsh?: ResolvedDshInstallation
  readonly profileLink?: ProjectProfileLink
}

export interface InspectOptions {
  readonly provider?: InspectProvider
  readonly runner?: DshCommandRunner
  readonly env?: Readonly<NodeJS.ProcessEnv>
  readonly executable?: 'local' | 'global'
  readonly resolveDsh?: (project: ResolvedDshxConfig, options?: ProfileOrchestratorOptions) => Promise<ResolvedDshInstallation>
  readonly inspectProfile?: (project: ResolvedDshxConfig, options?: ProfileOrchestratorOptions) => Promise<ProjectProfileLink>
}
