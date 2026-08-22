/** Compatibility confidence for an installed DSH CLI. */
export type DshSupportStatus = 'verified' | 'compatible-range' | 'unsupported'

export interface DshProfileCompatibility {
  readonly listCommand: 'plugin-list-json'
  readonly addCommand: 'plugin-add'
}

export interface DshInspectCompatibility {
  readonly targets: readonly ('slots' | 'tools' | 'services' | 'events')[]
  readonly provider: 'runtime' | 'unavailable'
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
