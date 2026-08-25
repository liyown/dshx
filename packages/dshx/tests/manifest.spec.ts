import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { resolveDshxConfig } from '../src/config/index.js'
import { checkProjectManifest } from '../src/project/index.js'

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
    expect(new Set(diagnostics.map(item => item.code))).toEqual(new Set([
      'DSHX4101', 'DSHX4102', 'DSHX4110', 'DSHX4120', 'DSHX4121', 'DSHX4122', 'DSHX4123',
      'DSHX4190', 'DSHX4191', 'DSHX4210', 'DSHX4211',
    ]))
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
      external: [
        '@test/plugin/internal',
        'react',
        '@deepseek-ai/dsh-client-runtime/client',
        '@example/extra',
        '@example/extra',
      ],
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
    await writeFile(resolve(root, 'src/settings-view.tsx'), [
      "import { useSettings as useRuntimeSettings } from '@becomeopc/dshx/client'",
      'export function SettingsView(contract: unknown) { return useRuntimeSettings(contract) }',
      '',
    ].join('\n'))
    await writeFile(resolve(root, 'src/client.tsx'), "import { SettingsView } from './settings-view.js'\nexport const apply = SettingsView\n")
    const missing = await checkProjectManifest(await resolveDshxConfig({ cwd: root }))
    expect(missing).toContainEqual(expect.objectContaining({ code: 'DSHX4216', severity: 'error' }))

    const manifest = fullManifest()
    ;(manifest.dsh as { client: { inject: string[] } }).client.inject.push('@deepseek-ai/dsh-client-ui-settings')
    await writeManifest(root, manifest)
    const complete = await checkProjectManifest(await resolveDshxConfig({ cwd: root }))
    expect(complete).not.toContainEqual(expect.objectContaining({ code: 'DSHX4216' }))
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
