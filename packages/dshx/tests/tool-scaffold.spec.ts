import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createToolScaffold } from '../src/scaffold/tool.js'
import type { ResolvedDshxConfig } from '../src/config/types.js'

function project(root: string, hostEntry?: string, configFile?: string): ResolvedDshxConfig {
  return {
    root, packageFile: resolve(root, 'package.json'), ...(configFile === undefined ? {} : { configFile }), configDependencies: [], packageId: '@demo/plugin', name: '@demo/plugin',
    ...(hostEntry === undefined ? {} : { hostEntry }), outDir: resolve(root, 'dist'), profile: 'web', dev: { hostRestart: 'manual' }, build: { sourcemap: true }, compatibility: { allowUnsupported: false },
    manifest: { name: '@demo/plugin', type: 'module', exports: { '.': './dist/index.js' }, dsh: { bundle: { patch: './cordis.patch.yml' } } },
  }
}

async function setup(host: 'define' | 'native' | 'missing' | 'disabled'): Promise<{ root: string; project: ResolvedDshxConfig; cleanup: () => Promise<void> }> {
  const root = await mkdtemp(join(tmpdir(), 'dshx-add-tool-'))
  await mkdir(resolve(root, 'src'), { recursive: true })
  await writeFile(resolve(root, 'package.json'), JSON.stringify({ name: '@demo/plugin', type: 'module', exports: { '.': './dist/index.js' }, dsh: { bundle: { patch: './cordis.patch.yml' } } }))
  await writeFile(resolve(root, 'cordis.patch.yml'), '- insert:\n    - id: demo\n')
  let configFile: string | undefined
  if (host === 'define') await writeFile(resolve(root, 'src/host.ts'), "import { defineHost } from '@becomeopc/dshx/host'\n\nexport default defineHost({ setup() {} })\n")
  if (host === 'native') await writeFile(resolve(root, 'src/host.ts'), 'export const name = "demo"\nexport function apply() {}\n')
  if (host === 'disabled') {
    configFile = resolve(root, 'dshx.config.ts')
    await writeFile(configFile, "export default { host: false, client: 'src/client.tsx' }\n")
    await writeFile(resolve(root, 'src/client.tsx'), 'export default {}\n')
  }
  const manifest = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8')) as Record<string, unknown>
  return { root, project: project(root, host === 'missing' || host === 'disabled' ? undefined : resolve(root, 'src/host.ts'), configFile), cleanup: () => rm(root, { recursive: true, force: true }) }
}

describe('add tool scaffold', () => {
  it('generates the official no-argument string Tool and appends it to defineHost', async () => {
    const value = await setup('define')
    try {
      const result = await createToolScaffold({ project: value.project, name: 'status', description: 'Status tool' }, { checkManifest: async () => [] })
      expect(result.diagnostics).toEqual([])
      const tool = await readFile(resolve(value.root, 'src/tools/status.ts'), 'utf8')
      expect(tool).toContain("import { defineTool } from '@becomeopc/dshx/host'")
      expect(tool).toContain('parameters: {}')
      expect(tool).toContain("schema: { type: 'string' }")
      const host = await readFile(resolve(value.root, 'src/host.ts'), 'utf8')
      expect(host).toContain('from "./tools/status"')
      expect(host).toContain('tools: [statusTool]')
    } finally { await value.cleanup() }
  })

  it('creates a missing conventional Host and supports dry-run', async () => {
    const value = await setup('missing')
    try {
      const dry = await createToolScaffold({ project: value.project, name: 'status', dryRun: true }, { checkManifest: async () => [] })
      expect(dry.dryRun).toBe(true)
      expect(dry.diff).toContain('src/tools/status.ts')
      await expect(readFile(resolve(value.root, 'src/host.ts'), 'utf8')).rejects.toThrow()
      const result = await createToolScaffold({ project: value.project, name: 'status' }, { checkManifest: async () => [] })
      expect(result.diagnostics).toEqual([])
      expect(await readFile(resolve(value.root, 'src/host.ts'), 'utf8')).toContain('defineHost')
    } finally { await value.cleanup() }
  })

  it('is idempotent and rejects unsafe Host shapes without changing files', async () => {
    const value = await setup('define')
    try {
      await createToolScaffold({ project: value.project, name: 'status' }, { checkManifest: async () => [] })
      const repeated = await createToolScaffold({ project: value.project, name: 'status' }, { checkManifest: async () => [] })
      expect(repeated.diagnostics[0]?.code).toBe('DSHX6206')
      const native = await setup('native')
      try {
        const result = await createToolScaffold({ project: native.project, name: 'status' }, { checkManifest: async () => [] })
        expect(result.diagnostics[0]?.code).toBe('DSHX6204')
      } finally { await native.cleanup() }
    } finally { await value.cleanup() }
  })

  it('rejects an explicitly disabled Host and rolls back checker failures', async () => {
    const disabled = await setup('disabled')
    try {
      const result = await createToolScaffold({ project: disabled.project, name: 'status' }, { checkManifest: async () => [] })
      expect(result.diagnostics[0]?.code).toBe('DSHX6203')
    } finally { await disabled.cleanup() }
    const value = await setup('define')
    try {
      const result = await createToolScaffold({ project: value.project, name: 'status' }, { checkManifest: async () => [{ code: 'DSHX4210', severity: 'error', message: 'bad', file: value.project.packageFile, hint: 'fix' }] })
      expect(result.diagnostics[0]?.code).toBe('DSHX6208')
      await expect(readFile(resolve(value.root, 'src/tools/status.ts'), 'utf8')).rejects.toThrow()
    } finally { await value.cleanup() }
  })
})
