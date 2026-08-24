import { describe, expect, it } from 'vitest'
import { inspectRuntimePlugins } from '../src/runtime-status.js'
import type { ResolvedDshxConfig } from '../src/config/index.js'
import type { DshCompatibility } from '../src/compat/index.js'

const project: ResolvedDshxConfig = {
  root: process.cwd(), packageFile: `${process.cwd()}/package.json`, configDependencies: [], packageId: 'runtime-status-test', name: 'runtime-status-test', outDir: `${process.cwd()}/dist`, profile: 'web', dev: { hostRestart: 'manual' }, build: { sourcemap: true }, compatibility: { allowUnsupported: false }, manifest: { name: 'runtime-status-test' },
}

const compatibility: DshCompatibility = {
  id: 'test', protocolGeneration: 'test', lifecycle: 'active', version: '0.0.0', dshRange: '*', verified: { minimum: '0.0.0', latest: '0.0.0' }, verifiedVersions: [], nodeRange: '*',
  profile: { listCommand: 'plugin-list-json', addCommand: 'plugin-add' },
  runtimePlugins: [{ id: 'missing', packageName: 'not-installed-runtime-plugin', load: 'module', provides: ['Inspect'], optional: true }],
  client: { platformModules: [], preloadedExternals: [], manifest: { platform: 'web', moduleRequestsField: 'external', packageEdgesField: 'inject' } },
}

describe('runtime plugin status', () => {
  it('reports adapter-approved packages that are missing without starting DSH', () => {
    const result = inspectRuntimePlugins(project, compatibility)
    expect(result.plugins).toEqual([expect.objectContaining({ id: 'missing', packageName: 'not-installed-runtime-plugin', status: 'missing' })])
    expect(result.diagnostics).toEqual([expect.objectContaining({ code: 'DSHX5102', severity: 'warning' })])
  })

  it('reports no runtime plugins for adapters without a child plugin allowlist', () => {
    const { runtimePlugins: _runtimePlugins, ...withoutPlugins } = compatibility
    const result = inspectRuntimePlugins(project, withoutPlugins)
    expect(result).toEqual({ plugins: [], diagnostics: [] })
  })
})
