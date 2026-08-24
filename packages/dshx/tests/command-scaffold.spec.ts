import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createCommandScaffold } from '../src/scaffold/command.js'
import type { ResolvedDshxConfig } from '../src/config/types.js'

function project(root: string, hostEntry?: string, configFile?: string): ResolvedDshxConfig {
  return {
    root, packageFile: resolve(root, 'package.json'), ...(configFile === undefined ? {} : { configFile }), configDependencies: [], packageId: '@demo/plugin', name: '@demo/plugin',
    ...(hostEntry === undefined ? {} : { hostEntry }), outDir: resolve(root, 'dist'), profile: 'web', dev: { hostRestart: 'manual' }, build: { sourcemap: true }, compatibility: { allowUnsupported: false },
    manifest: { name: '@demo/plugin', type: 'module', exports: { '.': './dist/index.js' }, dsh: { bundle: { patch: './cordis.patch.yml' } } },
  }
}

async function setup(host: 'define' | 'native' | 'missing' | 'disabled'): Promise<{ root: string; project: ResolvedDshxConfig; cleanup: () => Promise<void> }> {
  const root = await mkdtemp(join(tmpdir(), 'dshx-add-command-'))
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
  return { root, project: project(root, host === 'missing' || host === 'disabled' ? undefined : resolve(root, 'src/host.ts'), configFile), cleanup: () => rm(root, { recursive: true, force: true }) }
}

describe('add command scaffold', () => {
  it('generates the smallest official Command and appends it to defineHost', async () => {
    const value = await setup('define')
    try {
      const result = await createCommandScaffold({ project: value.project, name: 'status', description: 'Status command' }, { checkManifest: async () => [] })
      expect(result.diagnostics).toEqual([])
      const command = await readFile(resolve(value.root, 'src/commands/status.ts'), 'utf8')
      expect(command).toContain("import { defineCommand } from '@becomeopc/dshx/host'")
      expect(command).toContain("kind: 'success'")
      const host = await readFile(resolve(value.root, 'src/host.ts'), 'utf8')
      expect(host).toContain('from "./commands/status"')
      expect(host).toContain('commands: [statusCommand]')
    } finally { await value.cleanup() }
  })

  it('supports dry-run, creates a missing Host, and is idempotent', async () => {
    const value = await setup('missing')
    try {
      const dry = await createCommandScaffold({ project: value.project, name: 'status', dryRun: true }, { checkManifest: async () => [] })
      expect(dry.diff).toContain('src/commands/status.ts')
      await expect(readFile(resolve(value.root, 'src/host.ts'), 'utf8')).rejects.toThrow()
      await createCommandScaffold({ project: value.project, name: 'status' }, { checkManifest: async () => [] })
      const repeatedProject = { ...value.project, hostEntry: resolve(value.root, 'src/host.ts') }
      const repeated = await createCommandScaffold({ project: repeatedProject, name: 'status' }, { checkManifest: async () => [] })
      expect(repeated.diagnostics[0]?.code).toBe('DSHX6506')
    } finally { await value.cleanup() }
  })

  it('rejects invalid names, native Hosts, disabled Hosts, and rolls back checker failures', async () => {
    const value = await setup('define')
    try {
      expect((await createCommandScaffold({ project: value.project, name: 'Bad.Name' })).diagnostics[0]?.code).toBe('DSHX6501')
      const failed = await createCommandScaffold({ project: value.project, name: 'status' }, { checkManifest: async () => [{ code: 'DSHX4210', severity: 'error', message: 'bad', file: value.project.packageFile, hint: 'fix' }] })
      expect(failed.diagnostics[0]?.code).toBe('DSHX6508')
      await expect(readFile(resolve(value.root, 'src/commands/status.ts'), 'utf8')).rejects.toThrow()
    } finally { await value.cleanup() }
    const native = await setup('native')
    try { expect((await createCommandScaffold({ project: native.project, name: 'status' })).diagnostics[0]?.code).toBe('DSHX6504') } finally { await native.cleanup() }
    const disabled = await setup('disabled')
    try { expect((await createCommandScaffold({ project: disabled.project, name: 'status' })).diagnostics[0]?.code).toBe('DSHX6503') } finally { await disabled.cleanup() }
  })
})
