import { realpath } from 'node:fs/promises'
import { isAbsolute, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build, type InlineConfig, type Plugin } from 'vite'
import { DEFAULT_COMPATIBILITY } from '../../compat/index.js'
import type { DshCompatibility } from '../../compat/types.js'
import { DshxError } from '../../diagnostics.js'
import { artifactDeclarationPlugin, buildReport, buildWatcher, kernelBoundaryPlugin, resolveUserPlugins } from '../kernel.js'
import type { BuildReport, BuildWatcher, ViteExtensionOptions } from '../types.js'
import { clientCssPlugin } from './css.js'
import { CLIENT_SETUP_SERVICE_CAPABILITIES, clientSetupServices, clientUsesConversationComponents, clientUsesLocales } from './capabilities.js'
import { clientGuardPlugin, singleClientChunkPlugin } from './guards.js'

const VIRTUAL_CLIENT_ENTRY = '\0virtual:dshx-client-entry'
const VIRTUAL_CLIENT_PUBLIC = '\0virtual:dshx-client-public'
const VIRTUAL_CLIENT_API_HOOKS = '\0virtual:dshx-client-api-hooks'
const VIRTUAL_CLIENT_SETTINGS_HOOK = '\0virtual:dshx-client-settings-hook'
const DSHX_CLIENT_PUBLIC = '@becomeopc/dshx/client'
const DSHX_API_PUBLIC = '@becomeopc/dshx/api'
const DSHX_SETTINGS_PUBLIC = '@becomeopc/dshx/settings'
const DSHX_CONVERSATION_PUBLIC = '@becomeopc/dshx/experimental/conversation'
const SETTINGS_PROVIDER_PACKAGE = '@deepseek-ai/dsh-client-ui-settings'
const SETTINGS_CAPABILITY_GLOBAL = '__DSHX_CLIENT_SETTINGS_CAPABILITY__'
const API_PROVIDER_PACKAGE = '@deepseek-ai/dsh-client-connection'
const API_CAPABILITY_GLOBAL = '__DSHX_CLIENT_API_CAPABILITY__'
const CONVERSATION_PROVIDER_PACKAGES = ['@deepseek-ai/dsh-client-runtime', '@deepseek-ai/dsh-client-ui-conversation'] as const
const LOCALE_PROVIDER_PACKAGE = '@deepseek-ai/dsh-client-locale'
const CLIENT_RUNTIME_PATH = fileURLToPath(new URL('../../client/runtime.js', import.meta.url))
const CLIENT_DEFINE_PATH = fileURLToPath(new URL('../../client/define.js', import.meta.url))
const CLIENT_LOCALE_PATH = fileURLToPath(new URL('../../client/locale.js', import.meta.url))
const CLIENT_API_PATH = fileURLToPath(new URL('../../api/client.js', import.meta.url))
const API_DEFINE_PATH = fileURLToPath(new URL('../../api/define.js', import.meta.url))
const API_RUNTIME_PATH = fileURLToPath(new URL('../../api/runtime.js', import.meta.url))
const SETTINGS_DEFINE_PATH = fileURLToPath(new URL('../../settings/define.js', import.meta.url))
const SETTINGS_CLIENT_PATH = fileURLToPath(new URL('../../settings/client.js', import.meta.url))
const CONVERSATION_DEFINE_PATH = fileURLToPath(new URL('../../conversation/define.js', import.meta.url))

/** Options for producing one DSH-compatible lazy-CJS client bundle. */
export interface BuildClientOptions {
  readonly packageId: string
  readonly logicalName?: string
  readonly entry: string
  readonly outDir: string
  readonly root?: string
  readonly sourcemap?: boolean
  readonly declarations?: boolean
  readonly vite?: ViteExtensionOptions
  readonly external?: readonly string[]
  /** Package edges declared by dsh.client.inject. */
  readonly inject?: readonly string[]
  readonly compatibility?: DshCompatibility
}

export type ClientBuildResult = BuildReport

function isInside(parent: string, child: string): boolean {
  const path = relative(parent, child)
  return path !== '' && !path.startsWith('..') && !isAbsolute(path)
}

function clientEntryPlugin(paths: Awaited<ReturnType<typeof resolveOptions>>, options: BuildClientOptions): Plugin {
  const name = options.logicalName ?? options.packageId
  return {
    name: 'dshx-client-entry',
    enforce: 'pre',
    resolveId(source) {
      if (
        source === VIRTUAL_CLIENT_ENTRY ||
        source === VIRTUAL_CLIENT_API_HOOKS ||
        source === VIRTUAL_CLIENT_SETTINGS_HOOK ||
        source === DSHX_CLIENT_PUBLIC ||
        source === DSHX_API_PUBLIC ||
        source === DSHX_SETTINGS_PUBLIC ||
        source === DSHX_CONVERSATION_PUBLIC
      ) {
        return source === VIRTUAL_CLIENT_API_HOOKS || source === VIRTUAL_CLIENT_SETTINGS_HOOK
          ? source
          : source === DSHX_CLIENT_PUBLIC
            ? VIRTUAL_CLIENT_PUBLIC
            : source === DSHX_API_PUBLIC
              ? `${VIRTUAL_CLIENT_PUBLIC}-api`
              : source === DSHX_SETTINGS_PUBLIC
                ? `${VIRTUAL_CLIENT_PUBLIC}-settings`
                : source === DSHX_CONVERSATION_PUBLIC
                  ? `${VIRTUAL_CLIENT_PUBLIC}-conversation`
                  : VIRTUAL_CLIENT_ENTRY
      }
      return null
    },
    load(id) {
      if (id === VIRTUAL_CLIENT_PUBLIC)
        return [
          `export { defineClient, defineSlot } from ${JSON.stringify(CLIENT_DEFINE_PATH)}`,
          `export { defineLocale } from ${JSON.stringify(CLIENT_LOCALE_PATH)}`,
          `export { useApi, useApiQuery } from ${JSON.stringify(VIRTUAL_CLIENT_API_HOOKS)}`,
          `export { useSettings } from ${JSON.stringify(VIRTUAL_CLIENT_SETTINGS_HOOK)}`,
          '',
        ].join('\n')
      if (id === VIRTUAL_CLIENT_API_HOOKS) {
        return [
          `import { useApi as useApiImplementation, useApiQuery as useApiQueryImplementation } from ${JSON.stringify(CLIENT_API_PATH)}`,
          'export function useApi(...args) { return useApiImplementation(...args) }',
          'export function useApiQuery(...args) { return useApiQueryImplementation(...args) }',
          '',
        ].join('\n')
      }
      if (id === VIRTUAL_CLIENT_SETTINGS_HOOK) {
        return [
          `import { useSettings as useSettingsImplementation } from ${JSON.stringify(SETTINGS_CLIENT_PATH)}`,
          'export function useSettings(...args) { return useSettingsImplementation(...args) }',
          '',
        ].join('\n')
      }
      if (id === `${VIRTUAL_CLIENT_PUBLIC}-api`) {
        return [
          `export { defineApi, method } from ${JSON.stringify(API_DEFINE_PATH)}`,
          `export { isApiError } from ${JSON.stringify(API_RUNTIME_PATH)}`,
          '',
        ].join('\n')
      }
      if (id === `${VIRTUAL_CLIENT_PUBLIC}-settings`) {
        return `export { defineSettings } from ${JSON.stringify(SETTINGS_DEFINE_PATH)}\n`
      }
      if (id === `${VIRTUAL_CLIENT_PUBLIC}-conversation`) {
        return `export { defineConversation } from ${JSON.stringify(CONVERSATION_DEFINE_PATH)}\n`
      }
      if (id !== VIRTUAL_CLIENT_ENTRY) return null
      const metadata = {
        packageId: options.packageId,
        logicalName: name,
        sourceFile: relative(paths.root, paths.entry).replaceAll('\\', '/'),
      }
      return [
        `import * as source from ${JSON.stringify(paths.entry)}`,
        `import { createClientModule } from ${JSON.stringify(CLIENT_RUNTIME_PATH)}`,
        `const settingsCapability = globalThis[${JSON.stringify(SETTINGS_CAPABILITY_GLOBAL)}] === true`,
        `const apiCapability = globalThis[${JSON.stringify(API_CAPABILITY_GLOBAL)}] === true`,
        `const plugin = createClientModule(source, { ...${JSON.stringify(metadata)}, settingsCapability, apiCapability })`,
        'export const name = plugin.name',
        'export const inject = plugin.inject',
        'export const Config = plugin.Config',
        'export function apply(ctx, config) { return plugin.apply(ctx, config) }',
        '',
      ].join('\n')
    },
  }
}

/** Infer optional Client capabilities only from code retained in the final chunk. */
function clientCapabilitiesPlugin(options: BuildClientOptions): Plugin {
  return {
    name: 'dshx-client-capabilities',
    enforce: 'post',
    generateBundle(_output, bundle) {
      const chunk = Object.values(bundle).find(item => item.type === 'chunk' && item.isEntry)
      if (chunk === undefined || chunk.type !== 'chunk') return
      const settingsRetained = Object.hasOwn(chunk.modules, VIRTUAL_CLIENT_SETTINGS_HOOK)
      const apiRetained = Object.hasOwn(chunk.modules, VIRTUAL_CLIENT_API_HOOKS)
      if (settingsRetained && !(options.inject ?? []).includes(SETTINGS_PROVIDER_PACKAGE)) {
        throw new DshxError('DSHX1203', 'useSettings() requires the official Settings Scope provider package edge.', {
          hint: `Add ${JSON.stringify(SETTINGS_PROVIDER_PACKAGE)} to package.json dsh.client.inject, then rebuild.`,
        })
      }
      if (apiRetained && !(options.inject ?? []).includes(API_PROVIDER_PACKAGE)) {
        throw new DshxError('DSHX1203', 'useApi()/useApiQuery() requires the official Client Connection provider package edge.', {
          hint: `Add ${JSON.stringify(API_PROVIDER_PACKAGE)} to package.json dsh.client.inject, then rebuild.`,
        })
      }
      const settingsExpression = new RegExp(`globalThis\\[["']${SETTINGS_CAPABILITY_GLOBAL}["']\\]\\s*===\\s*true`, 'g')
      const apiExpression = new RegExp(`globalThis\\[["']${API_CAPABILITY_GLOBAL}["']\\]\\s*===\\s*true`, 'g')
      chunk.code = chunk.code.replace(settingsExpression, settingsRetained ? 'true' : 'false').replace(apiExpression, apiRetained ? 'true' : 'false')
    },
  }
}

async function validateConversationProviderEdges(paths: Awaited<ReturnType<typeof resolveOptions>>, options: BuildClientOptions): Promise<void> {
  if (!(await clientUsesConversationComponents(paths.entry, paths.root))) return
  const missing = CONVERSATION_PROVIDER_PACKAGES.filter(packageName => !(options.inject ?? []).includes(packageName))
  if (missing.length === 0) return
  throw new DshxError('DSHX1203', 'Conversation components require the official Client Runtime and Conversation UI package edges.', {
    file: paths.entry,
    hint: `Add ${missing.map(packageName => JSON.stringify(packageName)).join(' and ')} to package.json dsh.client.inject, then rebuild.`,
  })
}

async function validateLocaleProviderEdge(paths: Awaited<ReturnType<typeof resolveOptions>>, options: BuildClientOptions): Promise<void> {
  if (!(await clientUsesLocales(paths.entry, paths.root)) || (options.inject ?? []).includes(LOCALE_PROVIDER_PACKAGE)) return
  throw new DshxError('DSHX1203', 'defineLocale() contributions require the official Locale provider package edge.', {
    file: paths.entry,
    hint: `Add ${JSON.stringify(LOCALE_PROVIDER_PACKAGE)} to package.json dsh.client.inject, then rebuild.`,
  })
}

async function validateSetupServiceEdges(paths: Awaited<ReturnType<typeof resolveOptions>>, options: BuildClientOptions): Promise<void> {
  const analysis = await clientSetupServices(paths.entry, paths.root)
  for (const service of analysis.services) {
    if (analysis.inject !== undefined && !analysis.inject.includes(service) && !analysis.autoInject.includes(service)) {
      throw new DshxError('DSHX1204', `defineClient().setup uses ctx.${service}, but defineClient.inject does not declare ${JSON.stringify(service)}.`, {
        file: analysis.sourceFile ?? paths.entry,
        hint: `Add inject: [${JSON.stringify(service)}] to defineClient({...}). dsh.client.inject loads provider packages; it does not inject runtime Cordis services.`,
      })
    }
    const provider = CLIENT_SETUP_SERVICE_CAPABILITIES[service].provider
    if (!(options.inject ?? []).includes(provider) && !analysis.autoInject.includes(service)) {
      throw new DshxError('DSHX1203', `ctx.${service} requires the official ${service} provider package edge.`, {
        file: analysis.sourceFile ?? paths.entry,
        hint: `Add ${JSON.stringify(provider)} to package.json dsh.client.inject, then rebuild.`,
      })
    }
  }
}

function clientSetupServiceGuardPlugin(paths: Awaited<ReturnType<typeof resolveOptions>>, options: BuildClientOptions): Plugin {
  return {
    name: 'dshx-client-setup-service-guard',
    async buildStart() {
      await validateSetupServiceEdges(paths, options)
      await validateLocaleProviderEdge(paths, options)
    },
  }
}

async function resolveOptions(options: BuildClientOptions) {
  if (options.packageId.trim() === '') {
    throw new DshxError('DSHX1001', 'Client package id must not be empty.')
  }
  if (options.logicalName !== undefined && options.logicalName.trim() === '') {
    throw new DshxError('DSHX1001', 'Logical Client name must not be empty.')
  }
  const root = await realpath(resolve(options.root ?? process.cwd()))
  const unresolvedEntry = resolve(root, options.entry)
  const outDir = resolve(root, options.outDir)
  const entry = await realpath(unresolvedEntry).catch((cause: unknown) => {
    throw new DshxError('DSHX1002', `Client entry does not exist: ${unresolvedEntry}`, { cause, file: unresolvedEntry })
  })
  if (outDir === root || isInside(outDir, entry)) {
    throw new DshxError('DSHX1003', `Client output directory ${outDir} would overwrite project sources.`, {
      hint: 'Choose a dedicated output directory such as dist.',
    })
  }
  return { root, entry, outDir }
}

async function clientConfig(paths: Awaited<ReturnType<typeof resolveOptions>>, options: BuildClientOptions, watch: boolean): Promise<InlineConfig> {
  const compatibility = options.compatibility ?? DEFAULT_COMPATIBILITY
  const externals = new Set([...compatibility.client.platformModules, ...compatibility.client.preloadedExternals, ...(options.external ?? [])])
  const external = (source: string): boolean => externals.has(source)
  const assetsInlineLimit = (): boolean => true
  const output = {
    format: 'cjs',
    entryFileNames: 'client.js',
    codeSplitting: false,
    exports: 'named',
    banner: `window.__ModuleLoader__.load({ id: ${JSON.stringify(options.packageId)}, factory: (require) => {`,
    intro: 'var module = { exports: {} }; var exports = module.exports;',
    footer: 'return module.exports; } });',
  } as const
  const userPlugins = await resolveUserPlugins(options.vite?.plugins, watch)
  const mode = watch ? 'development' : 'production'
  return {
    root: paths.root,
    configFile: false,
    publicDir: false,
    appType: 'custom',
    mode,
    logLevel: 'error',
    plugins: [
      clientEntryPlugin(paths, options),
      ...(watch ? [clientSetupServiceGuardPlugin(paths, options)] : []),
      clientGuardPlugin(externals, options.packageId),
      ...userPlugins,
      artifactDeclarationPlugin('client', paths.outDir, options.declarations ?? true),
      clientCssPlugin(options.packageId, paths.outDir),
      clientCapabilitiesPlugin(options),
      kernelBoundaryPlugin({
        face: 'client',
        root: paths.root,
        input: VIRTUAL_CLIENT_ENTRY,
        target: 'es2024',
        assetsInlineLimit,
        external,
        output,
        cssCodeSplit: false,
      }),
      singleClientChunkPlugin(),
    ],
    define: {
      'process.env.NODE_ENV': JSON.stringify(mode),
      'import.meta.env.MODE': JSON.stringify(mode),
      'import.meta.env': JSON.stringify({ MODE: mode }),
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
      cssCodeSplit: false,
      assetsInlineLimit,
      minify: false,
      sourcemap: options.sourcemap ?? true,
      watch: null,
      rollupOptions: {
        input: VIRTUAL_CLIENT_ENTRY,
        preserveEntrySignatures: 'strict',
        external,
        output,
      },
    },
  }
}

/** Start a Client watcher without awaiting a successful initial build. */
export async function watchClient(options: BuildClientOptions): Promise<BuildWatcher> {
  const paths = await resolveOptions(options)
  await validateSetupServiceEdges(paths, options)
  await validateLocaleProviderEdge(paths, options)
  await validateConversationProviderEdges(paths, options)
  const config = await clientConfig(paths, options, true)
  return buildWatcher(
    await build({
      ...config,
      build: { ...config.build, watch: {} },
    }),
    'client',
    'DSHX1104',
  )
}

/** Build a DSH-compatible client factory with Vite/Rolldown. */
export async function buildClient(options: BuildClientOptions): Promise<ClientBuildResult> {
  const paths = await resolveOptions(options)
  await validateSetupServiceEdges(paths, options)
  await validateLocaleProviderEdge(paths, options)
  await validateConversationProviderEdges(paths, options)
  const config = await clientConfig(paths, options, false)
  const declarations = options.declarations ?? true
  return buildReport(await build(config), 'client', 'client.js', paths.outDir, declarations, 'DSHX1103')
}
