/** Compatibility confidence for an installed DSH CLI. */
export type DshSupportStatus = 'verified' | 'compatible' | 'experimental' | 'unsupported'

/** Maintenance state for a compatibility generation in this DSHX release. */
export type DshCompatibilityLifecycle = 'active' | 'maintenance' | 'end-of-life'

/** Representative real-runtime verification boundaries for one compatibility generation. */
export interface DshVerifiedVersions {
  readonly minimum: string
  readonly latest: string
}

export interface DshxRuntimePluginSpec {
  readonly id: string
  readonly packageName: '@deepseek-ai/dsh-cordis-host-runner' | '@deepseek-ai/dsh-tool-cordis' | (string & {})
  readonly load: 'default' | 'module'
  readonly provides: readonly string[]
  readonly optional: boolean
}

export interface DshProfileCompatibility {
  readonly listCommand: 'plugin-list-json'
  readonly addCommand: 'plugin-add'
}

export interface DshInspectCompatibility {
  readonly targets: readonly ('slots' | 'tools' | 'services' | 'events')[]
  /** Legacy aggregate capability retained for adapters authored before target-specific providers. */
  readonly provider?: 'runtime' | 'unavailable'
  readonly providerByTarget?: Partial<Record<'slots' | 'tools' | 'services' | 'events', 'runtime' | 'unavailable'>>
  readonly bridge?: {
    readonly protocolVersion: 1
    readonly serviceProvider: string
    readonly eventProvider: string
  }
}

export interface DshConnectionCompatibility {
  readonly packageName: '@deepseek-ai/dsh-client-connection'
  readonly clientModule: '@deepseek-ai/dsh-client-connection/client'
  readonly protocolVersion: 1
  readonly hostRpc: boolean
  readonly clientRpc: boolean
  readonly defaultAuthority: 'loopback'
}

/** Official Host contribution seams verified for one protocol generation. */
export interface DshHostContributionCompatibility {
  readonly commands: boolean
  readonly promptSections: boolean
  readonly promptContexts: boolean
}

/** Build/runtime protocol values owned by one DSH compatibility generation. */
export interface DshCompatibility {
  readonly id: string
  readonly protocolGeneration: string
  readonly lifecycle: DshCompatibilityLifecycle
  /** DSH version whose contract originally defined this adapter. */
  readonly version: string
  readonly dshRange: string
  readonly verified: DshVerifiedVersions
  /** Exact DSH versions that have completed the real-runtime scenario. */
  readonly verifiedVersions: readonly string[]
  readonly nodeRange: string
  readonly profile: DshProfileCompatibility
  readonly runtimePlugins?: readonly DshxRuntimePluginSpec[]
  readonly inspect?: DshInspectCompatibility
  readonly connection?: DshConnectionCompatibility
  readonly hostContributions?: DshHostContributionCompatibility
  readonly client: {
    readonly platformModules: readonly string[]
    readonly preloadedExternals: readonly string[]
    readonly manifest: {
      readonly platform: 'web'
      readonly moduleRequestsField: 'external'
      readonly packageEdgesField: 'inject'
    }
  }
}

/** How one public plugin peer range relates to the adapters in this DSHX release. */
export type DshDeclaredRangeStatus = 'single-generation' | 'spans-generations' | 'partially-supported' | 'unsupported' | 'invalid'

export interface DshDeclaredRangeAnalysis {
  readonly range: string
  readonly status: DshDeclaredRangeStatus
  readonly compatibilities: readonly DshCompatibility[]
  readonly compatibility?: DshCompatibility
}

/** Project-level compatibility facts shared by build, dev, and check. */
export interface DshProjectCompatibilityAssessment {
  readonly declaredRange?: string
  readonly developmentSpecifier?: string
  readonly rangeAnalysis?: DshDeclaredRangeAnalysis
  readonly installedVersion?: string
  readonly installedWithinDeclaredRange?: boolean
  readonly resolution?: DshCompatibilityResolution
  readonly compatibility: DshCompatibility
  readonly capabilities: readonly string[]
}

export interface DshCompatibilityResolution {
  readonly compatibility: DshCompatibility
  readonly support: DshSupportStatus
}

export interface DshCompatibilityMatrixEntry {
  readonly generation: string
  readonly adapterId: string
  readonly role: 'minimum' | 'latest'
  readonly version: string
}
