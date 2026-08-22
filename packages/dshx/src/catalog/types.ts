import type { ResolvedDshxConfig } from '../config/types.js'
import type { DshCommandRunner, ProfileOrchestratorOptions, ResolvedDshInstallation } from '../profile/types.js'
import type { DshxDiagnostic } from '../diagnostics.js'
import type { EventSummary, ServiceSummary, SlotSummary, ToolSummary } from '../inspect/types.js'
import type { InspectTarget } from '../inspect/types.js'

export type CatalogItem = SlotSummary | ToolSummary | ServiceSummary | EventSummary

export interface CatalogProvider {
  readonly listSlots: () => Promise<readonly SlotSummary[]>
  readonly listTools: () => Promise<readonly ToolSummary[]>
  readonly listServices: () => Promise<readonly ServiceSummary[]>
  readonly listEvents: () => Promise<readonly EventSummary[]>
}

export interface CatalogResult {
  readonly profile: string
  readonly target: InspectTarget
  readonly source: 'offline'
  readonly items: readonly CatalogItem[]
  readonly diagnostics: readonly DshxDiagnostic[]
  readonly cause?: unknown
  readonly dsh?: ResolvedDshInstallation
}

export interface CatalogOptions {
  readonly provider?: CatalogProvider
  readonly runner?: DshCommandRunner
  readonly env?: Readonly<NodeJS.ProcessEnv>
  readonly executable?: 'local' | 'global'
  readonly resolveDsh?: (project: ResolvedDshxConfig, options?: ProfileOrchestratorOptions) => Promise<ResolvedDshInstallation>
}
