import type { ResolvedDshxConfig } from '../config/types.js'
import type { DshCommandRunner, ProfileOrchestratorOptions, ProjectProfileLink, ResolvedDshInstallation } from '../profile/types.js'
import type { DshxDiagnostic } from '../diagnostics.js'

export type InspectTarget = 'slots' | 'tools' | 'services' | 'events' | 'configs'

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

export interface ConfigSummary {
  readonly name: string
  readonly provider?: string
  readonly patchId?: string
  readonly status?: string
  readonly metadata?: Readonly<Record<string, unknown>>
}

/**
 * Runtime Inspect provider. Every method is optional because DSH exposes
 * different first-party providers per protocol generation; callers receive
 * DSHX3204 when they ask for a target the selected provider does not serve.
 */
export interface InspectProvider {
  readonly listSlots?: (options?: InspectSlotOptions) => Promise<readonly SlotSummary[]>
  readonly listTools?: () => Promise<readonly ToolSummary[]>
  readonly listServices?: () => Promise<readonly ServiceSummary[]>
  readonly listEvents?: () => Promise<readonly EventSummary[]>
  readonly listConfigs?: () => Promise<readonly ConfigSummary[]>
}

export interface InspectResult {
  readonly profile: string
  readonly target: InspectTarget
  readonly source: 'runtime'
  readonly items: readonly SlotSummary[] | readonly ToolSummary[] | readonly ServiceSummary[] | readonly EventSummary[] | readonly ConfigSummary[]
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
