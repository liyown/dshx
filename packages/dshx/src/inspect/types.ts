import type { ResolvedDshxConfig } from '../config/types.js'
import type { DshCommandRunner, ProfileOrchestratorOptions, ProjectProfileLink, ResolvedDshInstallation } from '../profile/types.js'
import type { DshxDiagnostic } from '../diagnostics.js'

export type InspectTarget = 'slots' | 'tools' | 'services' | 'events'

export interface InspectSlotOptions {
  readonly root?: string
}

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

export interface ServiceSummary {
  readonly name: string
  readonly provider?: string
  readonly scope?: string
  readonly metadata?: Readonly<Record<string, unknown>>
}

export interface EventSummary {
  readonly name: string
  readonly provider?: string
  readonly metadata?: Readonly<Record<string, unknown>>
}

export interface InspectProvider {
  readonly listSlots: (options?: InspectSlotOptions) => Promise<readonly SlotSummary[]>
  readonly listTools: () => Promise<readonly ToolSummary[]>
  readonly listServices?: () => Promise<readonly ServiceSummary[]>
  readonly listEvents?: () => Promise<readonly EventSummary[]>
}

export interface InspectResult {
  readonly profile: string
  readonly target: InspectTarget
  readonly source: 'runtime'
  readonly items: readonly SlotSummary[] | readonly ToolSummary[] | readonly ServiceSummary[] | readonly EventSummary[]
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
  readonly slotRoot?: string
  readonly resolveDsh?: (project: ResolvedDshxConfig, options?: ProfileOrchestratorOptions) => Promise<ResolvedDshInstallation>
  readonly inspectProfile?: (project: ResolvedDshxConfig, options?: ProfileOrchestratorOptions) => Promise<ProjectProfileLink>
}
