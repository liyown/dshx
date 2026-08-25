import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { buildHost } from '../src/compiler/index.js'
import { startHostWatcher } from '../src/compiler/host/build.js'

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const fixtureRoot = resolve(packageRoot, '../../fixtures/phase-a')
const temporaryDirectories: string[] = []

async function temporaryProject(): Promise<string> {
  const directory = await mkdtemp(resolve(tmpdir(), 'dshx-host-'))
  temporaryDirectories.push(directory)
  await cp(fixtureRoot, directory, { recursive: true })
  return directory
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map(directory => rm(directory, { recursive: true, force: true })))
})

describe('host compiler', () => {
  it('adapts a defineHost default export and inlines the DSHX Host runtime', async () => {
    const root = await temporaryProject()
    await writeFile(
      resolve(root, 'src/host.ts'),
      [
        "import { defineHost } from '@becomeopc/dshx/host'",
        "const first = { name: 'first' }",
        "const second = { name: 'second' }",
        'export default defineHost({',
        "  inject: ['agents', 'agents'],",
        '  tools: [first, second],',
        "  setup(ctx) { ctx.calls.push('setup') },",
        '})',
        '',
      ].join('\n'),
    )
    await buildHost({
      packageId: '@dshx/phase-a-fixture',
      logicalName: 'logical-phase-a',
      root,
      entry: 'src/host.ts',
      outDir: 'dist',
    })

    const output = resolve(root, 'dist/index.js')
    const code = await readFile(output, 'utf8')
    expect(code).not.toMatch(/from ['"]dshx\/(?:host|internal-host-runtime)['"]/)
    const plugin = (await import(`${pathToFileURL(output).href}?test=${Date.now()}`)) as {
      name: string
      inject: readonly string[]
      apply(ctx: unknown): unknown
    }
    const calls: string[] = []
    const ctx = {
      calls,
      tools: {
        register(value: { name: string }) {
          calls.push(`tool:${value.name}`)
        },
      },
    }
    expect(plugin.name).toBe('logical-phase-a')
    expect(plugin.inject).toEqual(['agents', 'tools'])
    plugin.apply(ctx)
    expect(calls).toEqual(['tool:first', 'tool:second', 'setup'])
  })

  it('keeps official defineTool external while adapting the Host entry', async () => {
    const root = await temporaryProject()
    await writeFile(
      resolve(root, 'src/host.ts'),
      [
        "import { defineHost, defineTool } from '@becomeopc/dshx/host'",
        'const tool = defineTool({',
        "  name: 'status',",
        "  description: 'Return status.',",
        '  parameters: {},',
        '  output: {',
        "    schema: { type: 'string' },",
        "    render: (_args, value) => [{ type: 'text', text: value }],",
        '  },',
        "  async execute() { return 'ok' },",
        '})',
        'export default defineHost({ tools: [tool] })',
        '',
      ].join('\n'),
    )

    await buildHost({
      packageId: '@dshx/phase-a-fixture',
      root,
      entry: 'src/host.ts',
      outDir: 'dist',
    })

    const code = await readFile(resolve(root, 'dist/index.js'), 'utf8')
    expect(code).not.toMatch(/from ['"](?:dshx\/host|dshx\/internal-host-runtime)['"]/)
    expect(code).toMatch(/from ['"]@deepseek-ai\/dsh-tools['"]/)
    expect(code.match(/from ['"]@deepseek-ai\/dsh-tools['"]/g)).toHaveLength(1)
    const plugin = (await import(`${pathToFileURL(resolve(root, 'dist/index.js')).href}?test=${Date.now()}`)) as {
      inject: readonly string[]
      apply(ctx: unknown): unknown
    }
    const registered: unknown[] = []
    plugin.apply({
      tools: {
        register(tool: unknown) {
          registered.push(tool)
        },
      },
    })
    expect(plugin.inject).toEqual(['tools'])
    expect(registered).toHaveLength(1)
  })

  it('embeds the same API contract validation as the public source module', async () => {
    const root = await temporaryProject()
    await writeFile(
      resolve(root, 'src/host.ts'),
      [
        "import { defineApi, method } from '@becomeopc/dshx/api'",
        "import { defineHost } from '@becomeopc/dshx/host'",
        "const invalid = defineApi({ id: 'invalid/id', version: 1, methods: { get: method() } })",
        'export default defineHost({ api: invalid.host({ get() {} }) })',
        '',
      ].join('\n'),
    )
    await buildHost({ packageId: '@dshx/phase-a-fixture', root, entry: 'src/host.ts', outDir: 'dist' })
    const output = resolve(root, 'dist/index.js')
    await expect(import(`${pathToFileURL(output).href}?test=${Date.now()}`)).rejects.toThrow('Invalid API id')
    expect(await readFile(output, 'utf8')).not.toContain('@becomeopc/dshx/api')
  })

  it('inlines defineCommand and registers official definitions through ctx.commands', async () => {
    const root = await temporaryProject()
    await writeFile(
      resolve(root, 'src/host.ts'),
      [
        "import { defineCommand, defineHost } from '@becomeopc/dshx/host'",
        "const status = defineCommand({ name: 'status', description: 'Return status.', handler: () => ({ kind: 'success', text: 'ready' }) })",
        'export default defineHost({ commands: [status] })',
        '',
      ].join('\n'),
    )
    await buildHost({ packageId: '@dshx/phase-a-fixture', root, entry: 'src/host.ts', outDir: 'dist' })
    const output = resolve(root, 'dist/index.js')
    const code = await readFile(output, 'utf8')
    expect(code).not.toContain('@becomeopc/dshx/host')
    expect(code).not.toContain('@deepseek-ai/dsh-commands')
    const plugin = (await import(`${pathToFileURL(output).href}?test=${Date.now()}`)) as { inject: string[]; apply(ctx: unknown): void }
    const registered: unknown[] = []
    plugin.apply({
      commands: {
        register(command: unknown) {
          registered.push(command)
          return () => undefined
        },
      },
    })
    expect(plugin.inject).toEqual(['commands'])
    expect(registered).toHaveLength(1)
  })

  it('uses the public Prompt helpers in built artifacts without retaining DSHX or Prompt package imports', async () => {
    const root = await temporaryProject()
    await writeFile(
      resolve(root, 'src/host.ts'),
      [
        "import { defineHost, definePromptContext, definePromptSection } from '@becomeopc/dshx/host'",
        "const guidanceValue = { name: 'plugin:guidance', order: 150, text: 'Use status.' }",
        "const contextValue = { name: 'plugin:runtime', order: 0, text: () => 'ready' }",
        'const guidance = definePromptSection(guidanceValue)',
        'const runtime = definePromptContext(contextValue)',
        'export default defineHost({ prompts: [guidance, runtime] })',
        '',
      ].join('\n'),
    )
    await buildHost({ packageId: '@dshx/phase-a-fixture', root, entry: 'src/host.ts', outDir: 'dist' })
    const output = resolve(root, 'dist/index.js')
    const code = await readFile(output, 'utf8')
    expect(code).not.toContain('@becomeopc/dshx/host')
    expect(code).not.toContain('@deepseek-ai/dsh-system-prompt')
    const plugin = (await import(`${pathToFileURL(output).href}?test=${Date.now()}`)) as { inject: string[]; apply(ctx: unknown): void }
    const registered: Array<{ kind: string; value: unknown }> = []
    plugin.apply({
      systemPrompt: {
        section(value: unknown) {
          registered.push({ kind: 'section', value })
          return () => undefined
        },
        context(value: unknown) {
          registered.push({ kind: 'context', value })
          return () => undefined
        },
      },
    })
    expect(plugin.inject).toEqual(['systemPrompt'])
    expect(registered).toEqual([
      { kind: 'section', value: expect.objectContaining({ name: 'plugin:guidance', order: 150 }) },
      { kind: 'context', value: expect.objectContaining({ name: 'plugin:runtime', order: 0 }) },
    ])
  })

  it('inlines the shared Settings helper while keeping only the official Host service import', async () => {
    const root = await temporaryProject()
    await writeFile(
      resolve(root, 'src/host.ts'),
      [
        "import { defineHost } from '@becomeopc/dshx/host'",
        "import { defineSettings } from '@becomeopc/dshx/settings'",
        "const schema = Object.assign(value => value, { toJSON: () => ({ type: 'object' }) })",
        "const runtimeSettings = defineSettings({ namespace: 'phase-a', schema, applies: 'live' })",
        'export default defineHost({ settings: [runtimeSettings] })',
        '',
      ].join('\n'),
    )
    await buildHost({ packageId: '@dshx/phase-a-fixture', root, entry: 'src/host.ts', outDir: 'dist' })
    const code = await readFile(resolve(root, 'dist/index.js'), 'utf8')
    expect(code).not.toContain('@becomeopc/dshx/settings')
    expect(code).not.toContain('@becomeopc/dshx/host')
    expect(code).toContain('@deepseek-ai/dsh-settings')
    expect(code).toContain('settings: [defineSettings({')
    expect(code).toContain('namespace: "phase-a"')
  })

  it('emits a Node ESM entry with a sourcemap and preserves package imports', async () => {
    const root = await temporaryProject()
    await writeFile(
      resolve(root, 'src/host.ts'),
      [
        "import { join } from 'node:path'",
        "import helper from './host-helper.ts'",
        'export const name = helper',
        "export const inject = ['tools']",
        'export function apply(ctx: { tools: { register(tool: unknown): unknown } }) {',
        '  ctx.tools.register({ name: join(name, helper) })',
        '}',
        '',
      ].join('\n'),
    )
    await writeFile(resolve(root, 'src/host-helper.ts'), "export default 'dshx-host'\n")

    await buildHost({ packageId: '@dshx/phase-a-fixture', root, entry: 'src/host.ts', outDir: 'dist' })

    const code = await readFile(resolve(root, 'dist/index.js'), 'utf8')
    const map = JSON.parse(await readFile(resolve(root, 'dist/index.js.map'), 'utf8')) as {
      sources: string[]
      sourcesContent?: Array<string | null>
    }
    expect(code).toMatch(/from ['"]node:path['"]/)
    expect(code).toContain('dshx-host')
    expect(code).toMatch(/sourceMappingURL=index\.js\.map/)
    expect(map.sources.some(source => source.endsWith('/src/host.ts') || source.endsWith('src/host.ts'))).toBe(true)
    expect(map.sourcesContent?.some(source => source?.includes('export const name') === true)).toBe(true)
  })

  it('builds a client-only project with the standard no-op Host entry', async () => {
    const root = await temporaryProject()
    await buildHost({ packageId: '@dshx/phase-a-fixture', logicalName: 'client-only-host', root, outDir: 'dist' })
    const output = resolve(root, 'dist/index.js')
    expect(await readFile(output, 'utf8')).toContain('function apply()')
    const plugin = (await import(`${pathToFileURL(output).href}?test=${Date.now()}`)) as { name: string; apply(): unknown }
    expect(plugin.name).toBe('client-only-host')
    expect(plugin.apply()).toBeUndefined()
  })

  it('preserves native Host Config and forwards apply arguments', async () => {
    const root = await temporaryProject()
    await writeFile(
      resolve(root, 'src/host.ts'),
      [
        "export const name = 'native-host'",
        "export const inject = { agents: { mode: 'test' } }",
        "export const Config = { marker: 'schema' }",
        'export function apply(ctx, config) { ctx.received = config; return config.enabled }',
        '',
      ].join('\n'),
    )
    await buildHost({ packageId: '@dshx/phase-a-fixture', logicalName: 'fallback-name', root, entry: 'src/host.ts', outDir: 'dist' })
    const output = resolve(root, 'dist/index.js')
    const plugin = (await import(`${pathToFileURL(output).href}?test=${Date.now()}`)) as {
      name: string
      inject: unknown
      Config: unknown
      apply(ctx: { received?: unknown }, config: unknown): unknown
    }
    const ctx: { received?: unknown } = {}
    const config = { enabled: true }
    expect(plugin.name).toBe('native-host')
    expect(plugin.inject).toEqual({ agents: { mode: 'test' } })
    expect(plugin.Config).toEqual({ marker: 'schema' })
    expect(plugin.apply(ctx, config)).toBe(true)
    expect(ctx.received).toBe(config)
  })

  it('does not remove an existing Client artifact in the shared output directory', async () => {
    const root = await temporaryProject()
    await mkdir(resolve(root, 'dist'), { recursive: true })
    await writeFile(resolve(root, 'dist/client.js'), 'window.__ModuleLoader__\n')
    await buildHost({ packageId: '@dshx/phase-a-fixture', root, entry: 'src/host.ts', outDir: 'dist' })
    expect(await readFile(resolve(root, 'dist/client.js'), 'utf8')).toBe('window.__ModuleLoader__\n')
  })

  it('rewrites the Host artifact after a watched source change', async () => {
    const root = await temporaryProject()
    const sourcePath = resolve(root, 'src/host.ts')
    await writeFile(
      sourcePath,
      "import { defineHost } from '@becomeopc/dshx/host'\nexport default defineHost({ setup() { return 'Phase A has no Host behavior' } })\n",
    )
    const result = await buildHost({
      packageId: '@dshx/phase-a-fixture',
      root,
      entry: 'src/host.ts',
      outDir: 'dist',
      watch: true,
    })
    if (!('on' in result) || !('close' in result)) throw new Error('watch build did not return a watcher')
    const events: string[] = []
    result.on('event', event => {
      events.push(event.code)
    })

    const waitForEvent = async (code: string): Promise<void> => {
      const deadline = Date.now() + 10_000
      while (Date.now() < deadline) {
        if (events.includes(code)) return
        await new Promise(resolveTimer => setTimeout(resolveTimer, 20))
      }
      throw new Error(`timed out waiting for watcher event ${code}; events: ${events.join(', ')}`)
    }

    const waitForArtifact = async (predicate: (code: string) => boolean): Promise<string> => {
      const deadline = Date.now() + 10_000
      while (Date.now() < deadline) {
        try {
          const code = await readFile(resolve(root, 'dist/index.js'), 'utf8')
          if (predicate(code)) return code
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
        }
        await new Promise(resolveTimer => setTimeout(resolveTimer, 20))
      }
      throw new Error(`timed out waiting for watched Host artifact; events: ${events.join(', ')}`)
    }

    try {
      // Wait until the watcher's own initial build is idle. Writing while that build is
      // running can be coalesced into it on fast filesystems and never trigger a rebuild.
      await waitForEvent('END')
      const first = await waitForArtifact(code => code.includes('Phase A has no Host behavior'))
      events.length = 0
      const source = await readFile(sourcePath, 'utf8')
      await writeFile(sourcePath, source.replace('Phase A has no Host behavior', 'Phase A Host rebuilt'))
      await waitForEvent('END')
      const second = await waitForArtifact(code => code.includes('Phase A Host rebuilt'))
      expect(first).not.toBe(second)
    } finally {
      await result.close()
    }
  })

  it('keeps watching after the initial build fails and recovers after a source fix', async () => {
    const root = await temporaryProject()
    const sourcePath = resolve(root, 'src/host.ts')
    await writeFile(sourcePath, 'export const = broken\n')
    const watcher = await startHostWatcher({
      packageId: '@dshx/phase-a-fixture',
      root,
      entry: 'src/host.ts',
      outDir: 'dist',
    })
    const waitFor = (code: 'ERROR' | 'BUNDLE_END'): Promise<void> =>
      new Promise((resolveEvent, reject) => {
        const timeout = setTimeout(() => reject(new Error(`timed out waiting for ${code}`)), 10_000)
        watcher.on('event', event => {
          if (event.code !== code) return
          clearTimeout(timeout)
          resolveEvent()
        })
      })

    try {
      await waitFor('ERROR')
      const recovered = waitFor('BUNDLE_END')
      await writeFile(sourcePath, "export const marker = 'watcher recovered'\nexport function apply() {}\n")
      await recovered
      expect(await readFile(resolve(root, 'dist/index.js'), 'utf8')).toContain('watcher recovered')
    } finally {
      await watcher.close()
    }
  })
})
