import type { Context } from '@deepseek-ai/cordis'
import { describe, expect, it, vi } from 'vitest'
import { loadRuntimePlugins } from '../src/host/runtime-plugins.js'
import type { DshCompatibility } from '../src/compat/index.js'

const baseCompatibility: DshCompatibility = {
  id: 'test', protocolGeneration: 'test', version: '0.0.0', dshRange: '*', verified: { minimum: '0.0.0', latest: '0.0.0' }, verifiedVersions: [], nodeRange: '*',
  profile: { listCommand: 'plugin-list-json', addCommand: 'plugin-add' },
  client: { platformModules: [], preloadedExternals: [], manifest: { platform: 'web', moduleRequestsField: 'external', packageEdgesField: 'inject' } },
}

describe('Host runtime child plugin loader', () => {
  it('skips an adapter plugin when all of its capabilities already exist', async () => {
    const plugin = vi.fn()
    const ctx = {
      get(name: string) {
        if (name === 'Service' || name === 'Event') return undefined
        if (name === 'cordisInspect') return { list: () => [{ id: 'Service' }, { id: 'Event' }] }
        return undefined
      },
      plugin,
    } as unknown as Context
    const result = await loadRuntimePlugins(ctx, {
      ...baseCompatibility,
      runtimePlugins: [{ id: 'tool-cordis', packageName: '@deepseek-ai/dsh-tool-cordis', load: 'module', provides: ['Service', 'Event'], optional: true }],
    })
    expect(result.skipped).toEqual(['tool-cordis'])
    expect(result.plugins).toEqual([{ id: 'tool-cordis', packageName: '@deepseek-ai/dsh-tool-cordis', provides: ['Service', 'Event'], status: 'skipped' }])
    expect(plugin).not.toHaveBeenCalled()
  })

  it('never imports an adapter package that is not explicitly supported', async () => {
    const plugin = vi.fn()
    const ctx = { get: () => undefined, plugin } as unknown as Context
    const result = await loadRuntimePlugins(ctx, {
      ...baseCompatibility,
      runtimePlugins: [{ id: 'untrusted', packageName: 'example-untrusted-plugin', load: 'module', provides: ['unknown'], optional: true }],
    })
    expect(result.loaded).toEqual([])
    expect(result.diagnostics[0]).toMatchObject({ pluginId: 'untrusted', packageName: 'example-untrusted-plugin' })
    expect(result.plugins[0]).toMatchObject({ id: 'untrusted', status: 'failed' })
    expect(plugin).not.toHaveBeenCalled()
  })
})
