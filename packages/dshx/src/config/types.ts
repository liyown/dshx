import type { PluginOption } from 'vite'

/** The deliberately bounded Vite extension surface for one DSHX face. */
export interface DshxViteExtensions {
  readonly plugins?: readonly PluginOption[]
}

/** Enable and optionally relocate one conventional DSHX face. */
export interface DshxFaceConfig {
  readonly entry?: string
  readonly vite?: DshxViteExtensions
}

/** User-authored DSHX project exceptions. */
export interface DshxConfig {
  readonly name?: string
  readonly host?: false | DshxFaceConfig
  readonly client?: false | DshxFaceConfig
  readonly profile?: string
  readonly dev?: {
    readonly hostRestart?: 'manual' | 'auto'
  }
  readonly build?: {
    readonly sourcemap?: boolean
    readonly declarations?: boolean
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
  readonly hostVitePlugins?: readonly PluginOption[]
  readonly clientVitePlugins?: readonly PluginOption[]
  readonly outDir: string
  readonly profile: string
  readonly dev: {
    readonly hostRestart: 'manual' | 'auto'
  }
  readonly build: {
    readonly sourcemap: boolean
    readonly declarations?: boolean
  }
  readonly compatibility: {
    readonly allowUnsupported: boolean
  }
  readonly manifest: Readonly<Record<string, unknown>>
}
