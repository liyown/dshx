/** Compatibility confidence for an installed DSH CLI. */
export type DshSupportStatus = 'verified' | 'compatible-range' | 'unsupported'

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

/** Build/runtime protocol values owned by one DSH compatibility generation. */
export interface DshCompatibility {
  readonly id: string
  readonly protocolGeneration: string
  readonly version: string
  readonly dshRange: string
  readonly verifiedVersions: readonly string[]
  readonly nodeRange: string
  readonly profile: DshProfileCompatibility
  readonly runtimePlugins?: readonly DshxRuntimePluginSpec[]
  readonly inspect?: DshInspectCompatibility
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
