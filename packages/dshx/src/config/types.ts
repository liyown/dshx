/** User-authored DSHX project exceptions. */
export interface DshxConfig {
  readonly name?: string
  readonly host?: string | false
  readonly client?: string | false
  readonly profile?: string
  readonly dev?: {
    readonly hostRestart?: 'manual' | 'auto'
  }
  readonly build?: {
    readonly sourcemap?: boolean
  }
  readonly compatibility?: {
    readonly allowUnsupported?: boolean
  }
}

/** Options controlling project-root discovery. */
export interface ResolveDshxConfigOptions {
  readonly cwd?: string
}

/** Fully normalized project metadata consumed by later DSHX stages. */
export interface ResolvedDshxConfig {
  readonly root: string
  readonly packageFile: string
  readonly configFile?: string
  readonly configDependencies: readonly string[]
  readonly packageId: string
  readonly name: string
  readonly hostEntry?: string
  readonly clientEntry?: string
  readonly outDir: string
  readonly profile: string
  readonly dev: {
    readonly hostRestart: 'manual' | 'auto'
  }
  readonly build: {
    readonly sourcemap: boolean
  }
  readonly compatibility: {
    readonly allowUnsupported: boolean
  }
  readonly manifest: Readonly<Record<string, unknown>>
}
