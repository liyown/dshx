import { realpath } from 'node:fs/promises'
import { isAbsolute, relative, resolve } from 'node:path'
import { build, type InlineConfig } from 'vite'
import { RC8_COMPATIBILITY } from '../../compat/rc8.js'
import { DshxError } from '../../diagnostics.js'
import { clientCssPlugin } from './css.js'
import { clientGuardPlugin, singleClientChunkPlugin } from './guards.js'

/** Options for producing one rc.8 lazy-CJS client bundle. */
export interface BuildClientOptions {
  readonly packageId: string
  readonly entry: string
  readonly outDir: string
  readonly root?: string
  readonly sourcemap?: boolean
  readonly watch?: boolean
  readonly external?: readonly string[]
}

/** Vite result for a one-shot build or an active watch build. */
export type ClientBuildResult = Exclude<Awaited<ReturnType<typeof build>>, readonly unknown[]>

/** Minimal watcher contract shared with the internal dev process orchestrator. */
export interface DshxBuildWatcher {
  on(event: 'event', listener: (event: DshxBuildEvent) => void): DshxBuildWatcher
  close(): Promise<void>
}

/** Rollup/Rolldown watcher events normalized at the compiler boundary. */
export type DshxBuildEvent =
  | { readonly code: 'START' | 'BUNDLE_START' | 'END' }
  | { readonly code: 'BUNDLE_END'; readonly duration?: number; readonly output?: readonly string[] }
  | { readonly code: 'ERROR'; readonly error: unknown }

function isInside(parent: string, child: string): boolean {
  const path = relative(parent, child)
  return path !== '' && !path.startsWith('..') && !isAbsolute(path)
}

async function resolveOptions(options: BuildClientOptions) {
  if (options.packageId.trim() === '') {
    throw new DshxError('DSHX1001', 'Client package id must not be empty.')
  }
  const root = await realpath(resolve(options.root ?? process.cwd()))
  const unresolvedEntry = resolve(root, options.entry)
  const outDir = resolve(root, options.outDir)
  const entry = await realpath(unresolvedEntry).catch((cause: unknown) => {
    throw new DshxError('DSHX1002', `Client entry does not exist: ${unresolvedEntry}`, { cause, file: unresolvedEntry })
  })
  if (outDir === root || isInside(outDir, entry)) {
    throw new DshxError(
      'DSHX1003',
      `Client output directory ${outDir} would overwrite project sources.`,
      { hint: 'Choose a dedicated output directory such as dist.' },
    )
  }
  return { root, entry, outDir }
}

function clientConfig(paths: Awaited<ReturnType<typeof resolveOptions>>, options: BuildClientOptions): InlineConfig {
  const externals = new Set([
    ...RC8_COMPATIBILITY.client.platformModules,
    ...RC8_COMPATIBILITY.client.preloadedExternals,
    ...(options.external ?? []),
  ])
  return {
    root: paths.root,
    configFile: false,
    appType: 'custom',
    mode: 'production',
    logLevel: 'error',
    plugins: [
      clientGuardPlugin(externals, options.packageId),
      clientCssPlugin(options.packageId, paths.root),
      singleClientChunkPlugin(),
    ],
    define: {
      'process.env.NODE_ENV': JSON.stringify('production'),
      'import.meta.env.MODE': JSON.stringify('production'),
      'import.meta.env': JSON.stringify({ MODE: 'production' }),
    },
    oxc: {
      jsx: {
        runtime: 'automatic',
        development: false,
      },
    },
    build: {
      target: 'es2024',
      outDir: paths.outDir,
      emptyOutDir: false,
      copyPublicDir: false,
      minify: false,
      sourcemap: options.sourcemap ?? true,
      watch: null,
      lib: {
        entry: paths.entry,
        formats: ['cjs'],
        fileName: () => 'client.js',
      },
      rollupOptions: {
        external: source => externals.has(source),
        output: {
          format: 'cjs',
          entryFileNames: 'client.js',
          codeSplitting: false,
          exports: 'named',
          banner: `window.__ModuleLoader__.load({ id: ${JSON.stringify(options.packageId)}, factory: (require) => {`,
          intro: 'var module = { exports: {} }; var exports = module.exports;',
          footer: 'return module.exports; } });',
        },
      },
    },
  }

}

function normalizeWatcher(result: Awaited<ReturnType<typeof build>>): DshxBuildWatcher {
  const candidate = result as unknown as { on?: unknown; close?: unknown }
  if (Array.isArray(result) || typeof result !== 'object' || result === null || typeof candidate.on !== 'function' || typeof candidate.close !== 'function') {
    throw new DshxError('DSHX1104', 'Expected one Client watcher result.', {
      hint: 'Restart the dev session after updating the DSHX compiler.',
    })
  }
  return result as unknown as DshxBuildWatcher
}

/** Start a Client watcher without awaiting a successful initial build. */
export async function startClientWatcher(options: BuildClientOptions): Promise<DshxBuildWatcher> {
  const paths = await resolveOptions(options)
  const config = clientConfig(paths, options)
  return normalizeWatcher(await build({
    ...config,
    build: { ...config.build, watch: {} },
  }))
}

/** Build a DSH 0.1.0-rc.8 client factory with Vite/Rolldown. */
export async function buildClient(options: BuildClientOptions): Promise<ClientBuildResult> {
  const paths = await resolveOptions(options)
  const config = clientConfig(paths, options)

  if (options.watch === true) {
    await build(config)
    return await startClientWatcher(options) as unknown as ClientBuildResult
  }
  return normalizeBuildResult(await build(config))
}

function normalizeBuildResult(result: Awaited<ReturnType<typeof build>>): ClientBuildResult {
  if (Array.isArray(result)) {
    if (result.length === 1 && result[0] !== undefined) return result[0]
    throw new DshxError('DSHX1103', `Expected one Client build result, received ${result.length}.`)
  }
  return result
}
