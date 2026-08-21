import type { Context } from '@deepseek-ai/cordis'
import { DshxError } from '../diagnostics.js'
import type { ClientDefinition, SlotContribution } from './types.js'

const CLIENT_DEFINITION_KEYS = new Set(['name', 'inject', 'slots', 'setup'])

/** Project identity embedded by the Client compiler. */
export interface ClientPluginMetadata {
  readonly packageId: string
  readonly logicalName?: string
  readonly sourceFile?: string
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

interface ClientRuntimeContext extends Context {
  readonly slots: ClientSlotsService
}

function fail(
  code: 'DSHX2101' | 'DSHX2102' | 'DSHX2201' | 'DSHX2202',
  message: string,
  metadata: ClientPluginMetadata,
  hint: string,
): never {
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
    fail('DSHX2202', `Client slot contribution at index ${index} must have a non-empty name.`, metadata, 'Use a declared SlotMap key as the first argument to defineSlot().')
  }
  if (typeof source.options !== 'object' || source.options === null || Array.isArray(source.options)) {
    fail('DSHX2202', `Client slot contribution at index ${index} has invalid registration options.`, metadata, 'Pass the official Slot registration fields as the second argument to defineSlot().')
  }
  if (typeof source.component !== 'function') {
    fail('DSHX2202', `Client slot contribution at index ${index} must provide a component function.`, metadata, 'Pass component: YourReactComponent to defineSlot().')
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
      fail('DSHX2102', 'Client definition inject must be an array of non-empty service names.', metadata, 'Use inject: ["serviceName"] or remove inject when no service is required.')
    }
  }
  let slots: readonly SlotContribution[] = []
  if (source.slots !== undefined) {
    if (!Array.isArray(source.slots)) {
      fail('DSHX2202', 'Client definition slots must be an array of defineSlot() contributions.', metadata, 'Use slots: [defineSlot("slot.name", { component })] or remove slots.')
    }
    slots = source.slots.map((slot, index) => validateContribution(slot, metadata, index))
  }
  if (source.setup !== undefined && typeof source.setup !== 'function') {
    fail('DSHX2102', 'Client definition setup must be a function.', metadata, 'Use setup(ctx) { ... } or remove setup.')
  }
  return value as ClientDefinition
}

/** Convert a definition into the standard Cordis Client module contract. */
export function createClientPlugin(value: unknown, metadata: ClientPluginMetadata): CreatedClientPlugin {
  const definition = validateDefinition(value, metadata)
  const inject = [...new Set([
    ...(definition.inject ?? []),
    ...(definition.slots !== undefined && definition.slots.length > 0 ? ['slots'] : []),
  ])]
  return {
    name: definition.name ?? fallbackName(metadata),
    inject,
    apply(ctx) {
      const client = ctx as ClientRuntimeContext
      for (const slot of definition.slots ?? []) {
        client.slots.inject(slot.name, () => client.slots.register({ name: slot.name, ...slot.options }, slot.component))
      }
      return definition.setup?.(ctx)
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
