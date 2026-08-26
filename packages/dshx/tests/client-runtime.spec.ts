import type { Context } from '@deepseek-ai/cordis'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { describe, expect, expectTypeOf, it, vi } from 'vitest'
import { defineClient, defineSlot } from '../src/client/index.js'
import { slotContributionParts } from '../src/client/define.js'
import type { ClientConversationContribution } from '../src/client/types.js'
import { defineConversation } from '../src/conversation/index.js'
import { getConversationContributionParts } from '../src/conversation/define.js'
import { createClientModule, createClientPlugin } from '../src/client/runtime.js'
import { createSettingsClientRuntime } from '../src/settings/client.js'
import { defineSettings } from '../src/settings/index.js'
import Schema from '@deepseek-ai/schemastery'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface SlotMap {
    'test.slot': { kind: 'list'; scope: 'root' }
  }
}

function conversationContribution(kind = 'review-job'): ClientConversationContribution {
  return defineConversation({
    kind,
    events: {
      'dshx-test/notice': { role: 'start', id: () => kind },
    },
    initial: () => ({ ready: true }),
  }).render(() => null)
}

describe('defineClient', () => {
  it('preserves identity, literals, and the official Context type', () => {
    const original = {
      name: 'literal-client' as const,
      inject: ['slots'] as const,
      setup(ctx: Context) {
        expectTypeOf(ctx).toEqualTypeOf<Context>()
      },
    }
    const definition = defineClient(original)
    expect(definition).toBe(original)
    expectTypeOf(definition.name).toEqualTypeOf<'literal-client'>()
    expectTypeOf(definition.inject).toEqualTypeOf<readonly ['slots']>()
  })

  it('rejects removed Client api declarations at compile time', () => {
    defineClient({
      // @ts-expect-error API capability comes only from retained hooks.
      api: {},
    })
  })

  it('uses official SlotMap props and preserves a Slot contribution', () => {
    const component = (_props: PropsRuntime<'test.slot'>) => null
    const options = { id: 'test-entry', order: 3, component }
    const contribution = defineSlot('test.slot', options)
    expect(contribution).toEqual({})
    expect(slotContributionParts(contribution)).toEqual({ name: 'test.slot', options: { id: 'test-entry', order: 3 }, component })
    expectTypeOf(contribution).toMatchTypeOf<import('../src/client/types.js').SlotContribution<'test.slot'>>()
    // @ts-expect-error Unknown SlotMap keys must be provided by an official augmentation.
    defineSlot('missing.slot', { component })
  })
})
describe('Client runtime adapter', () => {
  it('applies definition name, inject normalization, and async setup', async () => {
    const setup = vi.fn(async (ctx: Context) => ctx)
    const context = {} as Context
    const plugin = createClientPlugin(
      { name: 'explicit-client', inject: ['remote', 'remote', 'slots'], setup },
      {
        packageId: '@test/plugin',
        logicalName: 'logical-client',
        sourceFile: '/project/src/client.tsx',
      },
    )
    expect(plugin.name).toBe('explicit-client')
    expect(plugin.inject).toEqual(['remote', 'slots'])
    await plugin.apply(context)
    expect(setup).toHaveBeenCalledWith(context)
  })

  it('registers Slots in order before setup and adds the slots dependency once', () => {
    const calls: string[] = []
    const first = defineSlot('test.slot', { id: 'first', component: () => null })
    const second = defineSlot('test.slot', { id: 'second', component: () => null })
    const plugin = createClientPlugin(
      {
        inject: ['remote', 'slots'],
        slots: [first, second],
        setup() {
          calls.push('setup')
        },
      },
      {
        packageId: '@test/plugin',
        sourceFile: '/project/src/client.tsx',
      },
    )
    expect(plugin.inject).toEqual(['remote', 'slots'])
    const registered: unknown[] = []
    plugin.apply({
      slots: {
        inject(name: string, register: () => unknown) {
          calls.push(`inject:${name}`)
          return register()
        },
        register(options: Record<string, unknown>, component: unknown) {
          calls.push(`register:${String(options.id)}`)
          registered.push({ options, component })
          return vi.fn()
        },
      },
    } as unknown as Context)
    expect(calls).toEqual(['inject:test.slot', 'register:first', 'inject:test.slot', 'register:second', 'setup'])
    expect(registered).toHaveLength(2)
  })

  it('does not inject or register an empty Slot list', () => {
    const setup = vi.fn()
    const plugin = createClientPlugin({ slots: [], setup }, { packageId: '@test/plugin' })
    expect(plugin.inject).toEqual([])
    plugin.apply({ slots: { inject: vi.fn(), register: vi.fn() } } as unknown as Context)
    expect(setup).toHaveBeenCalledOnce()
  })

  it('registers each Conversation Definition before its paired keyed renderer and then setup', () => {
    const calls: string[] = []
    const first = conversationContribution('review-job')
    const second = conversationContribution('audit-job')
    const firstParts = getConversationContributionParts(first)
    const secondParts = getConversationContributionParts(second)
    const setup = vi.fn(() => {
      calls.push('setup')
    })
    const plugin = createClientPlugin(
      {
        inject: ['conversationEvents', 'conversationEvents'],
        conversations: [first, second],
        setup,
      },
      { packageId: '@test/plugin' },
    )
    expect(plugin.inject).toEqual(['conversationEvents', 'slots'])

    const definitions: unknown[] = []
    const renderers: unknown[] = []
    const disposers: Array<ReturnType<typeof vi.fn>> = []
    plugin.apply({
      conversationEvents: {
        register(definition: { kind: string }) {
          calls.push(`definition:${definition.kind}`)
          definitions.push(definition)
          const dispose = vi.fn()
          disposers.push(dispose)
          return dispose
        },
      },
      slots: {
        inject(name: string, register: () => unknown) {
          calls.push(`inject:${name}`)
          return register()
        },
        register(options: Record<string, unknown>, component: unknown) {
          calls.push(`renderer:${String(options.key)}`)
          renderers.push({ options, component })
          const dispose = vi.fn()
          disposers.push(dispose)
          return dispose
        },
      },
    } as unknown as Context)

    expect(calls).toEqual([
      'definition:review-job',
      'inject:conversation.chat.node',
      'renderer:review-job',
      'definition:audit-job',
      'inject:conversation.chat.node',
      'renderer:audit-job',
      'setup',
    ])
    expect(definitions).toEqual([firstParts.definition, secondParts.definition])
    expect(renderers).toEqual([
      { options: { name: 'conversation.chat.node', key: 'review-job', locale: 'conversation' }, component: firstParts.renderer.component },
      { options: { name: 'conversation.chat.node', key: 'audit-job', locale: 'conversation' }, component: secondParts.renderer.component },
    ])
    expect(disposers).toHaveLength(4)
    expect(disposers.every(dispose => dispose.mock.calls.length === 0)).toBe(true)
  })

  it('does not inject or register an empty Conversation list', () => {
    const setup = vi.fn()
    const plugin = createClientPlugin({ conversations: [], setup }, { packageId: '@test/plugin' })
    expect(plugin.inject).toEqual([])
    plugin.apply({} as Context)
    expect(setup).toHaveBeenCalledOnce()
  })

  it('applies API and Settings providers to Conversation renderers without wrapping Definitions', async () => {
    const conversation = conversationContribution()
    const parts = getConversationContributionParts(conversation)
    const definitions: unknown[] = []
    const renderers: unknown[] = []
    const get = vi.fn(() => undefined)
    const plugin = createClientPlugin({ conversations: [conversation] }, { packageId: '@test/plugin', settingsCapability: true, apiCapability: true })
    expect(plugin.inject).toEqual(['conversationEvents', 'slots', 'connection', 'settingsScope'])
    await plugin.apply({
      get,
      conversationEvents: {
        register: (definition: unknown) => {
          definitions.push(definition)
        },
      },
      slots: {
        inject: (_name: string, register: () => unknown) => register(),
        register: (_options: unknown, component: unknown) => {
          renderers.push(component)
        },
      },
    } as unknown as Context)
    expect(definitions).toEqual([parts.definition])
    expect(renderers).toHaveLength(1)
    expect(renderers[0]).not.toBe(parts.renderer.component)
    expect(get).toHaveBeenCalledWith('settingsScope')
    // Connection remains lazy until the renderer actually calls useApi().
    expect(get).not.toHaveBeenCalledWith('connection')
  })

  it('adds settingsScope from compiler metadata without a Client settings declaration', () => {
    const slot = defineSlot('test.slot', { id: 'settings', component: () => null })
    const get = vi.fn(() => ({ bind: vi.fn(), describe: vi.fn() }))
    const registered: unknown[] = []
    const plugin = createClientPlugin({ slots: [slot] }, { packageId: '@test/plugin', settingsCapability: true })
    expect(plugin.inject).toEqual(['slots', 'settingsScope'])
    plugin.apply({
      get,
      slots: {
        inject: (_name: string, register: () => unknown) => register(),
        register: (_options: unknown, component: unknown) => {
          registered.push(component)
        },
      },
    } as unknown as Context)
    expect(get).toHaveBeenCalledWith('settingsScope')
    expect(registered).toHaveLength(1)
    expect(registered[0]).not.toBe(slotContributionParts(slot).component)
  })

  it('adds Connection and a lazy API provider from compiler metadata without Client api/apis', async () => {
    const slot = defineSlot('test.slot', { id: 'api-hook', component: () => null })
    const get = vi.fn(() => ({ rpc: { call: vi.fn() } }))
    const registered: unknown[] = []
    const plugin = createClientPlugin({ inject: ['connection', 'connection'], slots: [slot] }, { packageId: '@test/plugin', apiCapability: true })
    expect(plugin.inject).toEqual(['connection', 'slots'])
    await plugin.apply({
      get,
      slots: {
        inject: (_name: string, register: () => unknown) => register(),
        register: (_options: unknown, component: unknown) => {
          registered.push(component)
        },
      },
    } as unknown as Context)
    expect(registered).toHaveLength(1)
    expect(registered[0]).not.toBe(slotContributionParts(slot).component)
    // Retained-hook contracts bind only when their component invokes useApi().
    expect(get).not.toHaveBeenCalled()
  })

  it('reuses one official bound scope per contract identity', () => {
    const snapshot = { status: 'ready', value: { enabled: true }, base: {}, user: {}, revision: 1, writable: true, mode: 'host' }
    const scope = { getSnapshot: () => snapshot, subscribe: () => () => undefined, set: vi.fn(), unset: vi.fn() }
    const describe = {
      getSnapshot: () => ({ status: 'ready', view: { namespaces: [], writable: true }, error: null }),
      subscribe: () => () => undefined,
      ensure: vi.fn(),
    }
    const bind = vi.fn(() => scope)
    const runtime = createSettingsClientRuntime({ get: () => ({ bind, describe: () => describe }) })
    const first = defineSettings({ namespace: 'first', schema: Schema.object({ enabled: Schema.boolean() }) })
    const sameShape = defineSettings({ namespace: 'first', schema: first.schema })
    expect(runtime.binding(first)).toBe(runtime.binding(first))
    expect(runtime.binding(sameShape)).not.toBe(runtime.binding(first))
    expect(bind).toHaveBeenCalledTimes(2)
    expect(bind).toHaveBeenNthCalledWith(1, { namespace: 'first' })
  })

  it('falls back from logical name to package id', () => {
    expect(createClientPlugin({}, { packageId: '@test/package', logicalName: 'logical' }).name).toBe('logical')
    expect(createClientPlugin({}, { packageId: '@test/package' }).name).toBe('@test/package')
  })

  it('preserves native Client exports and forwards config', () => {
    const Config = { marker: true }
    const apply = vi.fn(() => 'result')
    const source = { name: 'native-client', inject: { slots: null }, Config, apply }
    const plugin = createClientModule(source, { packageId: '@test/plugin', logicalName: 'logical' })
    const context = {} as Context
    const config = { enabled: true }
    expect(plugin).toMatchObject({ name: 'native-client', inject: source.inject, Config })
    expect(plugin.apply(context, config)).toBe('result')
    expect(apply).toHaveBeenCalledWith(context, config)
  })

  it('prefers a default definition over native named exports', () => {
    const setup = vi.fn()
    const plugin = createClientModule(
      { name: 'native', apply: vi.fn(), default: { name: 'default', setup } },
      {
        packageId: '@test/plugin',
      },
    )
    expect(plugin.name).toBe('default')
    plugin.apply({} as Context)
    expect(setup).toHaveBeenCalledOnce()
  })

  it.each([
    ['non-object definition', null, 'DSHX2101'],
    ['unknown field', { unknown: true }, 'DSHX2102'],
    ['empty name', { name: '' }, 'DSHX2102'],
    ['invalid inject', { inject: [''] }, 'DSHX2102'],
    ['invalid setup', { setup: true }, 'DSHX2102'],
    ['invalid conversations', { conversations: {} }, 'DSHX2302'],
    ['invalid Conversation contribution', { conversations: [{}] }, 'DSHX2301'],
    ['copied Conversation contribution', { conversations: [{ ...conversationContribution() }] }, 'DSHX2301'],
    ['invalid slots', { slots: {} }, 'DSHX2202'],
    ['invalid contribution', { slots: [{}] }, 'DSHX2201'],
  ])('rejects %s with a stable diagnostic', (_label, definition, code) => {
    expect(() =>
      createClientPlugin(definition, {
        packageId: '@test/plugin',
        sourceFile: '/project/src/client.tsx',
      }),
    ).toThrow(expect.objectContaining({ code, file: '/project/src/client.tsx', hint: expect.any(String) }))
  })

  it('rejects a native Client module without apply', () => {
    expect(() =>
      createClientModule(
        { name: 'broken' },
        {
          packageId: '@test/plugin',
          sourceFile: '/project/src/client.tsx',
        },
      ),
    ).toThrow(expect.objectContaining({ code: 'DSHX2101', file: '/project/src/client.tsx' }))
  })
})
