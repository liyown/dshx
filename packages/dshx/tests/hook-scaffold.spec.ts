import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createHookScaffold } from '../src/scaffold/hook.js'
import type { ResolvedDshxConfig } from '../src/config/types.js'

function project(root: string, hostEntry?: string, configFile?: string): ResolvedDshxConfig {
  return {
    root, packageFile: resolve(root, 'package.json'), ...(configFile === undefined ? {} : { configFile }), configDependencies: [], packageId: 'demo-plugin', name: 'demo-plugin',
    ...(hostEntry === undefined ? {} : { hostEntry }), outDir: resolve(root, 'dist'), profile: 'web', dev: { hostRestart: 'manual' }, build: { sourcemap: true }, compatibility: { allowUnsupported: false },
    manifest: { name: 'demo-plugin', type: 'module', exports: { '.': './dist/index.js' }, dsh: { bundle: { patch: './cordis.patch.yml' } } },
  }
}

async function setup(host: 'define' | 'missing' | 'native'): Promise<{ root: string; project: ResolvedDshxConfig; cleanup: () => Promise<void> }> {
  const root = await mkdtemp(join(tmpdir(), 'dshx-add-hook-'))
  await mkdir(resolve(root, 'src'), { recursive: true })
  await writeFile(resolve(root, 'package.json'), JSON.stringify({ name: 'demo-plugin', type: 'module', exports: { '.': './dist/index.js' }, dsh: { bundle: { patch: './cordis.patch.yml' } } }))
  await writeFile(resolve(root, 'cordis.patch.yml'), '- insert:\n    - id: demo\n')
  if (host === 'define') await writeFile(resolve(root, 'src/host.ts'), "import { defineHost } from '@becomeopc/dshx/host'\n\nexport default defineHost({\n  name: 'demo',\n  setup() {},\n})\n")
  if (host === 'native') await writeFile(resolve(root, 'src/host.ts'), 'export const name = "demo"\nexport function apply() {}\n')
  return { root, project: project(root, host === 'missing' ? undefined : resolve(root, 'src/host.ts')), cleanup: () => rm(root, { recursive: true, force: true }) }
}

describe('add hook scaffold', () => {
  it('generates a Cordis hook and attaches it to defineHost setup', async () => {
    const value = await setup('define')
    try {
      const result = await createHookScaffold({ project: value.project, event: 'agent.before-request' }, { checkManifest: async () => [] })
      expect(result.diagnostics).toEqual([])
      expect(await readFile(resolve(value.root, 'src/hooks/agent.before-request.ts'), 'utf8')).toContain('ctx.on("agent.before-request"')
      const host = await readFile(resolve(value.root, 'src/host.ts'), 'utf8')
      expect(host).toContain('registerAgentBeforeRequestHook(ctx)')
      expect(host).toContain('setup(ctx)')
    } finally { await value.cleanup() }
  })

  it('creates a conventional Host when missing and is idempotent', async () => {
    const value = await setup('missing')
    try {
      const dry = await createHookScaffold({ project: value.project, event: 'agent.ready', dryRun: true }, { checkManifest: async () => [] })
      expect(dry.diff).toContain('src/hooks/agent.ready.ts')
      await expect(readFile(resolve(value.root, 'src/host.ts'), 'utf8')).rejects.toThrow()
      const result = await createHookScaffold({ project: value.project, event: 'agent.ready' }, { checkManifest: async () => [] })
      expect(result.diagnostics).toEqual([])
      const repeated = await createHookScaffold({ project: { ...value.project, hostEntry: resolve(value.root, 'src/host.ts') }, event: 'agent.ready' }, { checkManifest: async () => [] })
      expect(repeated.diagnostics[0]?.code).toBe('DSHX6306')
    } finally { await value.cleanup() }
  })

  it('uses an existing setup parameter name when attaching the listener', async () => {
    const value = await setup('define')
    try {
      await writeFile(resolve(value.root, 'src/host.ts'), "import { defineHost } from '@becomeopc/dshx/host'\n\nexport default defineHost({ setup(context) { context.services } })\n")
      const result = await createHookScaffold({ project: value.project, event: 'agent.ready' }, { checkManifest: async () => [] })
      expect(result.diagnostics).toEqual([])
      expect(await readFile(resolve(value.root, 'src/host.ts'), 'utf8')).toContain('registerAgentReadyHook(context)')
    } finally { await value.cleanup() }
  })

  it('rejects native Hosts, invalid names and rolls back checker failures', async () => {
    const native = await setup('native')
    try {
      const result = await createHookScaffold({ project: native.project, event: 'agent.ready' }, { checkManifest: async () => [] })
      expect(result.diagnostics[0]?.code).toBe('DSHX6304')
    } finally { await native.cleanup() }
    const value = await setup('define')
    try {
      expect((await createHookScaffold({ project: value.project, event: 'bad event' })).diagnostics[0]?.code).toBe('DSHX6301')
      const result = await createHookScaffold({ project: value.project, event: 'agent.ready' }, { checkManifest: async () => [{ code: 'DSHX4210', severity: 'error', message: 'bad', file: value.project.packageFile, hint: 'fix' }] })
      expect(result.diagnostics[0]?.code).toBe('DSHX6308')
      await expect(readFile(resolve(value.root, 'src/hooks/agent.ready.ts'), 'utf8')).rejects.toThrow()
    } finally { await value.cleanup() }
  })
})
