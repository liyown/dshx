/** Build-time protocol values verified against one DSH release. */
export interface DshCompatibility {
  readonly version: string
  readonly nodeRange: string
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
