import type { Context } from '@deepseek-ai/cordis'
import { DshxError } from '../diagnostics.js'
import type { ClientConversationContribution, ClientDefinition, SlotContribution } from './types.js'
import { createApiClientRuntime, provideApiContext } from '../api/client.js'
import { createSettingsClientRuntime, provideSettingsContext } from '../settings/client.js'

const CLIENT_DEFINITION_KEYS = new Set(['name', 'inject', 'conversations', 'slots', 'api', 'apis', 'setup'])

/** Project identity embedded by the Client compiler. */
export interface ClientPluginMetadata {
  readonly packageId: string
  readonly logicalName?: string
  readonly sourceFile?: string
  readonly settingsCapability?: boolean
  readonly apiCapability?: boolean
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

interface ClientConversationEventsService {
  register(definition: unknown): unknown
}

type ClientRuntimeContext = Context & {
  readonly conversationEvents: ClientConversationEventsService
  readonly slots: ClientSlotsService
}

function normalizeApis(definition: ClientDefinition): readonly import('../api/types.js').ApiContract[] {
  return [...(definition.api === undefined ? [] : [definition.api]), ...(definition.apis ?? [])]
}

function fail(
  code: 'DSHX2101' | 'DSHX2102' | 'DSHX2201' | 'DSHX2202' | 'DSHX2301' | 'DSHX2302',
  message: string,
  metadata: ClientPluginMetadata,
  hint: string,
): never {
  throw new DshxError(code, message, {
    ...(metadata.sourceFile === undefined ? {} : { file: metadata.sourceFile }),
    hint,
  })
}

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined
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

function validateConversationContribution(value: unknown, metadata: ClientPluginMetadata, index: number): ClientConversationContribution {
  const source = record(value)
  if (
    source === undefined ||
    source.kind !== 'conversation-component' ||
    source.marker !== 'dshx.conversation-component.v1' ||
    Object.keys(source).some(key => key !== 'kind' && key !== 'marker' && key !== 'contract' && key !== 'definition' && key !== 'renderer')
  ) {
    fail(
      'DSHX2301',
      `Client Conversation contribution at index ${index} must be an object returned by defineConversation(...).component(...).`,
      metadata,
      'Create the contribution with defineConversation({ kind, events }).component({ initial, reduce, view, component }).',
    )
  }

  const contract = record(source.contract)
  const definition = record(source.definition)
  const renderer = record(source.renderer)
  const rendererOptions = record(renderer?.options)
  const contractKind = contract?.kind
  if (
    contract === undefined ||
    typeof contractKind !== 'string' ||
    contractKind.trim() === '' ||
    record(contract.events) === undefined ||
    typeof contract.component !== 'function' ||
    definition === undefined ||
    definition.kind !== contractKind ||
    definition.target !== 'chat' ||
    typeof definition.match !== 'function' ||
    typeof definition.start !== 'function' ||
    typeof definition.update !== 'function' ||
    typeof definition.buildViewNode !== 'function' ||
    renderer === undefined ||
    renderer.name !== 'conversation.chat.node' ||
    rendererOptions === undefined ||
    rendererOptions.key !== contractKind ||
    rendererOptions.locale !== 'conversation' ||
    typeof renderer.component !== 'function'
  ) {
    fail(
      'DSHX2302',
      `Client Conversation contribution at index ${index} has an inconsistent contract, Definition, or renderer.`,
      metadata,
      'Keep the value returned by contract.component() intact; its Definition kind and renderer key must match the contract kind.',
    )
  }
  return value as ClientConversationContribution
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
  if (source.conversations !== undefined) {
    if (!Array.isArray(source.conversations)) {
      fail(
        'DSHX2302',
        'Client definition conversations must be an array of Conversation component contributions.',
        metadata,
        'Use conversations: [contract.component({ ... })] or remove conversations.',
      )
    }
    source.conversations.forEach((conversation, index) => validateConversationContribution(conversation, metadata, index))
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

type ComponentDecorator = (component: unknown) => unknown

function registerContributions(client: ClientRuntimeContext, definition: ClientDefinition, decorate: ComponentDecorator): void {
  for (const conversation of definition.conversations ?? []) {
    client.conversationEvents.register(conversation.definition)
    const renderer = conversation.renderer
    client.slots.inject(renderer.name, () => client.slots.register({ name: renderer.name, ...renderer.options }, decorate(renderer.component)))
  }
  for (const slot of definition.slots ?? []) {
    client.slots.inject(slot.name, () => client.slots.register({ name: slot.name, ...slot.options }, decorate(slot.component)))
  }
}

/** Convert a definition into the standard Cordis Client module contract. */
export function createClientPlugin(value: unknown, metadata: ClientPluginMetadata): CreatedClientPlugin {
  const definition = validateDefinition(value, metadata)
  const hasConversations = (definition.conversations?.length ?? 0) > 0
  const apis = normalizeApis(definition)
  const hasApiCapability = metadata.apiCapability === true || apis.length > 0
  const inject = [
    ...new Set([
      ...(definition.inject ?? []),
      ...(hasConversations ? ['conversationEvents'] : []),
      ...((definition.slots?.length ?? 0) > 0 || hasConversations ? ['slots'] : []),
      ...(hasApiCapability ? ['connection'] : []),
    ]),
  ]
  if (metadata.settingsCapability === true && !inject.includes('settingsScope')) inject.push('settingsScope')
  return {
    name: definition.name ?? fallbackName(metadata),
    inject,
    apply(ctx) {
      const client = ctx as ClientRuntimeContext
      const settings = metadata.settingsCapability === true ? createSettingsClientRuntime(ctx) : undefined
      if (!hasApiCapability) {
        registerContributions(client, definition, component => (settings === undefined ? component : provideSettingsContext(component as any, settings)))
        return definition.setup?.(ctx)
      }
      const apiClient = createApiClientRuntime(ctx, metadata.packageId, apis)
      registerContributions(client, definition, component => {
        const apiComponent = provideApiContext(component as any, apiClient)
        return settings === undefined ? apiComponent : provideSettingsContext(apiComponent, settings)
      })
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
