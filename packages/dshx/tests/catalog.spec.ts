import { describe, expect, it, vi } from 'vitest'
import { catalogProjectCapabilities } from '../src/catalog/index.js'
import type { ResolvedDshxConfig } from '../src/config/index.js'
import { RC8_COMPATIBILITY } from '../src/compat/index.js'
import type { DshCatalogCompatibility } from '../src/compat/index.js'

function project(): ResolvedDshxConfig {
  return {
    root: '/project/plugin', packageFile: '/project/plugin/package.json', configFile: '/project/plugin/dshx.config.ts', configDependencies: [],
    packageId: '@test/plugin', name: '@test/plugin', hostEntry: '/project/plugin/src/host.ts', outDir: '/project/plugin/dist', profile: 'web', dev: { hostRestart: 'manual' }, build: { sourcemap: true }, compatibility: { allowUnsupported: false }, manifest: { name: '@test/plugin', type: 'module' },
  }
}

function installation(catalog: DshCatalogCompatibility = { targets: ['slots', 'tools', 'services', 'events'], source: 'package-metadata' }) {
  return {
    version: '0.1.0-rc.8', executable: 'local' as const, support: 'verified' as const, adapterId: RC8_COMPATIBILITY.id,
    protocolGeneration: RC8_COMPATIBILITY.protocolGeneration, supportedRange: RC8_COMPATIBILITY.dshRange,
    compatibility: { ...RC8_COMPATIBILITY, catalog }, diagnostics: [],
  }
}

describe('offline Catalog provider', () => {
  it('normalizes package metadata and never checks Profile state', async () => {
    const provider = {
      listSlots: vi.fn(async () => [{ name: 'sidebar.footer.action', kind: 'list', package: '@provider/sidebar' }]),
      listTools: vi.fn(async () => []),
      listServices: vi.fn(async () => []),
      listEvents: vi.fn(async () => []),
    }
    const result = await catalogProjectCapabilities(project(), 'slots', {
      provider,
      resolveDsh: async () => installation(),
    })
    expect(result.source).toBe('offline')
    expect(result.items).toEqual([{ name: 'sidebar.footer.action', kind: 'list', metadata: { package: '@provider/sidebar' } }])
    expect(result.diagnostics).toEqual([])
    expect(provider.listSlots).toHaveBeenCalledOnce()
  })

  it('returns a stable unsupported diagnostic for rc.8 without metadata capability', async () => {
    const result = await catalogProjectCapabilities(project(), 'slots', {
      provider: { listSlots: async () => [], listTools: async () => [], listServices: async () => [], listEvents: async () => [] },
      resolveDsh: async () => installation({ targets: [], source: 'unavailable' }),
    })
    expect(result.source).toBe('offline')
    expect(result.items).toEqual([])
    expect(result.diagnostics[0]).toMatchObject({ code: 'DSHX3301', severity: 'error' })
  })

  it('rejects malformed static metadata as DSHX3303', async () => {
    const result = await catalogProjectCapabilities(project(), 'tools', {
      provider: { listSlots: async () => [], listTools: async () => [{ name: '', description: 1 } as never], listServices: async () => [], listEvents: async () => [] },
      resolveDsh: async () => installation(),
    })
    expect(result.diagnostics[0]).toMatchObject({ code: 'DSHX3303', severity: 'error' })
    expect(result.cause).toBeDefined()
  })

  it('maps provider failures without connecting to a runtime bridge', async () => {
    const failure = new Error('metadata unavailable')
    const result = await catalogProjectCapabilities(project(), 'events', {
      provider: { listSlots: async () => [], listTools: async () => [], listServices: async () => [], listEvents: async () => { throw failure } },
      resolveDsh: async () => installation(),
    })
    expect(result.diagnostics[0]).toMatchObject({ code: 'DSHX3302', severity: 'error' })
    expect(result.cause).toBe(failure)
  })
})
