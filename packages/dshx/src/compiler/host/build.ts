import { realpath } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { isAbsolute, relative, resolve } from 'node:path'
import { build, type InlineConfig, type Plugin } from 'vite'
import { DshxError } from '../../diagnostics.js'
import { isHostExternal, singleHostChunkPlugin } from './guards.js'

const VIRTUAL_HOST_ENTRY = '\0virtual:dshx-host-entry'
const VIRTUAL_HOST_PUBLIC = '\0virtual:dshx-host-public'
const DSHX_HOST_PUBLIC = 'dshx/host'
const HOST_RUNTIME_PATH = fileURLToPath(new URL('../../host/runtime.js', import.meta.url))

/** Options for producing one Node ESM Host bundle. */
export interface BuildHostOptions {
  readonly packageId: string
  readonly logicalName?: string
  readonly outDir: string
  readonly entry?: string
  readonly root?: string
  readonly sourcemap?: boolean
  readonly watch?: boolean
}

/** Vite result for a one-shot Host build or an active watch build. */
export type HostBuildResult = Exclude<Awaited<ReturnType<typeof build>>, readonly unknown[]>

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

function hostEntryPlugin(
  paths: Awaited<ReturnType<typeof resolveOptions>>,
  options: BuildHostOptions,
): Plugin {
  const name = options.logicalName ?? options.packageId
  return {
    name: 'dshx-host-entry',
    resolveId(source) {
      if (source === VIRTUAL_HOST_ENTRY || source === DSHX_HOST_PUBLIC) {
        return source === DSHX_HOST_PUBLIC ? VIRTUAL_HOST_PUBLIC : VIRTUAL_HOST_ENTRY
      }
      return null
    },
    load(id) {
      if (id === VIRTUAL_HOST_PUBLIC) {
        return 'export function defineHost(definition) { return definition }\n'
      }
      if (id !== VIRTUAL_HOST_ENTRY) return null
      if (paths.entry === undefined) {
        return `export const name = ${JSON.stringify(name)}\nexport function apply() {}\n`
      }
      const metadata = {
        packageId: options.packageId,
        logicalName: name,
        sourceFile: paths.entry,
      }
      return [
        `import * as source from ${JSON.stringify(paths.entry)}`,
        `import { createHostModule } from ${JSON.stringify(HOST_RUNTIME_PATH)}`,
        `const plugin = createHostModule(source, ${JSON.stringify(metadata)})`,
        'export const name = plugin.name',
        'export const inject = plugin.inject',
        'export const Config = plugin.Config',
        'export function apply(ctx, config) { return plugin.apply(ctx, config) }',
        '',
      ].join('\n')
    },
  }
}

async function resolveOptions(options: BuildHostOptions) {
  if (options.packageId.trim() === '') {
    throw new DshxError('DSHX1001', 'Package id must not be empty.')
  }
  if (options.logicalName !== undefined && options.logicalName.trim() === '') {
    throw new DshxError('DSHX1001', 'Logical Host name must not be empty.')
  }
  const root = await realpath(resolve(options.root ?? process.cwd()))
  const outDir = resolve(root, options.outDir)
  const configuredEntry = options.entry
  const entry = configuredEntry === undefined
    ? undefined
    : await realpath(resolve(root, configuredEntry)).catch((cause: unknown) => {
        const file = resolve(root, configuredEntry)
        throw new DshxError('DSHX1301', `Host entry does not exist: ${file}`, { cause, file })
      })
  if (outDir === root || (entry !== undefined && isInside(outDir, entry))) {
    throw new DshxError(
      'DSHX1003',
      `Host output directory ${outDir} would overwrite project sources.`,
      { hint: 'Choose a dedicated output directory such as dist.' },
    )
  }
  return { root, entry, outDir }
}

function hostConfig(paths: Awaited<ReturnType<typeof resolveOptions>>, options: BuildHostOptions): InlineConfig {
  return {
    root: paths.root,
    configFile: false,
    appType: 'custom',
    mode: 'production',
    logLevel: 'error',
    plugins: [hostEntryPlugin(paths, options), singleHostChunkPlugin()],
    build: {
      target: 'es2024',
      outDir: paths.outDir,
      emptyOutDir: false,
      copyPublicDir: false,
      minify: false,
      sourcemap: options.sourcemap ?? true,
      watch: null,
      rollupOptions: {
        input: VIRTUAL_HOST_ENTRY,
        preserveEntrySignatures: 'strict',
        external: source => source !== DSHX_HOST_PUBLIC && isHostExternal(source),
        output: {
          format: 'es',
          entryFileNames: 'index.js',
          codeSplitting: false,
          exports: 'named',
        },
      },
    },
  }
}

function normalizeWatcher(result: Awaited<ReturnType<typeof build>>): DshxBuildWatcher {
  const candidate = result as unknown as { on?: unknown; close?: unknown }
  if (Array.isArray(result) || typeof result !== 'object' || result === null || typeof candidate.on !== 'function' || typeof candidate.close !== 'function') {
    throw new DshxError('DSHX1305', 'Expected one Host watcher result.', {
      hint: 'Restart the dev session after updating the DSHX compiler.',
    })
  }
  return result as unknown as DshxBuildWatcher
}

/** Start a Host watcher without awaiting a successful initial build. */
export async function startHostWatcher(options: BuildHostOptions): Promise<DshxBuildWatcher> {
  const paths = await resolveOptions(options)
  const config = hostConfig(paths, options)
  return normalizeWatcher(await build({
    ...config,
    build: { ...config.build, watch: {} },
  }))
}

/** Build a DSH 0.1.0-rc.8 Host entry as one Node ESM file. */
export async function buildHost(options: BuildHostOptions): Promise<HostBuildResult> {
  const paths = await resolveOptions(options)
  const config = hostConfig(paths, options)

  if (options.watch === true) {
    await build(config)
    return await startHostWatcher(options) as unknown as HostBuildResult
  }
  return normalizeBuildResult(await build(config))
}

function normalizeBuildResult(result: Awaited<ReturnType<typeof build>>): HostBuildResult {
  if (Array.isArray(result)) {
    if (result.length === 1 && result[0] !== undefined) return result[0]
    throw new DshxError('DSHX1304', `Expected one Host build result, received ${result.length}.`)
  }
  return result
}
