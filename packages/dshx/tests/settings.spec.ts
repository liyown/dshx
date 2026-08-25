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
        decode(value): { showActivity: boolean } | undefined {
          if (typeof value !== 'object' || value === null || !('showActivity' in value)) return undefined
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
    const validate = (value: { enabled: boolean }): void => { void value.enabled }
    const contribution = contract.host({ base, validate })
    expect(contribution).toEqual({ kind: 'settings-host', contract, options: { base, validate } })
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
})
