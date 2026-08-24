import { chmod, mkdir, mkdtemp, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { ResolvedDshxConfig } from '../src/config/index.js'
import {
  ensureProjectProfile,
  inspectProjectProfile,
  resolveDshInstallation,
} from '../src/profile/index.js'
import type {
  DshCommandResult,
  DshCommandRunner,
  DshCommandRunOptions,
} from '../src/profile/index.js'

const temporaryDirectories: string[] = []

interface RecordedCommand {
  args: readonly string[]
  options: DshCommandRunOptions
}

async function temporaryProject(overrides: {
  allowUnsupported?: boolean
  packageId?: string
  profile?: string
} = {}): Promise<ResolvedDshxConfig> {
  const root = await realpath(await mkdtemp(resolve(tmpdir(), 'dshx-profile-')))
  temporaryDirectories.push(root)
  const packageId = overrides.packageId ?? '@test/plugin'
  const manifest = { name: packageId, type: 'module' }
  const packageFile = resolve(root, 'package.json')
  const hostEntry = resolve(root, 'src/host.ts')
  await mkdir(resolve(root, 'src'), { recursive: true })
  await writeFile(packageFile, JSON.stringify(manifest, null, 2))
  await writeFile(hostEntry, 'export function apply() {}\n')
  return {
    root,
    packageFile,
    configDependencies: [],
    packageId,
    name: packageId,
    hostEntry,
    outDir: resolve(root, 'dist'),
    profile: overrides.profile ?? 'web',
    dev: { hostRestart: 'manual' },
    build: { sourcemap: true },
    compatibility: { allowUnsupported: overrides.allowUnsupported ?? false },
    manifest,
  }
}

function success(stdout = ''): DshCommandResult {
  return { exitCode: 0, stdout, stderr: '' }
}

function list(dependencies: Record<string, { path?: string; version?: string }> = {}): DshCommandResult {
  return success(JSON.stringify([{ name: 'dsh-profile-web', private: true, dependencies }]))
}

function queuedRunner(
  results: readonly DshCommandResult[],
  calls: RecordedCommand[] = [],
): DshCommandRunner {
  let index = 0
  return async (args, options) => {
    calls.push({ args: [...args], options })
    const result = results[index]
    index += 1
    if (result === undefined) throw new Error(`unexpected DSH command: ${args.join(' ')}`)
    return result
  }
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map(directory => rm(directory, { recursive: true, force: true })))
})
describe('DSH installation resolution', () => {
  it('recognizes the verified rc.8 CLI and forwards cwd and environment', async () => {
    const project = await temporaryProject()
    const calls: RecordedCommand[] = []
    const installation = await resolveDshInstallation(project, {
      env: { DSH_HOME: '/isolated/dsh-home' },
      runner: queuedRunner([success('0.1.0-rc.8\n')], calls),
    })

    expect(installation).toMatchObject({
      version: '0.1.0-rc.8',
      support: 'verified',
      diagnostics: [],
    })
    expect(installation.compatibility.version).toBe('0.1.0-rc.8')
    expect(calls).toHaveLength(1)
    expect(calls[0]?.args).toEqual(['--version'])
    expect(calls[0]?.options.cwd).toBe(project.root)
    expect(calls[0]?.options.env.DSH_HOME).toBe('/isolated/dsh-home')
    expect(calls[0]?.options.timeoutMs).toBeGreaterThan(0)
  })

  it('reports a missing DSH CLI when neither local nor PATH resolution works', async () => {
    const project = await temporaryProject()
    const runner = queuedRunner([{
      exitCode: 254,
      stdout: '',
      stderr: 'Command "dsh" not found',
    }])
    await expect(resolveDshInstallation(project, { runner })).rejects.toMatchObject({
      code: 'DSHX5001',
      file: project.packageFile,
      hint: expect.stringContaining('@deepseek-ai/dsh'),
    })
  })

  it.each([
    [{ exitCode: 1, stdout: '', stderr: 'startup failed' }, 'Failed to read'],
    [success('development-build'), 'invalid version string'],
  ] as const)('rejects failed or malformed version output', async (result, message) => {
    const project = await temporaryProject()
    await expect(resolveDshInstallation(project, { runner: queuedRunner([result]) })).rejects.toMatchObject({
      code: 'DSHX5002',
      message: expect.stringContaining(message),
      file: project.packageFile,
    })
  })

  it('continues experimentally for an unverified prerelease inside the supported generation', async () => {
    const project = await temporaryProject()
    const installation = await resolveDshInstallation(project, { runner: queuedRunner([success('0.1.0-rc.9')]) })
    expect(installation).toMatchObject({ support: 'experimental', adapterId: 'protocol-1', protocolGeneration: 'protocol-1', supportedRange: '>=0.1.0-rc.8 <0.2.0-0' })
    expect(installation.diagnostics).toEqual([expect.objectContaining({ code: 'DSHX5101', severity: 'warning', file: project.packageFile })])
  })

  it('continues compatibly for an unverified stable version inside the supported generation', async () => {
    const project = await temporaryProject()
    const installation = await resolveDshInstallation(project, { runner: queuedRunner([success('0.1.2')]) })
    expect(installation).toMatchObject({ support: 'compatible', adapterId: 'protocol-1', protocolGeneration: 'protocol-1' })
  })

  it('blocks a new protocol generation by default', async () => {
    const project = await temporaryProject()
    await expect(resolveDshInstallation(project, {
      runner: queuedRunner([success('0.2.0')]),
    })).rejects.toMatchObject({ code: 'DSHX5101', file: project.packageFile })
  })

  it('continues with the rc.8 adapter and a warning when explicitly allowed', async () => {
    const project = await temporaryProject({ allowUnsupported: true })
    const installation = await resolveDshInstallation(project, {
      runner: queuedRunner([success('0.2.0')]),
    })
    expect(installation).toMatchObject({
      version: '0.2.0',
      support: 'unsupported',
      compatibility: { version: '0.1.0-rc.8' },
    })
    expect(installation.diagnostics).toEqual([
      expect.objectContaining({ code: 'DSHX5101', severity: 'warning', file: project.packageFile }),
    ])
  })
})

describe('profile inspection', () => {
  it.each(['a/b', 'a\\b', '.', '..', 'node_modules'])('rejects invalid profile name %s before running DSH', async (profile) => {
    const project = await temporaryProject({ profile })
    const calls: RecordedCommand[] = []
    await expect(inspectProjectProfile(project, { runner: queuedRunner([], calls) })).rejects.toMatchObject({
      code: 'DSHX4301',
      file: project.packageFile,
    })
    expect(calls).toEqual([])
  })

  it('reports an absent project from an empty profile', async () => {
    const project = await temporaryProject()
    const state = await inspectProjectProfile(project, { runner: queuedRunner([list()]) })
    expect(state).toEqual({
      state: 'absent',
      profile: 'web',
      packageId: project.packageId,
      root: project.root,
    })
  })

  it('recognizes the exact package id and real project path', async () => {
    const project = await temporaryProject()
    const state = await inspectProjectProfile(project, {
      runner: queuedRunner([list({ [project.packageId]: { path: project.root, version: `link:${project.root}` } })]),
    })
    expect(state.state).toBe('linked')
  })

  it('rejects the package id when it points to another project', async () => {
    const project = await temporaryProject()
    const other = await temporaryProject({ packageId: '@test/other' })
    await expect(inspectProjectProfile(project, {
      runner: queuedRunner([list({ [project.packageId]: { path: other.root } })]),
    })).rejects.toMatchObject({
      code: 'DSHX4303',
      message: expect.stringContaining('another path'),
      hint: expect.stringContaining(`remove ${project.packageId}`),
    })
  })

  it('rejects the project path when linked under an old package id', async () => {
    const project = await temporaryProject()
    await expect(inspectProjectProfile(project, {
      runner: queuedRunner([list({ '@test/old-name': { path: project.root } })]),
    })).rejects.toMatchObject({
      code: 'DSHX4303',
      message: expect.stringContaining('@test/old-name'),
      hint: expect.stringContaining('remove @test/old-name'),
    })
  })

  it.each([
    ['missing path field', { '@test/broken': {} }],
    ['relative path field', { '@test/broken': { path: './broken' } }],
    ['missing target', { '@test/broken': { path: resolve(tmpdir(), 'dshx-definitely-missing') } }],
  ])('rejects a dependency with a %s', async (_label, dependencies) => {
    const project = await temporaryProject()
    await expect(inspectProjectProfile(project, {
      runner: queuedRunner([list(dependencies)]),
    })).rejects.toMatchObject({ code: 'DSHX4302', file: project.packageFile })
  })

  it.each([
    [success('not-json'), 'invalid JSON'],
    [{ exitCode: 1, stdout: '', stderr: 'profile unavailable' }, 'Failed to inspect'],
  ] as const)('converts malformed and failed list commands into profile errors', async (result, message) => {
    const project = await temporaryProject()
    await expect(inspectProjectProfile(project, { runner: queuedRunner([result]) })).rejects.toMatchObject({
      code: 'DSHX4302',
      message: expect.stringContaining(message),
      file: project.packageFile,
    })
  })
})

describe('profile linking', () => {
  it('does not add an already linked project', async () => {
    const project = await temporaryProject()
    const calls: RecordedCommand[] = []
    const prepared = await ensureProjectProfile(project, {
      runner: queuedRunner([
        success('0.1.0-rc.8'),
        list({ [project.packageId]: { path: project.root } }),
      ], calls),
    })
    expect(prepared.link).toBe('existing')
    expect(calls.map(call => call.args)).toEqual([
      ['--version'],
      ['plugin', '--profile', 'web', 'list', '--depth', '0', '--json'],
    ])
  })

  it('adds an absent project exactly once and verifies the resulting link', async () => {
    const project = await temporaryProject()
    const calls: RecordedCommand[] = []
    const prepared = await ensureProjectProfile(project, {
      runner: queuedRunner([
        success('0.1.0-rc.8'),
        list(),
        success('installed'),
        list({ [project.packageId]: { path: project.root } }),
      ], calls),
    })
    expect(prepared).toMatchObject({
      profile: 'web',
      packageId: project.packageId,
      root: project.root,
      link: 'added',
      diagnostics: [],
    })
    expect(calls.map(call => call.args)).toEqual([
      ['--version'],
      ['plugin', '--profile', 'web', 'list', '--depth', '0', '--json'],
      ['plugin', '--profile', 'web', 'add', project.root],
      ['plugin', '--profile', 'web', 'list', '--depth', '0', '--json'],
    ])
  })

  it('reports an official add failure', async () => {
    const project = await temporaryProject()
    await expect(ensureProjectProfile(project, {
      runner: queuedRunner([
        success('0.1.0-rc.8'),
        list(),
        { exitCode: 1, stdout: '', stderr: 'pnpm add failed' },
      ]),
    })).rejects.toMatchObject({ code: 'DSHX4304', message: expect.stringContaining('pnpm add failed') })
  })

  it('rejects a successful add whose link remains absent', async () => {
    const project = await temporaryProject()
    await expect(ensureProjectProfile(project, {
      runner: queuedRunner([
        success('0.1.0-rc.8'),
        list(),
        success(),
        list(),
      ]),
    })).rejects.toMatchObject({ code: 'DSHX4304', message: expect.stringContaining('still absent') })
  })
})

describe('local-first DSH resolution', () => {
  it('uses a locally declared and installed DSH binary', async () => {
    const project = await temporaryProject()
    const manifest = {
      name: project.packageId,
      type: 'module',
      devDependencies: { '@deepseek-ai/dsh': '0.1.0-rc.8' },
    }
    await writeFile(project.packageFile, JSON.stringify(manifest, null, 2))
    const packageDir = resolve(project.root, 'node_modules/@deepseek-ai/dsh')
    const binDir = resolve(project.root, 'node_modules/.bin')
    await mkdir(packageDir, { recursive: true })
    await mkdir(binDir, { recursive: true })
    await writeFile(resolve(packageDir, 'package.json'), JSON.stringify({
      name: '@deepseek-ai/dsh',
      version: '0.1.0-rc.8',
      bin: { dsh: './bin.cjs' },
    }))
    await writeFile(resolve(packageDir, 'bin.cjs'), '#!/usr/bin/env node\nconsole.log("0.1.0-rc.8")\n')
    await chmod(resolve(packageDir, 'bin.cjs'), 0o755)
    if (process.platform === 'win32') {
      await writeFile(
        resolve(binDir, 'dsh.CMD'),
        '@ECHO off\r\nnode "%~dp0\\..\\@deepseek-ai\\dsh\\bin.cjs" %*\r\n',
      )
    } else {
      await symlink('../@deepseek-ai/dsh/bin.cjs', resolve(binDir, 'dsh'))
    }
    const localProject: ResolvedDshxConfig = { ...project, manifest }
    await expect(resolveDshInstallation(localProject)).resolves.toMatchObject({
      version: '0.1.0-rc.8',
      executable: 'local',
      support: 'verified',
    })
  })

  it('falls back to an official dsh on PATH when pnpm has no local command', async () => {
    const project = await temporaryProject()
    const originalPath = process.env.PATH
    const binDir = await mkdtemp(resolve(tmpdir(), 'dshx-bin-'))
    temporaryDirectories.push(binDir)
    await writeFile(resolve(binDir, 'dsh'), '#!/usr/bin/env node\nconsole.log("0.1.0-rc.8")\n')
    await chmod(resolve(binDir, 'dsh'), 0o755)
    process.env.PATH = `${binDir}:${originalPath ?? ''}`
    try {
      await expect(resolveDshInstallation(project)).resolves.toMatchObject({ executable: 'global', version: '0.1.0-rc.8' })
    } finally {
      if (originalPath === undefined) delete process.env.PATH
      else process.env.PATH = originalPath
    }
  })

  it('reports no CLI when the project has no local DSH and PATH has none', async () => {
    const project = await temporaryProject()
    await expect(resolveDshInstallation(project)).rejects.toMatchObject({
      code: 'DSHX5001',
      file: project.packageFile,
    })
  })
})
