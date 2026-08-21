import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { DshxError } from '../src/diagnostics.js'
import { defineConfig, resolveDshxConfig } from '../src/config/index.js'

const temporaryDirectories: string[] = []

async function temporaryProject(
  manifest: unknown = { name: '@test/plugin', type: 'module' },
): Promise<{ base: string; root: string }> {
  const base = await realpath(await mkdtemp(resolve(tmpdir(), 'dshx-config-')))
  temporaryDirectories.push(base)
  const root = resolve(base, 'project')
  await mkdir(root, { recursive: true })
  await writeFile(resolve(root, 'package.json'), JSON.stringify(manifest, null, 2))
  return { base, root }
}

async function source(root: string, path: string): Promise<string> {
  const file = resolve(root, path)
  await mkdir(resolve(file, '..'), { recursive: true })
  await writeFile(file, 'export function apply() {}\n')
  return file
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map(directory => rm(directory, { recursive: true, force: true })))
})

describe('defineConfig', () => {
  it('returns the exact config object', () => {
    const config = { profile: 'web', build: { sourcemap: false } } as const
    expect(defineConfig(config)).toBe(config)
  })
})

describe('resolveDshxConfig', () => {
  it('finds the nearest package root and applies all defaults', async () => {
    const { root } = await temporaryProject({ name: '@test/outer', type: 'module' })
    await source(root, 'src/host.ts')
    const nestedRoot = resolve(root, 'packages/inner')
    await mkdir(resolve(nestedRoot, 'work/deep'), { recursive: true })
    await writeFile(resolve(nestedRoot, 'package.json'), JSON.stringify({ name: '@test/inner', type: 'module' }))
    const hostEntry = await source(nestedRoot, 'src/host.ts')

    const resolved = await resolveDshxConfig({ cwd: resolve(nestedRoot, 'work/deep') })

    expect(resolved).toMatchObject({
      root: nestedRoot,
      packageId: '@test/inner',
      name: '@test/inner',
      hostEntry,
      outDir: resolve(nestedRoot, 'dist'),
      profile: 'web',
      dev: { hostRestart: 'manual' },
      build: { sourcemap: true },
      compatibility: { allowUnsupported: false },
    })
    expect(resolved.clientEntry).toBeUndefined()
    expect(resolved.configFile).toBeUndefined()
    expect(resolved.configDependencies).toEqual([])
  })

  it('loads only the root TypeScript config and gives explicit fields precedence', async () => {
    const { root } = await temporaryProject()
    await source(root, 'src/host.ts')
    const hostEntry = await source(root, 'custom/entry.ts')
    await writeFile(resolve(root, 'config-values.ts'), "export const selectedProfile: string = 'desktop'\n")
    await writeFile(resolve(root, 'dshx.config.ts'), [
      "import { selectedProfile } from './config-values.ts'",
      'export default {',
      "  name: 'Logical Plugin',",
      "  host: 'custom/entry.ts',",
      '  client: false,',
      '  profile: selectedProfile,',
      "  dev: { hostRestart: 'auto' },",
      '  build: { sourcemap: false },',
      '  compatibility: { allowUnsupported: true },',
      '}',
      '',
    ].join('\n'))
    await mkdir(resolve(root, 'nested'), { recursive: true })
    await writeFile(resolve(root, 'nested/dshx.config.ts'), "throw new Error('must not load nested config')\n")

    const resolved = await resolveDshxConfig({ cwd: resolve(root, 'nested') })

    expect(resolved).toMatchObject({
      packageId: '@test/plugin',
      name: 'Logical Plugin',
      hostEntry,
      profile: 'desktop',
      dev: { hostRestart: 'auto' },
      build: { sourcemap: false },
      compatibility: { allowUnsupported: true },
    })
    expect(resolved.clientEntry).toBeUndefined()
    expect(resolved.configFile).toBe(resolve(root, 'dshx.config.ts'))
    expect(resolved.configDependencies).toContain(resolve(root, 'config-values.ts'))
  })

  it('supports Host-only and Client-only projects', async () => {
    const hostProject = await temporaryProject({ name: '@test/host', type: 'module' })
    const hostEntry = await source(hostProject.root, 'src/host.ts')
    const clientProject = await temporaryProject({ name: '@test/client', type: 'module' })
    const clientEntry = await source(clientProject.root, 'src/client.tsx')

    await expect(resolveDshxConfig({ cwd: hostProject.root })).resolves.toMatchObject({ hostEntry })
    const client = await resolveDshxConfig({ cwd: clientProject.root })
    expect(client.hostEntry).toBeUndefined()
    expect(client.clientEntry).toBe(clientEntry)
  })

  it('lets false explicitly disable a conventional entry', async () => {
    const { root } = await temporaryProject()
    await source(root, 'src/host.ts')
    const clientEntry = await source(root, 'src/client.tsx')
    await writeFile(resolve(root, 'dshx.config.ts'), 'export default { host: false }\n')

    const resolved = await resolveDshxConfig({ cwd: root })
    expect(resolved.hostEntry).toBeUndefined()
    expect(resolved.clientEntry).toBe(clientEntry)
  })

  it('rejects projects with no enabled or discovered entry', async () => {
    const { root } = await temporaryProject()
    await expect(resolveDshxConfig({ cwd: root })).rejects.toMatchObject({ code: 'DSHX4006' })
  })

  it('rejects explicitly disabling both conventional entries', async () => {
    const { root } = await temporaryProject()
    await source(root, 'src/host.ts')
    await source(root, 'src/client.tsx')
    await writeFile(resolve(root, 'dshx.config.ts'), 'export default { host: false, client: false }\n')
    await expect(resolveDshxConfig({ cwd: root })).rejects.toMatchObject({ code: 'DSHX4006' })
  })

  it.each([
    ["export default { typo: true }\n", 'unknown field'],
    ["export default { build: { sourcemap: 'yes' } }\n", 'sourcemap'],
    ["export default { dev: { hostRestart: 'sometimes' } }\n", 'hostRestart'],
    ["export default { dev: { typo: true } }\n", 'unknown field'],
    ["export default []\n", 'default-export'],
  ])('rejects invalid config: %s', async (config, message) => {
    const { root } = await temporaryProject()
    await source(root, 'src/host.ts')
    await writeFile(resolve(root, 'dshx.config.ts'), config)
    await expect(resolveDshxConfig({ cwd: root })).rejects.toMatchObject({
      code: expect.stringMatching(/^DSHX400[34]$/),
      message: expect.stringContaining(message),
      file: resolve(root, 'dshx.config.ts'),
      hint: expect.any(String),
    })
  })

  it('rejects a missing explicit entry with an actionable file and hint', async () => {
    const { root } = await temporaryProject()
    await writeFile(resolve(root, 'dshx.config.ts'), "export default { host: 'src/missing.ts' }\n")
    const failure = await resolveDshxConfig({ cwd: root }).catch((error: unknown) => error)
    expect(failure).toBeInstanceOf(DshxError)
    expect(failure).toMatchObject({
      code: 'DSHX4005',
      file: resolve(root, 'dshx.config.ts'),
      hint: expect.stringContaining('Create the file'),
    })
  })

  it('rejects an explicit entry outside the project root', async () => {
    const { base, root } = await temporaryProject()
    await writeFile(resolve(base, 'outside.ts'), 'export function apply() {}\n')
    await writeFile(resolve(root, 'dshx.config.ts'), "export default { host: '../outside.ts' }\n")
    await expect(resolveDshxConfig({ cwd: root })).rejects.toMatchObject({
      code: 'DSHX4005',
      message: expect.stringContaining('inside the project root'),
      file: resolve(root, 'dshx.config.ts'),
      hint: expect.any(String),
    })
  })

  it.each([
    ['not-json', 'not valid JSON'],
    ['[]', 'JSON object'],
    [JSON.stringify({ type: 'module' }), 'non-empty string name'],
  ])('rejects an invalid project manifest: %s', async (manifest, message) => {
    const { root } = await temporaryProject()
    await writeFile(resolve(root, 'package.json'), manifest)
    await expect(resolveDshxConfig({ cwd: root })).rejects.toMatchObject({
      code: 'DSHX4002',
      message: expect.stringContaining(message),
      file: resolve(root, 'package.json'),
    })
  })
})
