import type { Context } from '@deepseek-ai/cordis'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { describe, expect, expectTypeOf, it, vi } from 'vitest'
import { defineClient, defineSlot } from '../src/client/index.js'
import { createClientModule, createClientPlugin } from '../src/client/runtime.js'
import { createSettingsClientRuntime } from '../src/settings/client.js'
import { defineSettings } from '../src/settings/index.js'
import Schema from '@deepseek-ai/schemastery'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface SlotMap {
    'test.slot': { kind: 'list'; scope: 'root' }
  }
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

  it('uses official SlotMap props and preserves a Slot contribution', () => {
    const component = (_props: PropsRuntime<'test.slot'>) => null
    const options = { id: 'test-entry', order: 3, component }
    const contribution = defineSlot('test.slot', options)
    expect(contribution.name).toBe('test.slot')
    expect(contribution.options).toEqual({ id: 'test-entry', order: 3 })
    expect(contribution.component).toBe(component)
    expectTypeOf(contribution.component).toMatchTypeOf<(props: PropsRuntime<'test.slot'>) => unknown>()
    // @ts-expect-error Unknown SlotMap keys must be provided by an official augmentation.
    defineSlot('missing.slot', { component })
  })
})

describe('Client runtime adapter', () => {
  it('applies definition name, inject normalization, and async setup', async () => {
    const setup = vi.fn(async (ctx: Context) => ctx)
    const context = {} as Context
    const plugin = createClientPlugin({ name: 'explicit-client', inject: ['remote', 'remote', 'slots'], setup }, {
      packageId: '@test/plugin',
      logicalName: 'logical-client',
      sourceFile: '/project/src/client.tsx',
    })
    expect(plugin.name).toBe('explicit-client')
    expect(plugin.inject).toEqual(['remote', 'slots'])
    await plugin.apply(context)
    expect(setup).toHaveBeenCalledWith(context)
  })

  it('registers Slots in order before setup and adds the slots dependency once', () => {
    const calls: string[] = []
    const first = defineSlot('test.slot', { id: 'first', component: () => null })
    const second = defineSlot('test.slot', { id: 'second', component: () => null })
    const plugin = createClientPlugin({ inject: ['remote', 'slots'], slots: [first, second], setup() { calls.push('setup') } }, {
      packageId: '@test/plugin',
      sourceFile: '/project/src/client.tsx',
    })
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
        register: (_options: unknown, component: unknown) => { registered.push(component) },
      },
    } as unknown as Context)
    expect(get).toHaveBeenCalledWith('settingsScope')
    expect(registered).toHaveLength(1)
    expect(registered[0]).not.toBe(slot.component)
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
    const plugin = createClientModule({ name: 'native', apply: vi.fn(), default: { name: 'default', setup } }, {
      packageId: '@test/plugin',
    })
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
    ['invalid slots', { slots: {} }, 'DSHX2202'],
    ['invalid contribution', { slots: [{}] }, 'DSHX2202'],
  ])('rejects %s with a stable diagnostic', (_label, definition, code) => {
    expect(() => createClientPlugin(definition, {
      packageId: '@test/plugin',
      sourceFile: '/project/src/client.tsx',
    })).toThrow(expect.objectContaining({ code, file: '/project/src/client.tsx', hint: expect.any(String) }))
  })

  it('rejects a native Client module without apply', () => {
    expect(() => createClientModule({ name: 'broken' }, {
      packageId: '@test/plugin',
      sourceFile: '/project/src/client.tsx',
    })).toThrow(expect.objectContaining({ code: 'DSHX2101', file: '/project/src/client.tsx' }))
  })
})
