import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { resolveDshxConfig } from '../src/config/resolve.js'
import { checkPackageTargets, checkProjectManifest } from '../src/project/index.js'

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const fixtureRoot = resolve(packageRoot, '../../fixtures/phase-a')
const temporaryDirectories: string[] = []

function fullManifest(): Record<string, unknown> {
  return {
    name: '@test/plugin',
    type: 'module',
    main: './dist/index.js',
    exports: {
      '.': './dist/index.js',
      './client': './dist/client.js',
      './cordis.patch.yml': './cordis.patch.yml',
      './package.json': './package.json',
    },
    files: ['dist', 'cordis.patch.yml'],
    dsh: {
      bundle: { patch: './cordis.patch.yml' },
      client: { platform: 'web', inject: [], external: [], immediately: false },
    },
  }
}

async function temporaryProject(options: { host?: boolean; client?: boolean } = {}): Promise<string> {
  const root = await realpath(await mkdtemp(resolve(tmpdir(), 'dshx-manifest-')))
  temporaryDirectories.push(root)
  const host = options.host ?? true
  const client = options.client ?? true
  const manifest = fullManifest()
  if (!client) {
    delete (manifest.exports as Record<string, unknown>)['./client']
    delete (manifest.dsh as Record<string, unknown>).client
  }
  await writeFile(resolve(root, 'package.json'), JSON.stringify(manifest, null, 2))
  await writeFile(resolve(root, 'cordis.patch.yml'), '- insert: []\n')
  await mkdir(resolve(root, 'src'), { recursive: true })
  if (host) await writeFile(resolve(root, 'src/host.ts'), 'export function apply() {}\n')
  if (client) await writeFile(resolve(root, 'src/client.tsx'), 'export function apply() {}\n')
  return root
}

async function writeManifest(root: string, manifest: unknown): Promise<void> {
  await writeFile(resolve(root, 'package.json'), JSON.stringify(manifest, null, 2))
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map(directory => rm(directory, { recursive: true, force: true })))
})
describe('checkProjectManifest', () => {
  it('accepts valid full, Host-only, and Client-only projects', async () => {
    const full = await temporaryProject()
    const hostOnly = await temporaryProject({ client: false })
    const clientOnly = await temporaryProject({ host: false })

    await expect(checkProjectManifest(await resolveDshxConfig({ cwd: full }))).resolves.toEqual([])
    await expect(checkProjectManifest(await resolveDshxConfig({ cwd: hostOnly }))).resolves.toEqual([])
    await expect(checkProjectManifest(await resolveDshxConfig({ cwd: clientOnly }))).resolves.toEqual([])
  })

  it('accepts one-level conditional exports with string defaults', async () => {
    const root = await temporaryProject()
    const manifest = fullManifest()
    manifest.exports = {
      '.': { types: './dist/index.d.ts', default: './dist/index.js' },
      './client': { browser: './dist/client.js', default: './dist/client.js' },
      './cordis.patch.yml': { default: './cordis.patch.yml' },
      './package.json': { default: './package.json' },
    }
    await writeManifest(root, manifest)
    await expect(checkProjectManifest(await resolveDshxConfig({ cwd: root }))).resolves.toEqual([])
  })

  it('verifies every concrete export, types, main, and bin target after build', async () => {
    const root = await temporaryProject()
    const manifest = fullManifest()
    manifest.types = './dist/index.d.ts'
    manifest.bin = { demo: './dist/cli.js' }
    manifest.exports = {
      ...(manifest.exports as object),
      '.': { types: './dist/index.d.ts', default: './dist/index.js' },
      './client': { types: './dist/client.d.ts', default: './dist/client.js' },
    }
    await writeManifest(root, manifest)
    await mkdir(resolve(root, 'dist'), { recursive: true })
    for (const file of ['index.js', 'index.d.ts', 'client.js', 'client.d.ts', 'cli.js']) await writeFile(resolve(root, 'dist', file), '')
    const config = await resolveDshxConfig({ cwd: root })
    await expect(checkPackageTargets(config)).resolves.toEqual([])
    await rm(resolve(root, 'dist/client.d.ts'))
    await expect(checkPackageTargets(config)).resolves.toContainEqual(
      expect.objectContaining({ code: 'DSHX4192', message: expect.stringContaining('./dist/client.d.ts') }),
    )
  })

  it('accepts npm main, types, and bin paths without a dot-slash prefix', async () => {
    const root = await temporaryProject()
    const manifest = fullManifest()
    manifest.main = 'dist/index.js'
    manifest.types = 'dist/index.d.ts'
    manifest.bin = { demo: 'dist/cli.js' }
    await writeManifest(root, manifest)
    await mkdir(resolve(root, 'dist'), { recursive: true })
    for (const file of ['index.js', 'index.d.ts', 'client.js', 'cli.js']) await writeFile(resolve(root, 'dist', file), '')

    await expect(checkPackageTargets(await resolveDshxConfig({ cwd: root }))).resolves.toEqual([])
  })

  it('still requires package exports to use concrete dot-slash targets', async () => {
    const root = await temporaryProject()
    const manifest = fullManifest()
    manifest.exports = { '.': 'dist/index.js' }
    await writeManifest(root, manifest)
    await mkdir(resolve(root, 'dist'), { recursive: true })
    await writeFile(resolve(root, 'dist/index.js'), '')

    await expect(checkPackageTargets(await resolveDshxConfig({ cwd: root }))).resolves.toContainEqual(
      expect.objectContaining({ code: 'DSHX4192', message: expect.stringContaining('exports.') }),
    )
  })

  it('accepts the checked-in Phase A fixture', async () => {
    const resolved = await resolveDshxConfig({ cwd: fixtureRoot })
    await expect(checkProjectManifest(resolved)).resolves.toEqual([])
  })

  it('reports invalid JSON that appears after resolution', async () => {
    const root = await temporaryProject()
    const resolved = await resolveDshxConfig({ cwd: root })
    await writeFile(resolve(root, 'package.json'), '{')
    await expect(checkProjectManifest(resolved)).resolves.toEqual([
      expect.objectContaining({ code: 'DSHX4101', severity: 'error', file: resolve(root, 'package.json') }),
    ])
  })

  it('collects manifest, bundle, export, Client, and publishing problems in one pass', async () => {
    const root = await temporaryProject()
    const resolved = await resolveDshxConfig({ cwd: root })
    await writeManifest(root, {
      name: '',
      type: 'commonjs',
      exports: {},
      dsh: { client: { platform: 'desktop' } },
    })
    await rm(resolve(root, 'cordis.patch.yml'))

    const diagnostics = await checkProjectManifest(resolved)
    expect(new Set(diagnostics.map(item => item.code))).toEqual(
      new Set(['DSHX4101', 'DSHX4102', 'DSHX4110', 'DSHX4120', 'DSHX4121', 'DSHX4122', 'DSHX4123', 'DSHX4190', 'DSHX4191', 'DSHX4210', 'DSHX4211']),
    )
    expect(diagnostics.every(item => item.file.length > 0)).toBe(true)
    expect(diagnostics.every(item => item.hint.length > 0)).toBe(true)
    expect(diagnostics.filter(item => item.severity === 'error')).toHaveLength(9)
    expect(diagnostics.filter(item => item.severity === 'warning')).toHaveLength(2)
  })

  it('validates Client arrays, booleans, self requests, and the rc.8 baseline', async () => {
    const root = await temporaryProject()
    const manifest = fullManifest()
    ;(manifest.dsh as { client: Record<string, unknown> }).client = {
      platform: 'web',
      inject: ['ok', 'ok', '', 1],
      external: ['@test/plugin/internal', 'react', '@deepseek-ai/dsh-client-runtime/client', '@example/extra', '@example/extra'],
      immediately: 'false',
    }
    await writeManifest(root, manifest)

    const diagnostics = await checkProjectManifest(await resolveDshxConfig({ cwd: root }))
    expect(diagnostics.filter(item => item.code === 'DSHX4212')).toHaveLength(2)
    expect(diagnostics.filter(item => item.code === 'DSHX4213')).toHaveLength(1)
    expect(diagnostics.filter(item => item.code === 'DSHX4214')).toHaveLength(1)
    expect(diagnostics.filter(item => item.code === 'DSHX4215')).toHaveLength(3)
  })

  it('previews the hook-driven Settings provider edge through the local Client graph', async () => {
    const root = await temporaryProject()
    await writeFile(
      resolve(root, 'src/settings-view.tsx'),
      [
        "import { useSettings as useRuntimeSettings } from '@becomeopc/dshx/client'",
        'export function SettingsView(contract: unknown) { return useRuntimeSettings(contract) }',
        '',
      ].join('\n'),
    )
    await writeFile(resolve(root, 'src/client.tsx'), "import { SettingsView } from './settings-view.js'\nexport const apply = SettingsView\n")
    const missing = await checkProjectManifest(await resolveDshxConfig({ cwd: root }))
    expect(missing).toContainEqual(expect.objectContaining({ code: 'DSHX4216', severity: 'error' }))

    const manifest = fullManifest()
    ;(manifest.dsh as { client: { inject: string[] } }).client.inject.push('@deepseek-ai/dsh-client-ui-settings')
    await writeManifest(root, manifest)
    const complete = await checkProjectManifest(await resolveDshxConfig({ cwd: root }))
    expect(complete).not.toContainEqual(expect.objectContaining({ code: 'DSHX4216' }))
  })

  it('previews the hook-driven API provider edge through aliases and the local Client graph', async () => {
    const root = await temporaryProject()
    await writeFile(
      resolve(root, 'src/api-view.tsx'),
      [
        "import { useApiQuery as query } from '@becomeopc/dshx/client'",
        "export function ApiView(contract: unknown) { return query(contract, 'get') }",
        '',
      ].join('\n'),
    )
    await writeFile(resolve(root, 'src/client.tsx'), "import { ApiView } from './api-view.js'\nexport const apply = ApiView\n")
    const missing = await checkProjectManifest(await resolveDshxConfig({ cwd: root }))
    expect(missing).toContainEqual(
      expect.objectContaining({
        code: 'DSHX4218',
        severity: 'error',
        hint: expect.stringContaining('@deepseek-ai/dsh-client-connection'),
      }),
    )

    const manifest = fullManifest()
    ;(manifest.dsh as { client: { inject: string[] } }).client.inject.push('@deepseek-ai/dsh-client-connection')
    await writeManifest(root, manifest)
    const complete = await checkProjectManifest(await resolveDshxConfig({ cwd: root }))
    expect(complete).not.toContainEqual(expect.objectContaining({ code: 'DSHX4218' }))
  })

  it('does not infer an API provider from a bare or voided hook import', async () => {
    const root = await temporaryProject()
    await writeFile(
      resolve(root, 'src/client.tsx'),
      ["import { useApi } from '@becomeopc/dshx/client'", 'void useApi', 'export function apply() {}', ''].join('\n'),
    )
    const diagnostics = await checkProjectManifest(await resolveDshxConfig({ cwd: root }))
    expect(diagnostics).not.toContainEqual(expect.objectContaining({ code: 'DSHX4218' }))
  })

  it('previews Conversation component provider edges from defineClient()', async () => {
    const root = await temporaryProject()
    await writeFile(
      resolve(root, 'src/client.tsx'),
      [
        "import { defineClient as client } from '@becomeopc/dshx/client'",
        'const contribution = {}',
        'export default client({ conversations: [contribution] })',
        '',
      ].join('\n'),
    )
    const missing = await checkProjectManifest(await resolveDshxConfig({ cwd: root }))
    expect(missing).toContainEqual(
      expect.objectContaining({
        code: 'DSHX4217',
        severity: 'error',
        hint: expect.stringContaining('@deepseek-ai/dsh-client-runtime'),
      }),
    )

    const manifest = fullManifest()
    ;(manifest.dsh as { client: { inject: string[] } }).client.inject.push('@deepseek-ai/dsh-client-runtime', '@deepseek-ai/dsh-client-ui-conversation')
    await writeManifest(root, manifest)
    const complete = await checkProjectManifest(await resolveDshxConfig({ cwd: root }))
    expect(complete).not.toContainEqual(expect.objectContaining({ code: 'DSHX4217' }))
  })

  it('does not infer Conversation providers from an empty contribution list', async () => {
    const root = await temporaryProject()
    await writeFile(
      resolve(root, 'src/client.tsx'),
      ["import * as dshx from '@becomeopc/dshx/client'", 'export default dshx.defineClient({ conversations: [] })', ''].join('\n'),
    )
    const diagnostics = await checkProjectManifest(await resolveDshxConfig({ cwd: root }))
    expect(diagnostics).not.toContainEqual(expect.objectContaining({ code: 'DSHX4217' }))
  })

  it('follows a local default-export barrel without inventing Conversation providers', async () => {
    const root = await temporaryProject()
    await writeFile(
      resolve(root, 'src/definition.ts'),
      ["import { defineClient } from '@becomeopc/dshx/client'", "export default defineClient({ name: 'barrel-client', slots: [] })", ''].join('\n'),
    )
    await writeFile(resolve(root, 'src/client.tsx'), "export { default } from './definition.js'\n")
    const diagnostics = await checkProjectManifest(await resolveDshxConfig({ cwd: root }))
    expect(diagnostics).not.toContainEqual(expect.objectContaining({ code: 'DSHX4217' }))
  })

  it('rejects stale Client metadata in a Host-only project', async () => {
    const root = await temporaryProject({ client: false })
    const manifest = fullManifest()
    delete (manifest.exports as Record<string, unknown>)['./client']
    await writeManifest(root, manifest)
    const diagnostics = await checkProjectManifest(await resolveDshxConfig({ cwd: root }))
    expect(diagnostics).toContainEqual(expect.objectContaining({ code: 'DSHX4201', severity: 'error' }))
  })

  it('reports missing bundle and Client metadata', async () => {
    const root = await temporaryProject()
    const manifest = fullManifest()
    delete manifest.dsh
    await writeManifest(root, manifest)
    const diagnostics = await checkProjectManifest(await resolveDshxConfig({ cwd: root }))
    expect(diagnostics).toContainEqual(expect.objectContaining({ code: 'DSHX4120', severity: 'error' }))
    expect(diagnostics).toContainEqual(expect.objectContaining({ code: 'DSHX4211', severity: 'error' }))
  })

  it.each([
    ['invalid YAML', '[unterminated', 'DSHX4124'],
    ['non-array YAML', 'name: plugin\n', 'DSHX4124'],
  ])('rejects %s patch content', async (_label, patch, code) => {
    const root = await temporaryProject()
    await writeFile(resolve(root, 'cordis.patch.yml'), patch)
    const diagnostics = await checkProjectManifest(await resolveDshxConfig({ cwd: root }))
    expect(diagnostics).toContainEqual(expect.objectContaining({ code, severity: 'error' }))
  })

  it('does not modify package.json or the patch file', async () => {
    const root = await temporaryProject()
    const packageFile = resolve(root, 'package.json')
    const patchFile = resolve(root, 'cordis.patch.yml')
    const before = await Promise.all([readFile(packageFile), readFile(patchFile)])

    await checkProjectManifest(await resolveDshxConfig({ cwd: root }))

    const after = await Promise.all([readFile(packageFile), readFile(patchFile)])
    expect(after).toEqual(before)
  })
})
