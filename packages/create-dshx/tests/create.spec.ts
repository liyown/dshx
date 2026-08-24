import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { PassThrough } from 'node:stream'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createProject, detectPackageManager, validateProjectName } from '../src/index.js'
import { defaultFileSystem } from '../src/fs.js'
import { runCreate } from '../src/cli.js'

async function temp(): Promise<string> { return mkdtemp(resolve(tmpdir(), 'dshx-create-')) }

describe('create-dshx', () => {
  it('validates names and rejects existing targets before writing', async () => {
    expect(validateProjectName('Bad Name')?.code).toBe('DSHX6001')
    const root = await temp()
    await mkdir(resolve(root, 'demo'))
    const result = await createProject({ name: 'demo', cwd: root, install: false })
    expect(result.diagnostics[0]?.code).toBe('DSHX6002')
    await rm(root, { recursive: true, force: true })
  })

  it('renders a complete full template without workspace dependencies', async () => {
    const root = await temp()
    const result = await createProject({ name: 'demo', cwd: root, install: false })
    expect(result.files).toHaveLength(10)
    const manifest = JSON.parse(await defaultFileSystem.readFile(resolve(result.root, 'package.json'))) as { devDependencies: Record<string, string>; scripts: Record<string, string> }
    expect(manifest.devDependencies['@becomeopc/dshx']).toBe('0.1.1')
    expect(manifest.devDependencies['@deepseek-ai/dsh']).toBe('>=0.1.0-rc.8 <0.2.0')
    expect(manifest.scripts.dev).toBe('dshx dev --open')
    expect(Object.values(manifest.devDependencies).some(value => value.startsWith('workspace:'))).toBe(false)
    expect(await readFile(resolve(result.root, 'src/client.tsx'), 'utf8')).toContain('Build. Ship. Observe.')
    expect(await readFile(resolve(result.root, 'src/api/status.ts'), 'utf8')).toContain('defineApi')
    expect(await readFile(resolve(result.root, 'src/Status.module.css'), 'utf8')).toContain('.deck')
    await rm(root, { recursive: true, force: true })
  })

  it('detects project lockfiles before PATH commands', async () => {
    const root = await temp()
    await writeFile(resolve(root, 'yarn.lock'), '')
    const runner = async (): Promise<{ exitCode: number }> => ({ exitCode: 0 })
    await expect(detectPackageManager(root, defaultFileSystem, runner)).resolves.toBe('yarn')
    await rm(root, { recursive: true, force: true })
  })

  it('uses packageManager metadata before PATH and keeps PATH priority stable', async () => {
    const root = await temp()
    await writeFile(resolve(root, 'package.json'), JSON.stringify({ packageManager: 'yarn@4.9.4' }))
    const runner = async (): Promise<{ exitCode: number }> => ({ exitCode: 0 })
    await expect(detectPackageManager(root, defaultFileSystem, runner)).resolves.toBe('yarn')

    const fs = {
      ...defaultFileSystem,
      exists: async (): Promise<boolean> => false,
    }
    const calls: string[] = []
    const pathRunner = async (_command: string, args: readonly string[]): Promise<{ exitCode: number }> => {
      calls.push(args[0] ?? '')
      return { exitCode: args[0] === 'pnpm' ? 0 : 1 }
    }
    await expect(detectPackageManager(root, fs, pathRunner)).resolves.toBe('pnpm')
    expect(calls).toEqual(['pnpm'])
    await rm(root, { recursive: true, force: true })
  })

  it('keeps an explicit package manager ahead of project detection', async () => {
    const root = await temp()
    const calls: string[] = []
    const runner = async (command: string): Promise<{ exitCode: number }> => {
      calls.push(command)
      return { exitCode: 0 }
    }
    const result = await createProject({ name: 'demo', cwd: root, packageManager: 'npm' }, { runner })
    expect(result.packageManager).toBe('npm')
    expect(calls).toEqual(['npm'])
    await rm(root, { recursive: true, force: true })
  })

  it('keeps generated files when installation fails', async () => {
    const root = await temp()
    const runner = async (command: string): Promise<{ exitCode: number }> => ({ exitCode: command === 'which' ? 0 : 1 })
    const result = await createProject({ name: 'demo', cwd: root }, { runner })
    expect(result.diagnostics[0]?.code).toBe('DSHX6004')
    expect(result.files).not.toHaveLength(0)
    await rm(root, { recursive: true, force: true })
  })

  it('accepts injected CLI IO for generation tests', async () => {
    const root = await temp()
    const output = new PassThrough()
    const chunks: Buffer[] = []
    output.on('data', chunk => chunks.push(Buffer.from(chunk)))
    const input = new PassThrough() as PassThrough & { isTTY?: boolean }
    input.isTTY = false
    await expect(runCreate(['demo', '--cwd', root, '--no-install', '--yes'], { stdin: input, stdout: output, stderr: output })).resolves.toBe(0)
    expect(Buffer.concat(chunks).toString()).toContain('Created demo')
    await rm(root, { recursive: true, force: true })
  })

  it('requires a name in non-interactive mode instead of reading stdin', async () => {
    const output = new PassThrough()
    const input = new PassThrough() as PassThrough & { isTTY?: boolean }
    input.isTTY = false
    await expect(runCreate(['--yes'], { stdin: input, stdout: output, stderr: output })).resolves.toBe(2)
  })
})
