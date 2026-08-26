import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { PassThrough } from 'node:stream'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createProject, DEFAULT_DSH_RANGE, DEFAULT_DSH_VERSION, detectPackageManager, packageVersion, validateProjectName } from '../src/index.js'
import { DEFAULT_COMPATIBILITY } from '../../dshx/src/compat/index.js'
import { defaultFileSystem } from '../src/fs.js'
import { runCreate } from '../src/cli.js'

async function temp(): Promise<string> {
  return mkdtemp(resolve(tmpdir(), 'dshx-create-'))
}

describe('create-dshx', () => {
  it('keeps generated DSH defaults aligned with the core compatibility registry', () => {
    expect(DEFAULT_DSH_RANGE).toBe(DEFAULT_COMPATIBILITY.dshRange)
    expect(DEFAULT_DSH_VERSION).toBe(DEFAULT_COMPATIBILITY.verified.latest)
  })

  it('validates names and rejects existing targets before writing', async () => {
    expect(validateProjectName('Bad Name')?.code).toBe('DSHX6001')
    const root = await temp()
    await mkdir(resolve(root, 'demo'))
    const result = await createProject({ name: 'demo', cwd: root, install: false })
    expect(result.diagnostics[0]?.code).toBe('DSHX6002')
    await rm(root, { recursive: true, force: true })
  })

  it.each([
    ['starter', 'css-modules'],
    ['starter', 'tailwind'],
    ['starter', 'none'],
    ['showcase', 'css-modules'],
    ['showcase', 'tailwind'],
    ['showcase', 'none'],
  ] as const)('renders the %s + %s combination with exact files and dependencies', async (template, style) => {
    const root = await temp()
    const result = await createProject({ name: `demo-${template}-${style}`, cwd: root, install: false, template, style })
    expect(result.diagnostics).toEqual([])
    expect(result.template).toBe(template)
    expect(result.style).toBe(style)

    const relativeFiles = result.files.map(file => file.slice(result.root.length + 1)).sort()
    expect(relativeFiles).toContain('src/host.ts')
    expect(relativeFiles).toContain('src/client.tsx')
    expect(relativeFiles).toContain('dshx.config.ts')
    expect(relativeFiles.includes('src/api/status.ts')).toBe(template === 'showcase')
    expect(relativeFiles.includes('src/settings.ts')).toBe(template === 'showcase')
    expect(relativeFiles.includes('src/Plugin.module.css')).toBe(style === 'css-modules')
    expect(relativeFiles.includes('src/css-modules.d.ts')).toBe(style === 'css-modules')
    expect(relativeFiles.includes('src/styles.css')).toBe(style === 'tailwind')
    expect(relativeFiles.some(file => file.endsWith('.css'))).toBe(style !== 'none')

    const manifest = JSON.parse(await readFile(resolve(result.root, 'package.json'), 'utf8')) as {
      devDependencies: Record<string, string>
      peerDependencies: Record<string, string>
      scripts: Record<string, string>
      dsh: { client: { inject: string[] } }
    }
    expect(manifest.devDependencies['@becomeopc/dshx']).toBe(packageVersion())
    expect(manifest.devDependencies['@deepseek-ai/dsh']).toBe(DEFAULT_DSH_VERSION)
    expect(manifest.peerDependencies['@deepseek-ai/dsh']).toBe(DEFAULT_DSH_RANGE)
    expect(manifest.scripts).toEqual({
      check: 'dshx check',
      build: 'dshx build',
      dev: 'dshx dev --open',
      prepack: 'npm run check && npm run build',
    })
    expect(Object.values(manifest.devDependencies).some(value => value.startsWith('workspace:'))).toBe(false)
    expect(manifest.devDependencies.tailwindcss).toBe(style === 'tailwind' ? '^4.3.3' : undefined)
    expect(manifest.devDependencies['@tailwindcss/vite']).toBe(style === 'tailwind' ? '^4.3.3' : undefined)

    const config = await readFile(resolve(result.root, 'dshx.config.ts'), 'utf8')
    expect(config).toContain("import { defineConfig } from '@becomeopc/dshx'")
    expect(config).toContain("host: { entry: 'src/host.ts' }")
    expect(config).toContain("entry: 'src/client.tsx'")
    expect(config).toContain('declarations: true')
    expect(config.includes("import tailwindcss from '@tailwindcss/vite'")).toBe(style === 'tailwind')

    const readme = await readFile(resolve(result.root, 'README.md'), 'utf8')
    expect(readme).toContain('dsh.client.inject')
    expect(readme).toContain('defineClient({ inject: [...] })')
    expect(readme).toContain('defineLocale()')

    const host = await readFile(resolve(result.root, 'src/host.ts'), 'utf8')
    const client = await readFile(resolve(result.root, 'src/client.tsx'), 'utf8')
    expect(host).toContain('defineTool')
    expect(client).toContain("defineSlot('sidebar.footer.action'")
    expect(client.includes('defineLocale(')).toBe(template === 'starter')
    expect(client.includes('locales: [copy]')).toBe(template === 'starter')
    expect(client).not.toContain('declare module')
    expect(client).not.toMatch(/defineClient\(\{[^}]*\b(?:api|apis|settings)\s*:/s)
    expect(client).not.toContain('useQuery')
    expect(host.includes('definePromptSection')).toBe(template === 'showcase')
    expect(host.includes('definePromptContext')).toBe(template === 'showcase')
    expect(host.includes('settings: [runtimeSettings]')).toBe(template === 'showcase')
    expect(host.includes('apis: [statusHostApi]')).toBe(template === 'showcase')
    expect(client.includes("useApiQuery(statusApi, 'get', { enabled: true })")).toBe(template === 'showcase')
    expect(client.includes('useSettings(runtimeSettings)')).toBe(template === 'showcase')
    expect(client).not.toContain('Conversation')

    const starterProviders = ['@deepseek-ai/dsh-client-locale', '@deepseek-ai/dsh-client-ui-sidebar']
    const showcaseProviders = ['@deepseek-ai/dsh-client-connection', '@deepseek-ai/dsh-client-ui-sidebar', '@deepseek-ai/dsh-client-ui-settings']
    expect(manifest.dsh.client.inject).toEqual(template === 'showcase' ? showcaseProviders : starterProviders)
    expect(Boolean(manifest.devDependencies['@deepseek-ai/dsh-client-locale'])).toBe(template === 'starter')
    expect(Boolean(manifest.peerDependencies['@deepseek-ai/dsh-client-locale'])).toBe(template === 'starter')
    expect(Boolean(manifest.devDependencies['@deepseek-ai/dsh-client-connection'])).toBe(template === 'showcase')
    expect(Boolean(manifest.peerDependencies['@deepseek-ai/dsh-client-connection'])).toBe(template === 'showcase')
    expect(Boolean(manifest.devDependencies['@deepseek-ai/dsh-system-prompt'])).toBe(template === 'showcase')
    expect(Boolean(manifest.devDependencies['@deepseek-ai/dsh-settings'])).toBe(template === 'showcase')

    if (style === 'tailwind') {
      const css = await readFile(resolve(result.root, 'src/styles.css'), 'utf8')
      expect(css).toContain('@layer theme, utilities;')
      expect(css).toContain('prefix(dshx)')
      expect(css).not.toContain('preflight.css')
      expect(client).toContain('dshx:')
      expect(client).not.toMatch(/className=\{`[^`]*\$\{/)
    }

    await rm(root, { recursive: true, force: true })
  })

  it('defaults programmatic and --yes generation to starter + css-modules', async () => {
    const root = await temp()
    const direct = await createProject({ name: 'direct-default', cwd: root, install: false })
    expect(direct.template).toBe('starter')
    expect(direct.style).toBe('css-modules')
    expect(await readFile(resolve(direct.root, 'src/Plugin.module.css'), 'utf8')).toContain('.card')

    const output = new PassThrough()
    const input = new PassThrough() as PassThrough & { isTTY?: boolean }
    input.isTTY = false
    await expect(runCreate(['cli-default', '--cwd', root, '--no-install', '--yes'], { stdin: input, stdout: output, stderr: output })).resolves.toBe(0)
    expect(await readFile(resolve(root, 'cli-default/src/Plugin.module.css'), 'utf8')).toContain('.card')
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

  it('accepts CLI selectors and asks both choices in interactive mode', async () => {
    const root = await temp()
    const output = new PassThrough()
    const input = new PassThrough() as PassThrough & { isTTY?: boolean }
    input.isTTY = true
    const answers = ['showcase', 'tailwind']
    const questions: string[] = []
    const readLine = async (question: string): Promise<string> => {
      questions.push(question)
      return answers.shift() ?? ''
    }
    await expect(runCreate(['interactive-demo', '--cwd', root, '--no-install'], { stdin: input, stdout: output, stderr: output, readLine })).resolves.toBe(0)
    expect(questions).toEqual(['Project template (starter/showcase): ', 'Client style (css-modules/tailwind/none): '])
    expect(await readFile(resolve(root, 'interactive-demo/src/api/status.ts'), 'utf8')).toContain('defineApi')
    expect(await readFile(resolve(root, 'interactive-demo/src/styles.css'), 'utf8')).toContain('prefix(dshx)')

    await expect(runCreate(['bad', '--template', 'full', '--no-install'], { stdin: input, stdout: output, stderr: output })).resolves.toBe(2)
    await expect(runCreate(['bad', '--style', 'sass', '--no-install'], { stdin: input, stdout: output, stderr: output })).resolves.toBe(2)
    await rm(root, { recursive: true, force: true })
  })

  it('requires a name in non-interactive mode instead of reading stdin', async () => {
    const output = new PassThrough()
    const input = new PassThrough() as PassThrough & { isTTY?: boolean }
    input.isTTY = false
    await expect(runCreate(['--yes'], { stdin: input, stdout: output, stderr: output })).resolves.toBe(2)
  })
})
