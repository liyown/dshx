/** Compatibility confidence for an installed DSH CLI. */
export type DshSupportStatus = 'verified' | 'compatible' | 'experimental' | 'unsupported'

/** Maintenance state for a compatibility generation in this DSHX release. */
export type DshCompatibilityLifecycle = 'active' | 'maintenance' | 'end-of-life'

/** Representative real-runtime verification boundaries for one compatibility generation. */
export interface DshVerifiedVersions {
  readonly minimum: string
  readonly latest: string
  /** Source tag used when a published npm artifact is not the verification basis. */
  readonly sourceTag?: string
}

/** Where the verified runtime bytes came from. */
export type DshVerificationSource = 'npm' | 'source'

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
  /** 0.2.x profiles expose ordered patch paths and launcher readiness. */
  readonly orderedPatchPaths?: boolean
  readonly launcherReady?: boolean
}

export interface DshInspectCompatibility {
  readonly targets: readonly ('slots' | 'tools' | 'services' | 'events' | 'configs')[]
  /** Legacy aggregate capability retained for adapters authored before target-specific providers. */
  readonly provider?: 'runtime' | 'unavailable'
  readonly providerByTarget?: Partial<Record<'slots' | 'tools' | 'services' | 'events' | 'configs', 'runtime' | 'unavailable'>>
  readonly bridge?: {
    readonly protocolVersion: 2
    readonly serviceProvider: string
    readonly eventProvider: string
    readonly toolProvider?: string
    readonly configProvider?: string
    readonly compositionScope?: boolean
  }
}

export interface DshConnectionCompatibility {
  readonly packageName: '@deepseek-ai/dsh-client-connection'
  readonly clientModule: '@deepseek-ai/dsh-client-connection/client'
  readonly protocolVersion: 2
  readonly hostRpc: boolean
  readonly clientRpc: boolean
  readonly hookDrivenCapabilityInference?: boolean
  /** RPC is peer-admitted; clients use generated ctx.remote namespaces. */
  readonly peerAdmission?: boolean
  readonly remoteNamespace?: 'remote'
}

/** Official Host contribution seams verified for one protocol generation. */
export interface DshHostContributionCompatibility {
  readonly commands: boolean
  readonly promptSections: boolean
  readonly promptContexts: boolean
  readonly settings: boolean
  /** DSH projects plugin Config schemas into Settings. */
  readonly settingsMode?: 'config'
}

export interface DshClientSettingsCompatibility {
  readonly packageName: '@deepseek-ai/dsh-client-ui-settings'
  readonly service: 'configForms'
  readonly hookDrivenCapabilityInference: boolean
  /** ConfigForm identity is the Host profile entry id. */
  readonly formIdentity?: 'entry-id'
}

/** Official Client conversation seams declared for one protocol generation. */
export interface DshClientConversationCompatibility {
  readonly rendererPackageName: '@deepseek-ai/dsh-client-ui-conversation'
  readonly eventService: 'uiConversation'
  readonly slotService: 'slots'
  /** Contributions register through ctx.uiConversation.events.register(). */
  readonly registrationMethod?: 'uiConversation.events.register'
  readonly componentContributions: boolean
  readonly verification: 'experimental' | 'verified'
}

/** Official durable Session seam facts declared for one protocol generation. */
export interface DshSessionCompatibility {
  /** Whether out-of-tree required durable event types can be registered before persistence restore. */
  readonly customDurableEventVocabulary: boolean
  /** Published session format consumed by this generation. */
  readonly formatVersion?: number
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
  /** Distinguishes npm-published verification from a source-tag build. */
  readonly verificationSource?: DshVerificationSource
  readonly nodeRange: string
  readonly profile: DshProfileCompatibility
  readonly runtimePlugins?: readonly DshxRuntimePluginSpec[]
  readonly inspect?: DshInspectCompatibility
  readonly connection?: DshConnectionCompatibility
  readonly hostContributions?: DshHostContributionCompatibility
  readonly session?: DshSessionCompatibility
  readonly client: {
    readonly platformModules: readonly string[]
    readonly preloadedExternals: readonly string[]
    readonly settings?: DshClientSettingsCompatibility
    readonly conversation?: DshClientConversationCompatibility
    readonly manifest: {
      readonly platform: 'web'
      readonly moduleRequestsField: 'external'
      readonly packageEdgesField: 'inject'
      readonly manifestVersion?: 1
      readonly bundlePatch?: 'single' | 'array'
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
