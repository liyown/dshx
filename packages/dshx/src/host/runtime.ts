import type { Context } from '@deepseek-ai/cordis'
import process from 'node:process'
import type { ToolRuntime } from '@deepseek-ai/dsh-tools'

declare module '@deepseek-ai/cordis' {
  interface Context {
    tools: ToolRuntime
  }
}
import { DshxError } from '../diagnostics.js'
import type { HostDefinition } from './types.js'
import type { DshCompatibility } from '../compat/types.js'
import { loadRuntimePlugins } from './runtime-plugins.js'
import { inspectBridgeEnabled, ownHostInspectBridge, startHostInspectBridge } from './inspect-bridge.js'

const HOST_DEFINITION_KEYS = new Set(['name', 'inject', 'tools', 'setup'])

/** Project identity embedded by the Host compiler. */
export interface HostPluginMetadata {
  readonly packageId: string
  readonly logicalName?: string
  readonly sourceFile?: string
  readonly root?: string
  readonly compatibility?: DshCompatibility
}

/** Normalized Host module surface consumed by the virtual entry. */
export interface CreatedHostPlugin {
  readonly name: string
  readonly inject?: unknown
  readonly Config?: unknown
  apply(ctx: Context, config?: unknown): unknown
}

function fail(
  code: 'DSHX2001' | 'DSHX2002',
  message: string,
  metadata: HostPluginMetadata,
  hint: string,
): never {
  throw new DshxError(code, message, {
    ...(metadata.sourceFile === undefined ? {} : { file: metadata.sourceFile }),
    hint,
  })
}

function fallbackName(metadata: HostPluginMetadata): string {
  return metadata.logicalName ?? metadata.packageId
}

async function startHostRuntime(ctx: Context, metadata: HostPluginMetadata): Promise<void> {
  if (!inspectBridgeEnabled()) return
  const runtimePlugins = await loadRuntimePlugins(ctx, metadata.compatibility)
  const bridge = await startHostInspectBridge(ctx, {
    packageId: metadata.packageId,
    root: metadata.root ?? process.cwd(),
    ...(metadata.logicalName === undefined ? {} : { logicalName: metadata.logicalName }),
    runtimePlugins: runtimePlugins.plugins,
  })
  ownHostInspectBridge(ctx, bridge)
}

function withRuntime(
  ctx: Context,
  result: unknown,
  metadata: HostPluginMetadata,
): unknown {
  if (!inspectBridgeEnabled()) return result
  return Promise.resolve(result).then(async value => {
    try {
      await startHostRuntime(ctx, metadata)
    } catch (error) {
      // Inspect is an optional development capability. A missing provider or
      // bridge must not make a user's Host fail to load.
      console.warn(`DSHX Inspect runtime unavailable: ${error instanceof Error ? error.message : String(error)}`)
    }
    return value
  })
}

function validateDefinition(value: unknown, metadata: HostPluginMetadata): HostDefinition {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    fail(
      'DSHX2001',
      'The default Host export must be an object returned by defineHost().',
      metadata,
      'Default-export defineHost({ setup(ctx) { ... } }) or use native named Host exports without a default export.',
    )
  }
  const source = value as Record<string, unknown>
  const unknown = Object.keys(source).filter(key => !HOST_DEFINITION_KEYS.has(key))
  if (unknown.length > 0) {
    fail(
      'DSHX2002',
      `Host definition contains unknown field${unknown.length === 1 ? '' : 's'}: ${unknown.join(', ')}.`,
      metadata,
      'Remove unsupported fields and put direct Cordis behavior in setup(ctx).',
    )
  }
  if (source.name !== undefined && (typeof source.name !== 'string' || source.name.trim() === '')) {
    fail('DSHX2002', 'Host definition name must be a non-empty string.', metadata, 'Remove name to use the resolved logical project name.')
  }
  if (source.inject !== undefined) {
    if (!Array.isArray(source.inject) || source.inject.some(item => typeof item !== 'string' || item.trim() === '')) {
      fail('DSHX2002', 'Host definition inject must be an array of non-empty service names.', metadata, 'Use inject: ["serviceName"] or remove inject when no service is required.')
    }
  }
  if (source.tools !== undefined && !Array.isArray(source.tools)) {
    fail('DSHX2002', 'Host definition tools must be an array of official ToolDefinition values.', metadata, 'Use tools: [tool] or remove tools when this Host registers no tools.')
  }
  if (source.setup !== undefined && typeof source.setup !== 'function') {
    fail('DSHX2002', 'Host definition setup must be a function.', metadata, 'Use setup(ctx) { ... } or remove setup.')
  }
  return value as HostDefinition
}

/** Convert a definition into the standard Cordis Host module contract. */
export function createHostPlugin(value: unknown, metadata: HostPluginMetadata): CreatedHostPlugin {
  const definition = validateDefinition(value, metadata)
  const inject = [...new Set(definition.inject ?? [])]
  if ((definition.tools?.length ?? 0) > 0 && !inject.includes('tools')) inject.push('tools')
  return {
    name: definition.name ?? fallbackName(metadata),
    inject,
    apply(ctx) {
      for (const tool of definition.tools ?? []) ctx.tools.register(tool)
      return withRuntime(ctx, definition.setup?.(ctx), metadata)
    },
  }
}

/** Normalize either a defineHost default export or an existing native Host module. */
export function createHostModule(source: Record<string, unknown>, metadata: HostPluginMetadata): CreatedHostPlugin {
  if (Object.hasOwn(source, 'default')) return createHostPlugin(source.default, metadata)
  if (typeof source.apply !== 'function') {
    fail(
      'DSHX2001',
      'A native Host module must export an apply function.',
      metadata,
      'Export default defineHost({ ... }) or export function apply(ctx, config) { ... }.',
    )
  }
  if (source.name !== undefined && (typeof source.name !== 'string' || source.name.trim() === '')) {
    fail('DSHX2002', 'Native Host export name must be a non-empty string.', metadata, 'Remove name to use the resolved logical project name.')
  }
  const apply = source.apply as (ctx: Context, config?: unknown) => unknown
  return {
    name: (source.name as string | undefined) ?? fallbackName(metadata),
    ...(source.inject === undefined ? {} : { inject: source.inject }),
    ...(source.Config === undefined ? {} : { Config: source.Config }),
    apply(ctx, config) {
      return withRuntime(ctx, apply(ctx, config), metadata)
    },
  }
}
