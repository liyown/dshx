import type { Context } from '@deepseek-ai/cordis'
import { DshxError } from '../diagnostics.js'
import type { ClientDefinition, SlotContribution } from './types.js'
import { createSettingsClientRuntime, provideSettingsContext } from '../settings/client.js'

const CLIENT_DEFINITION_KEYS = new Set(['name', 'inject', 'slots', 'api', 'apis', 'setup'])

/** Project identity embedded by the Client compiler. */
export interface ClientPluginMetadata {
  readonly packageId: string
  readonly logicalName?: string
  readonly sourceFile?: string
  readonly settingsCapability?: boolean
}

/** Normalized Client module surface consumed by the virtual entry. */
export interface CreatedClientPlugin {
  readonly name: string
  readonly inject?: unknown
  readonly Config?: unknown
  apply(ctx: Context, config?: unknown): unknown
}

interface ClientSlotsService {
  inject(name: string, register: () => unknown): unknown
  register(options: Record<string, unknown>, component: unknown): unknown
}

type ClientRuntimeContext = Context & { readonly slots: ClientSlotsService }

function normalizeApis(definition: ClientDefinition): readonly import('../api/types.js').ApiContract[] {
  return [...(definition.api === undefined ? [] : [definition.api]), ...(definition.apis ?? [])]
}

function fail(code: 'DSHX2101' | 'DSHX2102' | 'DSHX2201' | 'DSHX2202', message: string, metadata: ClientPluginMetadata, hint: string): never {
  throw new DshxError(code, message, {
    ...(metadata.sourceFile === undefined ? {} : { file: metadata.sourceFile }),
    hint,
  })
}

function fallbackName(metadata: ClientPluginMetadata): string {
  return metadata.logicalName ?? metadata.packageId
}

function validateContribution(value: unknown, metadata: ClientPluginMetadata, index: number): SlotContribution {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    fail(
      'DSHX2201',
      `Client slot contribution at index ${index} must be an object returned by defineSlot().`,
      metadata,
      'Use defineSlot("slot.name", { component: Component, ...registrationOptions }) inside defineClient({ slots: [...] }).',
    )
  }
  const source = value as Record<string, unknown>
  if (typeof source.name !== 'string' || source.name.trim() === '') {
    fail(
      'DSHX2202',
      `Client slot contribution at index ${index} must have a non-empty name.`,
      metadata,
      'Use a declared SlotMap key as the first argument to defineSlot().',
    )
  }
  if (typeof source.options !== 'object' || source.options === null || Array.isArray(source.options)) {
    fail(
      'DSHX2202',
      `Client slot contribution at index ${index} has invalid registration options.`,
      metadata,
      'Pass the official Slot registration fields as the second argument to defineSlot().',
    )
  }
  if (typeof source.component !== 'function') {
    fail(
      'DSHX2202',
      `Client slot contribution at index ${index} must provide a component function.`,
      metadata,
      'Pass component: YourReactComponent to defineSlot().',
    )
  }
  return value as SlotContribution
}

function validateDefinition(value: unknown, metadata: ClientPluginMetadata): ClientDefinition {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    fail(
      'DSHX2101',
      'The default Client export must be an object returned by defineClient().',
      metadata,
      'Default-export defineClient({ setup(ctx) { ... } }) or use native named Client exports without a default export.',
    )
  }
  const source = value as Record<string, unknown>
  const unknown = Object.keys(source).filter(key => !CLIENT_DEFINITION_KEYS.has(key))
  if (unknown.length > 0) {
    fail(
      'DSHX2102',
      `Client definition contains unknown field${unknown.length === 1 ? '' : 's'}: ${unknown.join(', ')}.`,
      metadata,
      'Remove unsupported fields and put direct Cordis behavior in setup(ctx), or use slots: [defineSlot("slot.name", { component })] for Slot contributions.',
    )
  }
  if (source.name !== undefined && (typeof source.name !== 'string' || source.name.trim() === '')) {
    fail('DSHX2102', 'Client definition name must be a non-empty string.', metadata, 'Remove name to use the resolved logical project name.')
  }
  if (source.inject !== undefined) {
    if (!Array.isArray(source.inject) || source.inject.some(item => typeof item !== 'string' || item.trim() === '')) {
      fail(
        'DSHX2102',
        'Client definition inject must be an array of non-empty service names.',
        metadata,
        'Use inject: ["serviceName"] or remove inject when no service is required.',
      )
    }
  }
  if (source.slots !== undefined) {
    if (!Array.isArray(source.slots)) {
      fail(
        'DSHX2202',
        'Client definition slots must be an array of defineSlot() contributions.',
        metadata,
        'Use slots: [defineSlot("slot.name", { component })] or remove slots.',
      )
    }
    source.slots.forEach((slot, index) => validateContribution(slot, metadata, index))
  }
  if (source.setup !== undefined && typeof source.setup !== 'function') {
    fail('DSHX2102', 'Client definition setup must be a function.', metadata, 'Use setup(ctx) { ... } or remove setup.')
  }
  if (source.api !== undefined && (typeof source.api !== 'object' || source.api === null || Array.isArray(source.api))) {
    fail('DSHX2102', 'Client api must be a value returned by defineApi().', metadata, 'Use api: contract or remove api.')
  }
  if (
    source.apis !== undefined &&
    (!Array.isArray(source.apis) || source.apis.some(item => typeof item !== 'object' || item === null || Array.isArray(item)))
  ) {
    fail('DSHX2102', 'Client apis must be an array of values returned by defineApi().', metadata, 'Use apis: [contract] or remove apis.')
  }
  return value as ClientDefinition
}

/** Convert a definition into the standard Cordis Client module contract. */
export function createClientPlugin(value: unknown, metadata: ClientPluginMetadata): CreatedClientPlugin {
  const definition = validateDefinition(value, metadata)
  const inject = [
    ...new Set([
      ...(definition.inject ?? []),
      ...(definition.slots !== undefined && definition.slots.length > 0 ? ['slots'] : []),
      ...(normalizeApis(definition).length > 0 ? ['connection'] : []),
    ]),
  ]
  const apis = normalizeApis(definition)
  if (metadata.settingsCapability === true && !inject.includes('settingsScope')) inject.push('settingsScope')
  return {
    name: definition.name ?? fallbackName(metadata),
    inject,
    apply(ctx) {
      const client = ctx as ClientRuntimeContext
      const settings = metadata.settingsCapability === true ? createSettingsClientRuntime(ctx) : undefined
      if (apis.length === 0) {
        for (const slot of definition.slots ?? []) {
          const component = settings === undefined ? slot.component : provideSettingsContext(slot.component as any, settings)
          client.slots.inject(slot.name, () => client.slots.register({ name: slot.name, ...slot.options }, component))
        }
        return definition.setup?.(ctx)
      }
      return import('../api/client.js').then(({ createApiClient, provideApiContext }) => {
        const apiClients = new Map(apis.map(contract => [contract, createApiClient(ctx, contract, metadata.packageId)]))
        for (const slot of definition.slots ?? []) {
          const apiComponent = provideApiContext(slot.component as any, apiClients)
          const component = settings === undefined ? apiComponent : provideSettingsContext(apiComponent, settings)
          client.slots.inject(slot.name, () => client.slots.register({ name: slot.name, ...slot.options }, component))
        }
        return definition.setup?.(ctx)
      })
    },
  }
}

/** Normalize either a defineClient default export or an existing native Client module. */
export function createClientModule(source: Record<string, unknown>, metadata: ClientPluginMetadata): CreatedClientPlugin {
  if (Object.hasOwn(source, 'default')) return createClientPlugin(source.default, metadata)
  if (typeof source.apply !== 'function') {
    fail(
      'DSHX2101',
      'A native Client module must export an apply function.',
      metadata,
      'Export default defineClient({ setup(ctx) { ... } }) or export function apply(ctx, config) { ... }.',
    )
  }
  if (source.name !== undefined && (typeof source.name !== 'string' || source.name.trim() === '')) {
    fail('DSHX2102', 'Native Client export name must be a non-empty string.', metadata, 'Remove name to use the resolved logical project name.')
  }
  const apply = source.apply as (ctx: Context, config?: unknown) => unknown
  return {
    name: (source.name as string | undefined) ?? fallbackName(metadata),
    ...(source.inject === undefined ? {} : { inject: source.inject }),
    ...(source.Config === undefined ? {} : { Config: source.Config }),
    apply(ctx, config) {
      return apply(ctx, config)
    },
  }
}
