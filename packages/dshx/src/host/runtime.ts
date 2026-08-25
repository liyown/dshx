import type { Context } from '@deepseek-ai/cordis'
import process from 'node:process'
import type { CommandRuntime } from '@deepseek-ai/dsh-commands'
import type { SystemPrompt } from '@deepseek-ai/dsh-system-prompt'
import { settingsNamespace, type SettingsProvider } from '@deepseek-ai/dsh-settings'
import type { ToolRuntime } from '@deepseek-ai/dsh-tools'

declare module '@deepseek-ai/cordis' {
  interface Context {
    commands: CommandRuntime
    systemPrompt: SystemPrompt
    settings: SettingsProvider
    tools: ToolRuntime
  }
}
import { DshxError } from '../diagnostics.js'
import type { HostDefinition } from './types.js'
import type { DshCompatibility } from '../compat/types.js'
import { loadRuntimePlugins } from './runtime-plugins.js'
import { inspectBridgeEnabled, ownHostInspectBridge, startHostInspectBridge } from './inspect-bridge.js'
import { registerApi } from '../api/runtime.js'
import type { SettingsContract, SettingsContribution, SettingsHostContribution } from '../settings/types.js'
import { settingsSchemaContainsSecret } from '../settings/define.js'

const HOST_DEFINITION_KEYS = new Set(['name', 'inject', 'tools', 'commands', 'prompts', 'settings', 'api', 'apis', 'setup'])

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

function fail(code: 'DSHX2001' | 'DSHX2002', message: string, metadata: HostPluginMetadata, hint: string): never {
  throw new DshxError(code, message, {
    ...(metadata.sourceFile === undefined ? {} : { file: metadata.sourceFile }),
    hint,
  })
}

function fallbackName(metadata: HostPluginMetadata): string {
  return metadata.logicalName ?? metadata.packageId
}

async function startHostRuntime(ctx: Context, metadata: HostPluginMetadata): Promise<void> {
  const runtimePlugins = await loadRuntimePlugins(ctx, metadata.compatibility)
  if (!inspectBridgeEnabled()) return
  const bridge = await startHostInspectBridge(ctx, {
    packageId: metadata.packageId,
    root: metadata.root ?? process.cwd(),
    ...(metadata.logicalName === undefined ? {} : { logicalName: metadata.logicalName }),
    runtimePlugins: runtimePlugins.plugins,
  })
  ownHostInspectBridge(ctx, bridge)
}

function normalizeApis(definition: HostDefinition): readonly import('../api/types.js').ApiHostRegistration[] {
  return [...(definition.api === undefined ? [] : [definition.api]), ...(definition.apis ?? [])]
}

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined
}

function settingsContract(contribution: SettingsContribution): SettingsContract {
  return contribution.kind === 'settings' ? contribution : contribution.contract
}

function validateSettingsContract(value: unknown, metadata: HostPluginMetadata, index: number): SettingsContract {
  const source = record(value)
  const keys = ['kind', 'namespace', 'schema', 'applies', 'client', 'host']
  if (
    source === undefined ||
    source.kind !== 'settings' ||
    typeof source.namespace !== 'string' ||
    typeof source.schema !== 'function' ||
    (source.applies !== 'live' && source.applies !== 'restart') ||
    typeof source.host !== 'function' ||
    Object.keys(source).some(key => !keys.includes(key))
  ) {
    fail(
      'DSHX2002',
      `Host definition settings contains a malformed Settings contract at index ${index}.`,
      metadata,
      'Create the contract with defineSettings({ namespace, schema, applies }) before adding it to defineHost({ settings }).',
    )
  }
  const client = record(source.client)
  if (source.client !== undefined && (client === undefined || typeof client.decode !== 'function' || Object.keys(client).some(key => key !== 'decode'))) {
    fail(
      'DSHX2002',
      `Host Settings ${JSON.stringify(source.namespace)} has invalid Client decoding options.`,
      metadata,
      'Use client: { decode(value) { ... } } or remove client when the Host and Client values are identical.',
    )
  }
  if (settingsSchemaContainsSecret(source.schema as SettingsContract['schema']) && client?.decode === undefined) {
    fail(
      'DSHX2002',
      `Host Settings ${JSON.stringify(source.namespace)} contains secret fields without a Client decoder.`,
      metadata,
      'Provide client: { decode(redactedValue) { ... } } and return a Client-safe value with secret fields removed.',
    )
  }
  return value as SettingsContract
}

function validateSettingsContribution(value: unknown, metadata: HostPluginMetadata, index: number): SettingsContribution {
  const source = record(value)
  if (source?.kind === 'settings') return validateSettingsContract(value, metadata, index)
  if (source?.kind !== 'settings-host' || Object.keys(source).some(key => key !== 'kind' && key !== 'contract' && key !== 'options')) {
    fail(
      'DSHX2002',
      `Host definition settings contains a malformed Settings contribution at index ${index}.`,
      metadata,
      'Use settings: [contract] or settings: [contract.host({ base, validate, setup })].',
    )
  }
  validateSettingsContract(source.contract, metadata, index)
  const options = record(source.options)
  if (
    options === undefined ||
    Object.keys(options).some(key => key !== 'base' && key !== 'validate' && key !== 'setup') ||
    (options.base !== undefined && record(options.base) === undefined) ||
    (options.validate !== undefined && typeof options.validate !== 'function') ||
    (options.setup !== undefined && typeof options.setup !== 'function')
  ) {
    fail(
      'DSHX2002',
      `Host Settings contribution at index ${index} has invalid Host options.`,
      metadata,
      'Pass only base, validate, and setup to contract.host().',
    )
  }
  return value as SettingsHostContribution
}

function registerSettings(ctx: Context, contribution: SettingsContribution): void {
  const contract = settingsContract(contribution)
  const options = contribution.kind === 'settings-host' ? contribution.options : undefined
  const scope = ctx.settings.register(settingsNamespace(contract.namespace), contract.schema, {
    applies: contract.applies,
    ...(options?.base === undefined ? {} : { base: options.base }),
    ...(options?.validate === undefined ? {} : { validate: options.validate }),
  })
  const dispose = options?.setup?.(scope, ctx)
  if (typeof dispose === 'function') ctx.effect(() => dispose, `dshx settings: ${contract.namespace}`)
}

function withRuntime(ctx: Context, result: unknown, metadata: HostPluginMetadata): unknown {
  if (!inspectBridgeEnabled() && (metadata.compatibility?.runtimePlugins?.length ?? 0) === 0) return result
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
      fail(
        'DSHX2002',
        'Host definition inject must be an array of non-empty service names.',
        metadata,
        'Use inject: ["serviceName"] or remove inject when no service is required.',
      )
    }
  }
  if (source.tools !== undefined && !Array.isArray(source.tools)) {
    fail(
      'DSHX2002',
      'Host definition tools must be an array of official ToolDefinition values.',
      metadata,
      'Use tools: [tool] or remove tools when this Host registers no tools.',
    )
  }
  if (source.commands !== undefined && !Array.isArray(source.commands)) {
    fail(
      'DSHX2002',
      'Host definition commands must be an array of official CommandDefinition values.',
      metadata,
      'Use commands: [command] or remove commands when this Host registers no commands.',
    )
  }
  if (source.prompts !== undefined) {
    if (!Array.isArray(source.prompts)) {
      fail(
        'DSHX2002',
        'Host definition prompts must be an array of definePromptSection() or definePromptContext() values.',
        metadata,
        'Use prompts: [definePromptSection({ ... }), definePromptContext({ ... })] or remove prompts.',
      )
    }
    for (const contribution of source.prompts) {
      const record =
        typeof contribution === 'object' && contribution !== null && !Array.isArray(contribution) ? (contribution as Record<string, unknown>) : undefined
      const section = record?.kind === 'section' && typeof record.section === 'object' && record.section !== null && !Array.isArray(record.section)
      const context = record?.kind === 'context' && typeof record.context === 'object' && record.context !== null && !Array.isArray(record.context)
      const expectedKeys = section ? ['kind', 'section'] : context ? ['kind', 'context'] : []
      if (record === undefined || expectedKeys.length === 0 || Object.keys(record).some(key => !expectedKeys.includes(key))) {
        fail(
          'DSHX2002',
          'Host definition prompts contains a malformed Prompt contribution.',
          metadata,
          'Create every item with definePromptSection({ ... }) or definePromptContext({ ... }); direct official registration remains available in setup(ctx).',
        )
      }
    }
  }
  if (source.settings !== undefined) {
    if (!Array.isArray(source.settings)) {
      fail(
        'DSHX2002',
        'Host definition settings must be an array of defineSettings() contracts.',
        metadata,
        'Use settings: [contract] or remove settings when this Host owns no Settings namespace.',
      )
    }
    source.settings.forEach((setting, index) => validateSettingsContribution(setting, metadata, index))
  }
  if (source.api !== undefined && (typeof source.api !== 'object' || source.api === null || Array.isArray(source.api))) {
    fail('DSHX2002', 'Host api must be a value returned by api.host().', metadata, 'Use api: contract.host({ method() { ... } }) or remove api.')
  }
  if (
    source.apis !== undefined &&
    (!Array.isArray(source.apis) || source.apis.some(item => typeof item !== 'object' || item === null || Array.isArray(item)))
  ) {
    fail('DSHX2002', 'Host apis must be an array of values returned by api.host().', metadata, 'Use apis: [contract.host({ ... })] or remove apis.')
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
  if ((definition.commands?.length ?? 0) > 0 && !inject.includes('commands')) inject.push('commands')
  if ((definition.prompts?.length ?? 0) > 0 && !inject.includes('systemPrompt')) inject.push('systemPrompt')
  if ((definition.settings?.length ?? 0) > 0 && !inject.includes('settings')) inject.push('settings')
  const apis = normalizeApis(definition)
  if (apis.length > 0 && !inject.includes('connection')) inject.push('connection')
  return {
    name: definition.name ?? fallbackName(metadata),
    inject,
    apply(ctx) {
      for (const tool of definition.tools ?? []) ctx.tools.register(tool)
      for (const command of definition.commands ?? []) ctx.commands.register(command)
      for (const prompt of definition.prompts ?? []) {
        if (prompt.kind === 'section') ctx.systemPrompt.section(prompt.section)
        else ctx.systemPrompt.context(prompt.context)
      }
      for (const setting of definition.settings ?? []) registerSettings(ctx, setting)
      if (apis.length === 0) return withRuntime(ctx, definition.setup?.(ctx), metadata)
      const apiSetup = Promise.all(apis.map(api => registerApi(ctx, metadata.packageId, api)))
      return withRuntime(
        ctx,
        apiSetup.then(() => definition.setup?.(ctx)),
        metadata,
      )
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
