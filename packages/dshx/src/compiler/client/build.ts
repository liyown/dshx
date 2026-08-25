import { realpath } from 'node:fs/promises'
import { isAbsolute, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build, type InlineConfig, type Plugin } from 'vite'
import { DEFAULT_COMPATIBILITY } from '../../compat/index.js'
import type { DshCompatibility } from '../../compat/types.js'
import { DshxError } from '../../diagnostics.js'
import { clientCssPlugin } from './css.js'
import { clientUsesConversationComponents } from './capabilities.js'
import { clientGuardPlugin, singleClientChunkPlugin } from './guards.js'

const VIRTUAL_CLIENT_ENTRY = '\0virtual:dshx-client-entry'
const VIRTUAL_CLIENT_PUBLIC = '\0virtual:dshx-client-public'
const DSHX_CLIENT_PUBLIC = '@becomeopc/dshx/client'
const DSHX_API_PUBLIC = '@becomeopc/dshx/api'
const DSHX_SETTINGS_PUBLIC = '@becomeopc/dshx/settings'
const DSHX_CONVERSATION_PUBLIC = '@becomeopc/dshx/conversation'
const SETTINGS_PROVIDER_PACKAGE = '@deepseek-ai/dsh-client-ui-settings'
const SETTINGS_HOOK_MARKER = 'dshx.settings-hook.v1'
const SETTINGS_CAPABILITY_GLOBAL = '__DSHX_CLIENT_SETTINGS_CAPABILITY__'
const API_PROVIDER_PACKAGE = '@deepseek-ai/dsh-client-connection'
const API_HOOK_MARKER = 'dshx.api-hook.v1'
const API_CAPABILITY_GLOBAL = '__DSHX_CLIENT_API_CAPABILITY__'
const CONVERSATION_PROVIDER_PACKAGES = ['@deepseek-ai/dsh-client-runtime', '@deepseek-ai/dsh-client-ui-conversation'] as const
const CLIENT_RUNTIME_PATH = fileURLToPath(new URL('../../client/runtime.js', import.meta.url))
const CLIENT_API_PATH = fileURLToPath(new URL('../../api/client.js', import.meta.url))
const API_DEFINE_PATH = fileURLToPath(new URL('../../api/define.js', import.meta.url))
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
  readonly watch?: boolean
  readonly external?: readonly string[]
  /** Package edges declared by dsh.client.inject. */
  readonly inject?: readonly string[]
  readonly compatibility?: DshCompatibility
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

function clientEntryPlugin(paths: Awaited<ReturnType<typeof resolveOptions>>, options: BuildClientOptions): Plugin {
  const name = options.logicalName ?? options.packageId
  return {
    name: 'dshx-client-entry',
    enforce: 'pre',
    resolveId(source) {
      if (
        source === VIRTUAL_CLIENT_ENTRY ||
        source === DSHX_CLIENT_PUBLIC ||
        source === DSHX_API_PUBLIC ||
        source === DSHX_SETTINGS_PUBLIC ||
        source === DSHX_CONVERSATION_PUBLIC
      ) {
        return source === DSHX_CLIENT_PUBLIC
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
          'export function defineClient(definition) { return definition }',
          'export function defineSlot(name, options) {',
          '  const { component, ...registration } = options',
          '  return { name, options: registration, component }',
          '}',
          `export { useApi, useQuery, createApiClient } from ${JSON.stringify(CLIENT_API_PATH)}`,
          `export { useSettings } from ${JSON.stringify(SETTINGS_CLIENT_PATH)}`,
          '',
        ].join('\n')
      if (id === `${VIRTUAL_CLIENT_PUBLIC}-api`) {
        return `export { defineApi, method } from ${JSON.stringify(API_DEFINE_PATH)}\n`
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
        sourceFile: paths.entry,
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
    renderChunk(code, chunk) {
      if (!chunk.isEntry) return null
      const settingsRetained = code.includes(JSON.stringify(SETTINGS_HOOK_MARKER)) || code.includes(`'${SETTINGS_HOOK_MARKER}'`)
      const apiRetained = code.includes(JSON.stringify(API_HOOK_MARKER)) || code.includes(`'${API_HOOK_MARKER}'`)
      if (settingsRetained && !(options.inject ?? []).includes(SETTINGS_PROVIDER_PACKAGE)) {
        throw new DshxError('DSHX1203', 'useSettings() requires the official Settings Scope provider package edge.', {
          hint: `Add ${JSON.stringify(SETTINGS_PROVIDER_PACKAGE)} to package.json dsh.client.inject, then rebuild.`,
        })
      }
      if (apiRetained && !(options.inject ?? []).includes(API_PROVIDER_PACKAGE)) {
        throw new DshxError('DSHX1203', 'useApi()/useQuery() requires the official Client Connection provider package edge.', {
          hint: `Add ${JSON.stringify(API_PROVIDER_PACKAGE)} to package.json dsh.client.inject, then rebuild.`,
        })
      }
      const settingsExpression = new RegExp(`globalThis\\[["']${SETTINGS_CAPABILITY_GLOBAL}["']\\]\\s*===\\s*true`, 'g')
      const apiExpression = new RegExp(`globalThis\\[["']${API_CAPABILITY_GLOBAL}["']\\]\\s*===\\s*true`, 'g')
      const next = code.replace(settingsExpression, settingsRetained ? 'true' : 'false').replace(apiExpression, apiRetained ? 'true' : 'false')
      return next === code ? null : { code: next, map: null }
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

function clientConfig(paths: Awaited<ReturnType<typeof resolveOptions>>, options: BuildClientOptions): InlineConfig {
  const compatibility = options.compatibility ?? DEFAULT_COMPATIBILITY
  const externals = new Set([...compatibility.client.platformModules, ...compatibility.client.preloadedExternals, ...(options.external ?? [])])
  return {
    root: paths.root,
    configFile: false,
    appType: 'custom',
    mode: 'production',
    logLevel: 'error',
    plugins: [
      clientEntryPlugin(paths, options),
      clientGuardPlugin(externals, options.packageId),
      clientCssPlugin(options.packageId, paths.root),
      clientCapabilitiesPlugin(options),
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
      rollupOptions: {
        input: VIRTUAL_CLIENT_ENTRY,
        preserveEntrySignatures: 'strict',
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
  await validateConversationProviderEdges(paths, options)
  const config = clientConfig(paths, options)
  return normalizeWatcher(
    await build({
      ...config,
      build: { ...config.build, watch: {} },
    }),
  )
}

/** Build a DSH-compatible client factory with Vite/Rolldown. */
export async function buildClient(options: BuildClientOptions): Promise<ClientBuildResult> {
  const paths = await resolveOptions(options)
  await validateConversationProviderEdges(paths, options)
  const config = clientConfig(paths, options)

  if (options.watch === true) {
    await build(config)
    return (await startClientWatcher(options)) as unknown as ClientBuildResult
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
