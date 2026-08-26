import { realpath } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { isAbsolute, relative, resolve } from 'node:path'
import { build, type InlineConfig, type Plugin } from 'vite'
import { DshxError } from '../../diagnostics.js'
import type { DshCompatibility } from '../../compat/types.js'
import { artifactDeclarationPlugin, buildReport, buildWatcher, kernelBoundaryPlugin, resolveUserPlugins } from '../kernel.js'
import type { BuildReport, BuildWatcher, ViteExtensionOptions } from '../types.js'
import { isHostExternal, singleHostChunkPlugin } from './guards.js'

const VIRTUAL_HOST_ENTRY = '\0virtual:dshx-host-entry'
const VIRTUAL_HOST_PUBLIC = '\0virtual:dshx-host-public'
const DSHX_HOST_PUBLIC = '@becomeopc/dshx/host'
const DSHX_API_PUBLIC = '@becomeopc/dshx/api'
const DSHX_SETTINGS_PUBLIC = '@becomeopc/dshx/settings'
const HOST_RUNTIME_PATH = fileURLToPath(new URL('../../host/runtime.js', import.meta.url))
const HOST_DEFINE_PATH = fileURLToPath(new URL('../../host/define.js', import.meta.url))
const API_DEFINE_PATH = fileURLToPath(new URL('../../api/define.js', import.meta.url))
const API_RUNTIME_PATH = fileURLToPath(new URL('../../api/runtime.js', import.meta.url))
const SETTINGS_DEFINE_PATH = fileURLToPath(new URL('../../settings/define.js', import.meta.url))

/** Options for producing one Node ESM Host bundle. */
export interface BuildHostOptions {
  readonly packageId: string
  readonly logicalName?: string
  readonly outDir: string
  readonly entry?: string
  readonly root?: string
  readonly sourcemap?: boolean
  readonly declarations?: boolean
  readonly vite?: ViteExtensionOptions
  readonly compatibility?: DshCompatibility
}

export type HostBuildResult = BuildReport

function isInside(parent: string, child: string): boolean {
  const path = relative(parent, child)
  return path !== '' && !path.startsWith('..') && !isAbsolute(path)
}

function hostEntryPlugin(paths: Awaited<ReturnType<typeof resolveOptions>>, options: BuildHostOptions): Plugin {
  const name = options.logicalName ?? options.packageId
  const rootFromOutput = relative(paths.outDir, paths.root)
  const rootUrl = isAbsolute(rootFromOutput)
    ? undefined
    : `${(rootFromOutput || '.')
        .split(/[\\/]/)
        .map(segment => encodeURIComponent(segment))
        .join('/')}/`
  return {
    name: 'dshx-host-entry',
    enforce: 'pre',
    resolveId(source) {
      if (source === VIRTUAL_HOST_ENTRY || source === DSHX_HOST_PUBLIC || source === DSHX_API_PUBLIC || source === DSHX_SETTINGS_PUBLIC) {
        return source === DSHX_HOST_PUBLIC
          ? VIRTUAL_HOST_PUBLIC
          : source === DSHX_API_PUBLIC
            ? `${VIRTUAL_HOST_PUBLIC}-api`
            : source === DSHX_SETTINGS_PUBLIC
              ? `${VIRTUAL_HOST_PUBLIC}-settings`
              : VIRTUAL_HOST_ENTRY
      }
      return null
    },
    load(id) {
      if (id === VIRTUAL_HOST_PUBLIC) {
        return [
          `export { defineHost, defineCommand, definePromptContext, definePromptSection } from ${JSON.stringify(HOST_DEFINE_PATH)}`,
          "export { defineTool } from '@deepseek-ai/dsh-tools'",
          '',
        ].join('\n')
      }
      if (id === `${VIRTUAL_HOST_PUBLIC}-api`) {
        return [
          `export { defineApi, method } from ${JSON.stringify(API_DEFINE_PATH)}`,
          `export { isApiError } from ${JSON.stringify(API_RUNTIME_PATH)}`,
          '',
        ].join('\n')
      }
      if (id === `${VIRTUAL_HOST_PUBLIC}-settings`) {
        return `export { defineSettings } from ${JSON.stringify(SETTINGS_DEFINE_PATH)}\n`
      }
      if (id !== VIRTUAL_HOST_ENTRY) return null
      if (paths.entry === undefined) {
        return `export const name = ${JSON.stringify(name)}\nexport const inject = undefined\nexport const Config = undefined\nexport function apply() {}\n`
      }
      const metadata = {
        packageId: options.packageId,
        logicalName: name,
        sourceFile: relative(paths.root, paths.entry).replaceAll('\\', '/'),
        compatibility: options.compatibility,
      }
      return [
        `import * as source from ${JSON.stringify(paths.entry)}`,
        `import { createHostModule } from ${JSON.stringify(HOST_RUNTIME_PATH)}`,
        ...(rootUrl === undefined ? [] : [`import { fileURLToPath as dshxFileURLToPath } from 'node:url'`]),
        `const plugin = createHostModule(source, { ...${JSON.stringify(metadata)}${rootUrl === undefined ? '' : `, root: dshxFileURLToPath(new URL(${JSON.stringify(rootUrl)}, import.meta.url))`} })`,
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
  const entry =
    configuredEntry === undefined
      ? undefined
      : await realpath(resolve(root, configuredEntry)).catch((cause: unknown) => {
          const file = resolve(root, configuredEntry)
          throw new DshxError('DSHX1301', `Host entry does not exist: ${file}`, { cause, file })
        })
  if (outDir === root || (entry !== undefined && isInside(outDir, entry))) {
    throw new DshxError('DSHX1003', `Host output directory ${outDir} would overwrite project sources.`, {
      hint: 'Choose a dedicated output directory such as dist.',
    })
  }
  return { root, entry, outDir }
}

async function hostConfig(paths: Awaited<ReturnType<typeof resolveOptions>>, options: BuildHostOptions, watch: boolean): Promise<InlineConfig> {
  const external = (source: string): boolean =>
    source !== DSHX_HOST_PUBLIC && source !== DSHX_API_PUBLIC && source !== DSHX_SETTINGS_PUBLIC && isHostExternal(source)
  const assetsInlineLimit = (): boolean => true
  const output = {
    format: 'es',
    entryFileNames: 'index.js',
    codeSplitting: false,
    exports: 'named',
  } as const
  const userPlugins = await resolveUserPlugins(options.vite?.plugins, watch)
  return {
    root: paths.root,
    configFile: false,
    publicDir: false,
    appType: 'custom',
    mode: watch ? 'development' : 'production',
    logLevel: 'error',
    plugins: [
      hostEntryPlugin(paths, options),
      ...userPlugins,
      artifactDeclarationPlugin('host', paths.outDir, options.declarations ?? true),
      kernelBoundaryPlugin({
        face: 'host',
        root: paths.root,
        input: VIRTUAL_HOST_ENTRY,
        target: 'es2024',
        assetsInlineLimit,
        external,
        output,
      }),
      singleHostChunkPlugin(),
    ],
    build: {
      target: 'es2024',
      outDir: paths.outDir,
      emptyOutDir: false,
      copyPublicDir: false,
      assetsInlineLimit,
      minify: false,
      sourcemap: options.sourcemap ?? true,
      watch: null,
      rollupOptions: {
        input: VIRTUAL_HOST_ENTRY,
        preserveEntrySignatures: 'strict',
        external,
        output,
      },
    },
  }
}

/** Start a Host watcher without awaiting a successful initial build. */
export async function watchHost(options: BuildHostOptions): Promise<BuildWatcher> {
  const paths = await resolveOptions(options)
  const config = await hostConfig(paths, options, true)
  return buildWatcher(
    await build({
      ...config,
      build: { ...config.build, watch: {} },
    }),
    'host',
    'DSHX1305',
  )
}

/** Build a DSH-compatible Host entry as one Node ESM file. */
export async function buildHost(options: BuildHostOptions): Promise<HostBuildResult> {
  const paths = await resolveOptions(options)
  const config = await hostConfig(paths, options, false)
  const declarations = options.declarations ?? true
  return buildReport(await build(config), 'host', 'index.js', paths.outDir, declarations, 'DSHX1304')
}
