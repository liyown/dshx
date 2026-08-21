import { describe, expect, it, vi } from 'vitest'
import { inspectProjectComposition, normalizeSlots, normalizeTools } from '../src/inspect/index.js'
import type { ResolvedDshxConfig } from '../src/config/index.js'
import { RC8_COMPATIBILITY } from '../src/compat/index.js'

function project(): ResolvedDshxConfig {
  return {
    root: '/project/plugin', packageFile: '/project/plugin/package.json', configFile: '/project/plugin/dshx.config.ts', configDependencies: [],
    packageId: '@test/plugin', name: '@test/plugin', hostEntry: '/project/plugin/src/host.ts',
    outDir: '/project/plugin/dist', profile: 'web', dev: { hostRestart: 'manual' }, build: { sourcemap: true }, compatibility: { allowUnsupported: false },
    manifest: { name: '@test/plugin', type: 'module' },
  }
}

function installation() {
  return { version: '0.1.0-rc.8', executable: 'local' as const, support: 'verified' as const, adapterId: RC8_COMPATIBILITY.id, protocolGeneration: RC8_COMPATIBILITY.protocolGeneration, supportedRange: RC8_COMPATIBILITY.dshRange, compatibility: RC8_COMPATIBILITY, diagnostics: [] }
}

describe('runtime inspect normalization', () => {
  it('normalizes official slot and tool fields while preserving unknown metadata', () => {
    expect(normalizeSlots([{ name: 'sidebar.footer', provider: 'sidebar', kind: 'action', scope: 'global', order: 10 }])).toEqual([
      { name: 'sidebar.footer', provider: 'sidebar', kind: 'action', scope: 'global', metadata: { order: 10 } },
    ])
    expect(normalizeTools([{ name: 'status', provider: 'phase-a', description: 'Show status', input: { type: 'object' } }])).toEqual([
      { name: 'status', provider: 'phase-a', description: 'Show status', metadata: { input: { type: 'object' } } },
    ])
  })

  it('rejects malformed provider DTOs', () => {
    expect(() => normalizeSlots([{ name: '' }])).toThrow('non-empty string name')
    expect(() => normalizeSlots([{ name: 'slot', scope: 42 }])).toThrow('must be a string')
    expect(() => normalizeTools('not-an-array')).toThrow('must be an array')
  })
})

describe('inspectProjectComposition', () => {
  it('queries an injected provider without profile mutation', async () => {
    const value = project()
    const provider = { listSlots: vi.fn(async () => [{ name: 'sidebar.footer' }]), listTools: vi.fn(async () => []) }
    const inspectProfile = vi.fn(async () => ({ state: 'linked' as const, profile: 'web', packageId: value.packageId, root: value.root }))
    const result = await inspectProjectComposition(value, 'slots', {
      provider,
      resolveDsh: async () => installation(),
      inspectProfile,
    })
    expect(result.items).toEqual([{ name: 'sidebar.footer' }])
    expect(result.diagnostics).toEqual([])
    expect(inspectProfile).toHaveBeenCalledOnce()
  })

  it('reports absent links before attempting to query a provider', async () => {
    const value = project()
    const listSlots = vi.fn(async () => [{ name: 'should-not-run' }])
    const result = await inspectProjectComposition(value, 'slots', {
      provider: { listSlots, listTools: async () => [] },
      resolveDsh: async () => installation(),
      inspectProfile: async () => ({ state: 'absent', profile: 'web', packageId: value.packageId, root: value.root }),
    })
    expect(result.diagnostics[0]?.code).toBe('DSHX3205')
    expect(listSlots).not.toHaveBeenCalled()
  })

  it('returns DSHX3201 when no provider is injected', async () => {
    const value = project()
    const result = await inspectProjectComposition(value, 'tools', {
      resolveDsh: async () => installation(),
      inspectProfile: async () => ({ state: 'linked', profile: 'web', packageId: value.packageId, root: value.root }),
    })
    expect(result.diagnostics[0]?.code).toBe('DSHX3201')
  })

  it('maps provider failures to DSHX3202 and keeps the cause for verbose output', async () => {
    const value = project()
    const failure = new Error('connection refused')
    const result = await inspectProjectComposition(value, 'tools', {
      provider: { listSlots: async () => [], listTools: async () => { throw failure } },
      resolveDsh: async () => installation(),
      inspectProfile: async () => ({ state: 'linked', profile: 'web', packageId: value.packageId, root: value.root }),
    })
    expect(result.diagnostics[0]?.code).toBe('DSHX3202')
    expect(result.cause).toBe(failure)
  })

  it('maps malformed provider DTOs to DSHX3203', async () => {
    const value = project()
    const result = await inspectProjectComposition(value, 'slots', {
      provider: { listSlots: async () => [{ name: 'slot', kind: 1 } as never], listTools: async () => [] },
      resolveDsh: async () => installation(),
      inspectProfile: async () => ({ state: 'linked', profile: 'web', packageId: value.packageId, root: value.root }),
    })
    expect(result.diagnostics[0]?.code).toBe('DSHX3203')
  })
})
