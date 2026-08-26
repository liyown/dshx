import type { PluginOption } from 'vite'

/** A file materialized by one bounded DSHX face build. */
export interface BuildArtifact {
  readonly fileName: string
  readonly type: 'chunk' | 'asset' | 'declaration'
}

/** Stable, Vite-independent result returned by programmatic build APIs. */
export interface BuildReport {
  readonly face: 'host' | 'client'
  readonly entryFile: string
  readonly outDir: string
  readonly output: readonly BuildArtifact[]
}

/** Rollup/Rolldown watcher events normalized at the compiler boundary. */
export type BuildEvent =
  | { readonly code: 'START' | 'BUNDLE_START' | 'END' }
  | { readonly code: 'BUNDLE_END'; readonly duration?: number; readonly output?: readonly string[] }
  | { readonly code: 'ERROR'; readonly error: unknown }

/** Stable watcher surface returned by DSHX instead of the raw Vite result. */
export interface BuildWatcher {
  on(event: 'event', listener: (event: BuildEvent) => void): BuildWatcher
  close(): Promise<void>
}

/** Bounded Vite extension accepted by a programmatic face build. */
export interface ViteExtensionOptions {
  readonly plugins?: readonly PluginOption[]
}
