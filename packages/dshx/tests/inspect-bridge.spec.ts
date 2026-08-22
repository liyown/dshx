import { describe, expect, it } from 'vitest'
import { DshInspectBridgeProvider } from '../src/inspect/bridge.js'
import { RC8_COMPATIBILITY } from '../src/compat/index.js'
import type { ResolvedDshxConfig } from '../src/config/index.js'

const project: ResolvedDshxConfig = {
  root: '/project', packageFile: '/project/package.json', configDependencies: [], packageId: 'demo', name: 'demo', outDir: '/project/dist', profile: 'web', dev: { hostRestart: 'manual' }, build: { sourcemap: true }, compatibility: { allowUnsupported: false }, manifest: { name: 'demo' },
}
const dsh = { version: '0.1.0-rc.8', executable: 'local' as const, support: 'verified' as const, adapterId: RC8_COMPATIBILITY.id, protocolGeneration: RC8_COMPATIBILITY.protocolGeneration, supportedRange: RC8_COMPATIBILITY.dshRange, compatibility: RC8_COMPATIBILITY, diagnostics: [] }

describe('DshInspectBridgeProvider', () => {
  it('calls the selected DSH executable and validates bridge DTOs', async () => {
    const calls: string[][] = []
    const provider = new DshInspectBridgeProvider(project, dsh, {
      runner: async (args) => {
        calls.push([...args])
        return { exitCode: 0, stdout: JSON.stringify({ version: 1, ok: true, target: 'services', items: [{ name: 'logger', provider: 'Service', scope: 'composition' }] }), stderr: '' }
      },
    })
    await expect(provider.listServices()).resolves.toEqual([{ name: 'logger', provider: 'Service', scope: 'composition' }])
    expect(calls[0]).toEqual(['inspect', '--profile', 'web', '--target', 'services', '--json'])
  })

  it('maps missing bridges and malformed responses to stable diagnostics', async () => {
    const missing = new DshInspectBridgeProvider(project, dsh, { runner: async () => ({ exitCode: 1, stdout: '', stderr: 'No Inspect bridge is available.' }) })
    await expect(missing.listEvents()).rejects.toMatchObject({ code: 'DSHX3201' })
    const malformed = new DshInspectBridgeProvider(project, dsh, { runner: async () => ({ exitCode: 0, stdout: '{bad', stderr: '' }) })
    await expect(malformed.listEvents()).rejects.toMatchObject({ code: 'DSHX3203' })
  })
})
