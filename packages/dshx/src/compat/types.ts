/** Compatibility confidence for an installed DSH CLI. */
export type DshSupportStatus = 'verified' | 'compatible' | 'experimental' | 'unsupported'

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

/** Build/runtime protocol values owned by one DSH compatibility generation. */
export interface DshCompatibility {
  readonly id: string
  readonly protocolGeneration: string
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
