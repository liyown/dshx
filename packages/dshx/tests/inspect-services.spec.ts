import { describe, expect, it, vi } from 'vitest'
import { inspectProjectComposition, normalizeEvents, normalizeServices } from '../src/inspect/index.js'
import type { ResolvedDshxConfig } from '../src/config/index.js'
import { RC8_COMPATIBILITY } from '../src/compat/index.js'

function project(): ResolvedDshxConfig {
  return {
    root: '/project/plugin', packageFile: '/project/plugin/package.json', configDependencies: [], packageId: 'demo-plugin', name: 'demo-plugin', hostEntry: '/project/plugin/src/host.ts', outDir: '/project/plugin/dist', profile: 'web', dev: { hostRestart: 'manual' }, build: { sourcemap: true }, compatibility: { allowUnsupported: false }, manifest: { name: 'demo-plugin' },
  }
}

function installation() {
  return { version: '0.1.0-rc.8', executable: 'local' as const, support: 'verified' as const, adapterId: RC8_COMPATIBILITY.id, protocolGeneration: RC8_COMPATIBILITY.protocolGeneration, supportedRange: RC8_COMPATIBILITY.dshRange, compatibility: RC8_COMPATIBILITY, diagnostics: [] }
}

function linked(value: ResolvedDshxConfig) {
  return { state: 'linked' as const, profile: value.profile, packageId: value.packageId, root: value.root }
}

describe('services and events inspect normalization', () => {
  it('normalizes summaries and preserves metadata', () => {
    expect(normalizeServices([{ name: 'logger', provider: 'core', scope: 'global', version: '1' }])).toEqual([{ name: 'logger', provider: 'core', scope: 'global', metadata: { version: '1' } }])
    expect(normalizeEvents([{ name: 'agent.ready', provider: 'agent', payload: { type: 'object' } }])).toEqual([{ name: 'agent.ready', provider: 'agent', metadata: { payload: { type: 'object' } } }])
  })

  it('rejects malformed summaries', () => {
    expect(() => normalizeServices([{ name: '', scope: 'global' }])).toThrow('non-empty string name')
    expect(() => normalizeServices([{ name: 'logger', scope: 1 }])).toThrow('must be a string')
    expect(() => normalizeEvents('bad')).toThrow('must be an array')
  })

  it('queries injected services and events providers without mutation', async () => {
    const value = project()
    const provider = {
      listSlots: vi.fn(async () => []),
      listTools: vi.fn(async () => []),
      listServices: vi.fn(async () => [{ name: 'logger', scope: 'global' }]),
      listEvents: vi.fn(async () => [{ name: 'agent.ready' }]),
    }
    const inspectProfile = vi.fn(async () => linked(value))
    const compatibility = { ...RC8_COMPATIBILITY, inspect: { targets: ['services', 'events'] as const, provider: 'runtime' as const } }
    const resolveDsh = async () => ({ ...installation(), compatibility })
    const services = await inspectProjectComposition(value, 'services', { provider, resolveDsh, inspectProfile })
    const events = await inspectProjectComposition(value, 'events', { provider, resolveDsh, inspectProfile })
    expect(services.items).toEqual([{ name: 'logger', scope: 'global' }])
    expect(events.items).toEqual([{ name: 'agent.ready' }])
    expect(inspectProfile).toHaveBeenCalledTimes(2)
  })

  it('reports missing optional provider methods as unsupported', async () => {
    const value = project()
    const compatibility = { ...RC8_COMPATIBILITY, inspect: { targets: ['services'] as const, provider: 'runtime' as const } }
    const result = await inspectProjectComposition(value, 'services', {
      provider: { listSlots: async () => [], listTools: async () => [] },
      resolveDsh: async () => ({ ...installation(), compatibility }),
      inspectProfile: async () => linked(value),
    })
    expect(result.diagnostics[0]?.code).toBe('DSHX3204')
  })

  it('reports rc.8 services/events as unsupported without querying a provider', async () => {
    const value = project()
    const listServices = vi.fn(async () => [{ name: 'should-not-run' }])
    const inspectProfile = vi.fn(async () => linked(value))
    const result = await inspectProjectComposition(value, 'services', {
      provider: { listSlots: async () => [], listTools: async () => [], listServices },
      resolveDsh: async () => installation(),
      inspectProfile,
    })
    expect(result.diagnostics[0]?.code).toBe('DSHX3204')
    expect(listServices).not.toHaveBeenCalled()
    expect(inspectProfile).not.toHaveBeenCalled()
  })
})
