import Schema from '@deepseek-ai/schemastery'
import { describe, expect, expectTypeOf, it } from 'vitest'
import { useSettings } from '../src/client/index.js'
import { createHostPlugin } from '../src/host/runtime.js'
import { defineSettings, type SettingsState, type SettingsValue } from '../src/settings/index.js'

describe('defineSettings', () => {
  it('preserves namespace, schema identity, defaults, and Host value inference', () => {
    const schema = Schema.object({ showActivity: Schema.boolean().default(true) })
    const contract = defineSettings({ namespace: 'runtime-deck', schema })
    expect(contract.namespace).toBe('runtime-deck')
    expect(contract.schema).toBe(schema)
    expect(contract.applies).toBe('live')
    expectTypeOf<SettingsValue<typeof schema>>().toEqualTypeOf<{ showActivity: boolean }>()
    expectTypeOf(contract.namespace).toEqualTypeOf<string>()
  })

  it('infers a separate redacted Client value while keeping secret fields writable', () => {
    const schema = Schema.object({
      showActivity: Schema.boolean().default(true),
      token: Schema.string().role('secret'),
    })
    const contract = defineSettings({
      namespace: 'runtime-secret',
      schema,
      client: {
        decode(value): { showActivity: boolean } {
          if (typeof value !== 'object' || value === null || !('showActivity' in value)) throw new Error('invalid settings')
          return { showActivity: Boolean(value.showActivity) }
        },
      },
    })
    const typecheck = (): void => {
      const state = useSettings(contract)
      expectTypeOf(state).toMatchTypeOf<SettingsState<{ showActivity: boolean; token?: string }, { showActivity: boolean }>>()
      expectTypeOf(state.value).toEqualTypeOf<{ showActivity: boolean } | undefined>()
      void state.set('token', 'write-only')
      void state.unset('token')
      // @ts-expect-error The redacted Client value cannot expose the secret.
      void state.value?.token
    }
    expect(typecheck).toBeTypeOf('function')
  })

  it('keeps Host-only facets outside the portable contract', () => {
    const schema = Schema.object({ enabled: Schema.boolean().default(true) })
    const contract = defineSettings({ namespace: 'advanced', schema, applies: 'restart' })
    const base = { enabled: false }
    const validate = (value: { enabled: boolean }): void => {
      void value.enabled
    }
    const contribution = contract.host({ base, validate })
    expect(contribution).toEqual({})
    expect(contract).not.toHaveProperty('base')
    expect(contract).not.toHaveProperty('validate')
    expect(contract).not.toHaveProperty('setup')
  })

  it('rejects invalid namespaces and diagnoses secret contracts when a Host claims ownership', () => {
    expect(() => defineSettings({ namespace: 'Invalid_Namespace', schema: Schema.object({}) })).toThrow('must match')
    const secret = defineSettings({ namespace: 'secret-owner', schema: Schema.object({ token: Schema.string().role('secret') }) })
    expect(() => createHostPlugin({ settings: [secret] }, { packageId: '@test/plugin' })).toThrow(
      expect.objectContaining({ code: 'DSHX2002', hint: expect.stringContaining('Client-safe') }),
    )
  })

  it('rejects secret traversal through transforms even with a decoder', () => {
    const schema = Schema.transform(Schema.object({ token: Schema.string().role('secret') }), value => value)
    const contract = defineSettings({ namespace: 'unsafe-secret', schema, client: { decode: value => value as { token?: never } } })
    expect(() => createHostPlugin({ settings: [contract] }, { packageId: '@test/plugin' })).toThrow(
      expect.objectContaining({ code: 'DSHX2002', message: expect.stringContaining('unsupported schema path') }),
    )
  })

  it('rejects a secret role placed directly on an unsupported composite node', () => {
    const schema = Schema.union([Schema.object({ token: Schema.string() }), Schema.object({ token: Schema.number() })]).role('secret')
    const contract = defineSettings({ namespace: 'unsafe-union-secret', schema, client: { decode: () => ({}) } })
    expect(() => createHostPlugin({ settings: [contract] }, { packageId: '@test/plugin' })).toThrow(
      expect.objectContaining({ code: 'DSHX2002', message: expect.stringContaining('unsupported schema path') }),
    )
  })

  it('allows safe object/array secret paths and turns undefined decoder results into throws', () => {
    const schema = Schema.object({ entries: Schema.array(Schema.object({ token: Schema.string().role('secret') })) })
    const safe = defineSettings({ namespace: 'safe-secret', schema, client: { decode: () => ({ entries: [] as readonly unknown[] }) } })
    expect(() => createHostPlugin({ settings: [safe] }, { packageId: '@test/plugin' })).not.toThrow()

    const invalid = defineSettings({
      namespace: 'throwing-decoder',
      schema: Schema.object({ enabled: Schema.boolean() }),
      client: { decode: (() => undefined) as unknown as (value: unknown) => { enabled: boolean } },
    })
    expect(() => invalid.client?.decode({ enabled: true })).toThrow('returned undefined')
  })
})
