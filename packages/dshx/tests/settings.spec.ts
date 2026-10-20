import Schema from '@deepseek-ai/schemastery'
import { describe, expect, expectTypeOf, it } from 'vitest'
import { createHostPlugin } from '../src/host/runtime.js'
import { defineSettings, type SettingsValue } from '../src/settings/index.js'

describe('defineSettings', () => {
  it('marks the root Config schema volatile so DSH serves every field live', () => {
    const schema = Schema.object({ showActivity: Schema.boolean().default(true) })
    const contract = defineSettings({ schema })

    expect(contract.schema).not.toBe(schema)
    expect(contract.schema.meta.volatile).toBe(true)
    expect(Object.keys(contract)).toEqual(['schema'])
    expectTypeOf<SettingsValue<typeof schema>>().toEqualTypeOf<{ showActivity: boolean }>()
  })

  it('leaves secret redaction to the role markers DSH reads', () => {
    const schema = Schema.object({
      showActivity: Schema.boolean().default(true),
      token: Schema.string().role('secret'),
    })
    const contract = defineSettings({ schema })

    expect(JSON.stringify(contract.schema.toJSON())).toContain('secret')
  })

  it('rejects field-level volatile markers because the root is already live', () => {
    const schema = Schema.object({ showActivity: Schema.boolean().volatile() })

    expect(() => defineSettings({ schema })).toThrow('root Config schema volatile')
  })

  it('rejects values that are not official Schemastery schemas', () => {
    expect(() => defineSettings({ schema: {} as never })).toThrow('official Schemastery schema')
  })

  it('exports the schema as the Host Config module surface', () => {
    const schema = Schema.object({ enabled: Schema.boolean().default(true) })
    const contract = defineSettings({ schema })
    const plugin = createHostPlugin({ config: contract }, { packageId: '@test/plugin' })

    expect(plugin.Config).toBe(contract.schema)
    expect(plugin.inject).not.toContain('settings')
  })

  it('rejects the removed settings array, malformed contracts, and unknown Host fields', () => {
    const contract = defineSettings({ schema: Schema.object({ enabled: Schema.boolean() }) })

    expect(() => createHostPlugin({ settings: [contract] }, { packageId: '@test/plugin' })).toThrow(
      expect.objectContaining({ code: 'DSHX2002', message: expect.stringContaining('settings') }),
    )
    expect(() => createHostPlugin({ config: { schema: Schema.object({}) } }, { packageId: '@test/plugin' })).toThrow(
      expect.objectContaining({ code: 'DSHX2002', hint: expect.stringContaining('defineSettings') }),
    )
    expect(() => createHostPlugin({ config: { ...contract, extra: true } }, { packageId: '@test/plugin' })).toThrow(
      expect.objectContaining({ code: 'DSHX2002' }),
    )
  })
})
