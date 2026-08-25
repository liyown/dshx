import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'
import { afterEach, describe, expect, it } from 'vitest'
import { buildClient } from '../src/compiler/index.js'

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const fixtureRoot = resolve(packageRoot, '../../fixtures/phase-a')
const temporaryDirectories: string[] = []

async function temporaryProject(): Promise<string> {
  const directory = await mkdtemp(resolve(tmpdir(), 'dshx-phase-a-'))
  temporaryDirectories.push(directory)
  await cp(fixtureRoot, directory, { recursive: true })
  return directory
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map(directory => rm(directory, { recursive: true, force: true })))
})
describe('client compiler', () => {
  it('emits one lazy-CJS bundle with external React, owned CSS, and a TSX sourcemap', async () => {
    const root = await temporaryProject()
    await buildClient({
      packageId: '@dshx/phase-a-fixture',
      root,
      entry: 'src/client.tsx',
      outDir: 'dist',
      inject: ['@deepseek-ai/dsh-client-connection'],
    })

    const code = await readFile(resolve(root, 'dist/client.js'), 'utf8')
    const map = JSON.parse(await readFile(resolve(root, 'dist/client.js.map'), 'utf8')) as {
      sources: string[]
      sourcesContent?: Array<string | null>
    }
    expect(code).toMatch(/window\.__ModuleLoader__\.load\(\{\s*id: "@dshx\/phase-a-fixture"/)
    expect(code).toContain('require("react/jsx-runtime")')
    expect(code).not.toContain('react.production.min')
    expect(code).toMatch(/sourceMappingURL=client\.js\.map/)
    expect(map.sources.some(source => source.endsWith('/src/client.tsx') || source.endsWith('src/client.tsx'))).toBe(true)
    expect(map.sourcesContent?.some(source => source?.includes('Build. Ship. Observe.') === true)).toBe(true)

    let registration: { id: string; factory: (requireModule: (id: string) => unknown) => Record<string, unknown> } | undefined
    const styles: Array<{ dataset: Record<string, string>; textContent: string }> = []
    const document = {
      querySelector: () => null,
      createElement: () => ({ dataset: {}, textContent: '' }),
      head: { appendChild: (style: { dataset: Record<string, string>; textContent: string }) => styles.push(style) },
    }
    vm.runInNewContext(code, {
      document,
      window: {
        __ModuleLoader__: {
          load: (value: typeof registration) => {
            registration = value
          },
        },
      },
    })
    expect(registration?.id).toBe('@dshx/phase-a-fixture')
    expect(styles).toHaveLength(0)

    const plugin = registration?.factory(id => {
      if (id === 'react') {
        const context = { Provider: 'provider' }
        return {
          createContext: () => context,
          createElement: (type: unknown, props: unknown, child: unknown) => ({ type, props: { ...(props as object), children: child } }),
          useContext: () => undefined,
          useEffect: () => undefined,
          useMemo: (factory: () => unknown) => factory(),
          useState: (value: unknown) => [value, () => undefined],
        }
      }
      if (id === 'react/jsx-runtime') {
        return {
          jsx: (type: unknown, props: unknown) => ({ type, props }),
          jsxs: (type: unknown, props: unknown) => ({ type, props }),
        }
      }
      throw new Error(`unexpected require: ${id}`)
    })
    expect(styles).toHaveLength(1)
    expect(styles[0]?.dataset.plugin).toBe('@dshx/phase-a-fixture')
    expect(styles[0]?.dataset.pluginCss).toContain('src/Status.module.css')
    expect(styles[0]?.textContent).toContain('background:#101b2a')
    const registered: unknown[] = []
    const clientPlugin = plugin as unknown as { name: string; inject: readonly string[]; apply(ctx: unknown): unknown }
    expect(clientPlugin.name).toBe('@dshx/phase-a-fixture')
    expect(clientPlugin.inject).toEqual(['slots', 'connection'])
    await clientPlugin.apply({
      slots: {
        inject: (_name: string, register: () => unknown) => register(),
        register: (options: unknown, component: unknown) => {
          registered.push({ options, component })
          return component
        },
      },
    })
    expect(registered).toHaveLength(1)
    const component = (registered[0] as { component: () => { type: unknown; props: { children: { type: string; props: { className: string } } } } }).component
    const element = component()
    expect(element.type).toBe('provider')
    expect(typeof element.props.children.type).toBe('function')
  })

  it('adapts a defineClient default export and keeps the logical name in the bundle', async () => {
    const root = await temporaryProject()
    await writeFile(
      resolve(root, 'src/client.tsx'),
      [
        "import { defineClient } from '@becomeopc/dshx/client'",
        'export default defineClient({',
        "  name: 'explicit-client',",
        "  inject: ['remote', 'remote'],",
        '  setup() {},',
        '})',
        '',
      ].join('\n'),
    )
    await buildClient({
      packageId: '@dshx/phase-a-fixture',
      logicalName: 'logical-client',
      root,
      entry: 'src/client.tsx',
      outDir: 'dist',
    })
    const code = await readFile(resolve(root, 'dist/client.js'), 'utf8')
    expect(code).not.toMatch(/(?:from|require)\(["']dshx\/client/)
    const registration: { factory: (requireModule: (id: string) => unknown) => Record<string, unknown> } = {} as never
    vm.runInNewContext(code, {
      window: { __ModuleLoader__: { load: (value: typeof registration) => Object.assign(registration, value) } },
    })
    const plugin = registration.factory(() => ({})) as { name: string; inject: string[] }
    expect(plugin.name).toBe('explicit-client')
    expect(plugin.inject).toEqual(['remote'])
  })

  it('retains declarative Conversation contributions and wires both official registries', async () => {
    const root = await temporaryProject()
    await writeFile(
      resolve(root, 'src/client.tsx'),
      [
        "import { defineClient } from '@becomeopc/dshx/client'",
        "import { defineConversation } from '@becomeopc/dshx/conversation'",
        'const component = () => null',
        'const review = defineConversation({',
        "  kind: 'review-job',",
        "  events: { 'review/job-started': { role: 'start', id: () => 'review-job' } },",
        '})',
        'const contribution = review.component({',
        '  initial({ event }) { return event.data },',
        '  view({ state }) { return { data: state } },',
        '  component,',
        '})',
        'export default defineClient({ conversations: [contribution] })',
        '',
      ].join('\n'),
    )
    await buildClient({
      packageId: '@dshx/phase-a-fixture',
      root,
      entry: 'src/client.tsx',
      outDir: 'dist',
      inject: ['@deepseek-ai/dsh-client-runtime', '@deepseek-ai/dsh-client-ui-conversation'],
    })

    const code = await readFile(resolve(root, 'dist/client.js'), 'utf8')
    expect(code).toContain('dshx.conversation-component.v1')
    expect(code).not.toContain('@becomeopc/dshx/conversation')
    const registration: { factory: (requireModule: (id: string) => unknown) => Record<string, unknown> } = {} as never
    vm.runInNewContext(code, {
      window: { __ModuleLoader__: { load: (value: typeof registration) => Object.assign(registration, value) } },
    })
    const plugin = registration.factory(() => ({})) as { inject: string[]; apply(ctx: unknown): void }
    expect(plugin.inject).toEqual(['conversationEvents', 'slots'])

    const calls: string[] = []
    plugin.apply({
      conversationEvents: {
        register: (value: { kind: string }) => {
          calls.push(`definition:${value.kind}`)
        },
      },
      slots: {
        inject: (name: string, registerRenderer: () => unknown) => {
          calls.push(`inject:${name}`)
          return registerRenderer()
        },
        register: (options: { key: string }, renderer: unknown) => {
          calls.push(`renderer:${options.key}:${typeof renderer}`)
        },
      },
    })
    expect(calls).toEqual(['definition:review-job', 'inject:conversation.chat.node', 'renderer:review-job:function'])
  })

  it('fails a retained Conversation component without both official provider package edges', async () => {
    const root = await temporaryProject()
    await writeFile(
      resolve(root, 'src/client.tsx'),
      [
        "import { defineClient } from '@becomeopc/dshx/client'",
        "const contribution = { marker: 'dshx.conversation-component.v1' }",
        'export default defineClient({ conversations: [contribution] })',
        '',
      ].join('\n'),
    )
    await expect(
      buildClient({
        packageId: '@dshx/phase-a-fixture',
        root,
        entry: 'src/client.tsx',
        outDir: 'dist',
        inject: ['@deepseek-ai/dsh-client-runtime'],
      }),
    ).rejects.toMatchObject({
      code: 'DSHX1203',
      hint: expect.stringContaining('@deepseek-ai/dsh-client-ui-conversation'),
    })
  })

  it('does not require Conversation provider edges when a component contract is tree-shaken', async () => {
    const root = await temporaryProject()
    await writeFile(
      resolve(root, 'src/client.tsx'),
      [
        "import { defineClient } from '@becomeopc/dshx/client'",
        "import { defineConversation } from '@becomeopc/dshx/conversation'",
        'void defineConversation',
        'export default defineClient({ setup() {} })',
        '',
      ].join('\n'),
    )
    await buildClient({ packageId: '@dshx/phase-a-fixture', root, entry: 'src/client.tsx', outDir: 'dist' })
  })

  it('does not require Conversation provider edges for a retained contract without a component contribution', async () => {
    const root = await temporaryProject()
    await writeFile(
      resolve(root, 'src/client.tsx'),
      [
        "import { defineClient } from '@becomeopc/dshx/client'",
        "import { defineConversation } from '@becomeopc/dshx/conversation'",
        'const review = defineConversation({',
        "  kind: 'review-job',",
        "  events: { 'review/job-started': { role: 'start', id: () => 'review-job' } },",
        '})',
        'export default defineClient({ name: review.kind })',
        '',
      ].join('\n'),
    )
    await buildClient({ packageId: '@dshx/phase-a-fixture', root, entry: 'src/client.tsx', outDir: 'dist' })
  })

  it('does not require Conversation provider edges for an empty contribution list', async () => {
    const root = await temporaryProject()
    await writeFile(
      resolve(root, 'src/client.tsx'),
      ["import { defineClient } from '@becomeopc/dshx/client'", 'export default defineClient({ conversations: [] })', ''].join('\n'),
    )
    await buildClient({ packageId: '@dshx/phase-a-fixture', root, entry: 'src/client.tsx', outDir: 'dist' })
  })

  it('resolves an indirect defineClient config before requiring Conversation providers', async () => {
    const root = await temporaryProject()
    await writeFile(
      resolve(root, 'src/client.tsx'),
      [
        "import { defineClient } from '@becomeopc/dshx/client'",
        "const config = { name: 'indirect-client', slots: [] }",
        'export default defineClient(config)',
        '',
      ].join('\n'),
    )
    await buildClient({ packageId: '@dshx/phase-a-fixture', root, entry: 'src/client.tsx', outDir: 'dist' })
  })

  it('embeds the same API contract validation in the lazy Client factory', async () => {
    const root = await temporaryProject()
    await writeFile(
      resolve(root, 'src/client.tsx'),
      [
        "import { defineApi, method } from '@becomeopc/dshx/api'",
        "import { defineClient } from '@becomeopc/dshx/client'",
        "const invalid = defineApi({ id: 'invalid/id', version: 1, methods: { get: method() } })",
        'export default defineClient({ api: invalid })',
        '',
      ].join('\n'),
    )
    await buildClient({ packageId: '@dshx/phase-a-fixture', root, entry: 'src/client.tsx', outDir: 'dist' })
    const code = await readFile(resolve(root, 'dist/client.js'), 'utf8')
    const registration: { factory: (requireModule: (id: string) => unknown) => Record<string, unknown> } = {} as never
    vm.runInNewContext(code, {
      window: { __ModuleLoader__: { load: (value: typeof registration) => Object.assign(registration, value) } },
    })
    expect(() => registration.factory(() => ({}))).toThrow('Invalid API id')
    expect(code).not.toContain('@becomeopc/dshx/api')
  })

  it('preserves native named Client exports and Config', async () => {
    const root = await temporaryProject()
    await writeFile(
      resolve(root, 'src/client.tsx'),
      [
        "export const name = 'native-client'",
        "export const inject = ['slots']",
        'export const Config = { marker: true }',
        'export function apply(ctx, config) { ctx.received = config }',
        '',
      ].join('\n'),
    )
    await buildClient({ packageId: '@dshx/phase-a-fixture', logicalName: 'logical-client', root, entry: 'src/client.tsx', outDir: 'dist' })
    const code = await readFile(resolve(root, 'dist/client.js'), 'utf8')
    const registration: { factory: (requireModule: (id: string) => unknown) => Record<string, unknown> } = {} as never
    vm.runInNewContext(code, {
      window: { __ModuleLoader__: { load: (value: typeof registration) => Object.assign(registration, value) } },
    })
    const plugin = registration.factory(() => ({})) as {
      name: string
      inject: string[]
      Config: unknown
      apply: (ctx: { received?: unknown }, config: unknown) => void
    }
    const context: { received?: unknown } = {}
    const config = { enabled: true }
    plugin.apply(context, config)
    expect(plugin.name).toBe('native-client')
    expect(plugin.inject).toEqual(['slots'])
    expect(plugin.Config).toEqual({ marker: true })
    expect(context.received).toBe(config)
  })

  it('rejects a Node builtin in the client graph', async () => {
    const root = await temporaryProject()
    await writeFile(resolve(root, 'src/client.tsx'), "import { readFile } from 'node:fs/promises'\nexport const apply = readFile\n")
    await expect(
      buildClient({
        packageId: '@dshx/phase-a-fixture',
        root,
        entry: 'src/client.tsx',
        outDir: 'dist',
      }),
    ).rejects.toThrow('DSHX1201')
  })

  it('rejects an undeclared DSH value import', async () => {
    const root = await temporaryProject()
    await writeFile(resolve(root, 'src/client.tsx'), "import value from '@deepseek-ai/dsh-client-ui-layout/client'\nexport const apply = value\n")
    await expect(
      buildClient({
        packageId: '@dshx/phase-a-fixture',
        root,
        entry: 'src/client.tsx',
        outDir: 'dist',
      }),
    ).rejects.toThrow('DSHX1202')
  })

  it('preserves an explicitly declared module request as an exact require', async () => {
    const root = await temporaryProject()
    await writeFile(resolve(root, 'src/client.tsx'), "import { marker } from '@deepseek-ai/dsh-client-ui-layout/client'\nexport const apply = marker\n")
    await buildClient({
      packageId: '@dshx/phase-a-fixture',
      root,
      entry: 'src/client.tsx',
      outDir: 'dist',
      external: ['@deepseek-ai/dsh-client-ui-layout/client'],
    })
    const code = await readFile(resolve(root, 'dist/client.js'), 'utf8')
    expect(code).toContain('require("@deepseek-ai/dsh-client-ui-layout/client")')
  })

  it('infers settingsScope from a retained useSettings hook after tree-shaking', async () => {
    const root = await temporaryProject()
    await writeFile(
      resolve(root, 'src/client.tsx'),
      [
        "import { defineClient, defineSlot, useSettings } from '@becomeopc/dshx/client'",
        "import { defineSettings } from '@becomeopc/dshx/settings'",
        "const schema = Object.assign(value => value, { toJSON: () => ({ type: 'object' }) })",
        "const settings = defineSettings({ namespace: 'phase-a', schema })",
        'function Status() {',
        '  const state = useSettings(settings)',
        '  return <div>{String(state.value)}</div>',
        '}',
        "export default defineClient({ slots: [defineSlot('status', { component: Status })] })",
        '',
      ].join('\n'),
    )
    await buildClient({
      packageId: '@dshx/phase-a-fixture',
      root,
      entry: 'src/client.tsx',
      outDir: 'dist',
      inject: ['@deepseek-ai/dsh-client-ui-settings'],
    })
    const code = await readFile(resolve(root, 'dist/client.js'), 'utf8')
    expect(code).toContain('dshx.settings-hook.v1')
    expect(code).toContain('settingsCapability: true')
    expect(code).not.toContain('@becomeopc/dshx/settings')

    const registration: { factory: (requireModule: (id: string) => unknown) => Record<string, unknown> } = {} as never
    vm.runInNewContext(code, {
      window: { __ModuleLoader__: { load: (value: typeof registration) => Object.assign(registration, value) } },
    })
    const plugin = registration.factory(id => {
      if (id === 'react') return {}
      if (id === 'react/jsx-runtime') return {}
      throw new Error(`unexpected require: ${id}`)
    }) as { inject: string[] }
    expect(plugin.inject).toEqual(['slots', 'settingsScope'])
  })

  it('does not infer Settings when an imported hook is removed by tree-shaking', async () => {
    const root = await temporaryProject()
    await writeFile(
      resolve(root, 'src/client.tsx'),
      ["import { defineClient, useSettings } from '@becomeopc/dshx/client'", 'void useSettings', 'export default defineClient({ setup() {} })', ''].join('\n'),
    )
    await buildClient({ packageId: '@dshx/phase-a-fixture', root, entry: 'src/client.tsx', outDir: 'dist' })
    const code = await readFile(resolve(root, 'dist/client.js'), 'utf8')
    expect(code).not.toContain('dshx.settings-hook.v1')
    expect(code).toContain('settingsCapability: false')
  })

  it('fails a retained Settings hook without its official provider package edge', async () => {
    const root = await temporaryProject()
    await writeFile(
      resolve(root, 'src/client.tsx'),
      [
        "import { defineClient, useSettings } from '@becomeopc/dshx/client'",
        "const contract = { namespace: 'phase-a' }",
        'function Status() { useSettings(contract); return null }',
        'export default defineClient({ setup() { return Status() } })',
        '',
      ].join('\n'),
    )
    await expect(buildClient({ packageId: '@dshx/phase-a-fixture', root, entry: 'src/client.tsx', outDir: 'dist' })).rejects.toThrow('DSHX1203')
  })

  it('infers Connection from a retained useApi hook without Client api/apis', async () => {
    const root = await temporaryProject()
    await writeFile(
      resolve(root, 'src/client.tsx'),
      [
        "import { defineApi, method } from '@becomeopc/dshx/api'",
        "import { defineClient, defineSlot, useApi } from '@becomeopc/dshx/client'",
        "const status = defineApi({ id: 'status', version: 1, methods: { get: method() } })",
        'function Status() { useApi(status); return null }',
        "export default defineClient({ slots: [defineSlot('status', { component: Status })] })",
        '',
      ].join('\n'),
    )
    await buildClient({
      packageId: '@dshx/phase-a-fixture',
      root,
      entry: 'src/client.tsx',
      outDir: 'dist',
      inject: ['@deepseek-ai/dsh-client-connection'],
    })
    const code = await readFile(resolve(root, 'dist/client.js'), 'utf8')
    expect(code).toContain('dshx.api-hook.v1')
    expect(code).toContain('apiCapability: true')
    expect(code).not.toContain('@becomeopc/dshx/api')
    expect(code).not.toContain('@becomeopc/dshx/client')

    const registration: { factory: (requireModule: (id: string) => unknown) => Record<string, unknown> } = {} as never
    vm.runInNewContext(code, {
      window: { __ModuleLoader__: { load: (value: typeof registration) => Object.assign(registration, value) } },
    })
    const plugin = registration.factory(() => ({})) as { inject: string[] }
    expect(plugin.inject).toEqual(['slots', 'connection'])
  })

  it('infers Connection when useQuery retains useApi internally', async () => {
    const root = await temporaryProject()
    await writeFile(
      resolve(root, 'src/client.tsx'),
      [
        "import { defineApi, method } from '@becomeopc/dshx/api'",
        "import { defineClient, defineSlot, useQuery } from '@becomeopc/dshx/client'",
        "const status = defineApi({ id: 'status', version: 1, methods: { get: method() } })",
        "function Status() { useQuery(status, 'get'); return null }",
        "export default defineClient({ slots: [defineSlot('status', { component: Status })] })",
        '',
      ].join('\n'),
    )
    await buildClient({
      packageId: '@dshx/phase-a-fixture',
      root,
      entry: 'src/client.tsx',
      outDir: 'dist',
      inject: ['@deepseek-ai/dsh-client-connection'],
    })
    const code = await readFile(resolve(root, 'dist/client.js'), 'utf8')
    expect(code).toContain('dshx.api-hook.v1')
    expect(code).toContain('apiCapability: true')
  })

  it('does not infer API capability from an import removed by tree-shaking', async () => {
    const root = await temporaryProject()
    await writeFile(
      resolve(root, 'src/client.tsx'),
      ["import { defineClient, useApi } from '@becomeopc/dshx/client'", 'void useApi', 'export default defineClient({ setup() {} })', ''].join('\n'),
    )
    await buildClient({ packageId: '@dshx/phase-a-fixture', root, entry: 'src/client.tsx', outDir: 'dist' })
    const code = await readFile(resolve(root, 'dist/client.js'), 'utf8')
    expect(code).not.toContain('dshx.api-hook.v1')
    expect(code).toContain('apiCapability: false')
  })

  it('fails a retained API hook without its official provider package edge', async () => {
    const root = await temporaryProject()
    await writeFile(
      resolve(root, 'src/client.tsx'),
      [
        "import { defineApi, method } from '@becomeopc/dshx/api'",
        "import { defineClient, useApi } from '@becomeopc/dshx/client'",
        "const status = defineApi({ id: 'status', version: 1, methods: { get: method() } })",
        'function Status() { useApi(status); return null }',
        'export default defineClient({ setup() { return Status() } })',
        '',
      ].join('\n'),
    )
    await expect(buildClient({ packageId: '@dshx/phase-a-fixture', root, entry: 'src/client.tsx', outDir: 'dist' })).rejects.toThrow('DSHX1203')
  })

  it('does not remove the Host artifact from the shared output directory', async () => {
    const root = await temporaryProject()
    await mkdir(resolve(root, 'dist'), { recursive: true })
    await writeFile(resolve(root, 'dist/host.js'), 'export function apply() {}\n')
    await buildClient({
      packageId: '@dshx/phase-a-fixture',
      root,
      entry: 'src/client.tsx',
      outDir: 'dist',
      inject: ['@deepseek-ai/dsh-client-connection'],
    })
    expect(await readFile(resolve(root, 'dist/host.js'), 'utf8')).toBe('export function apply() {}\n')
  })

  it('rewrites the client artifact after a watched source change', async () => {
    const root = await temporaryProject()
    const result = await buildClient({
      packageId: '@dshx/phase-a-fixture',
      root,
      entry: 'src/client.tsx',
      outDir: 'dist',
      watch: true,
      inject: ['@deepseek-ai/dsh-client-connection'],
    })
    if (!('on' in result) || !('close' in result)) throw new Error('watch build did not return a watcher')
    const events: string[] = []
    result.on('event', event => {
      events.push(event.code)
    })

    const waitForArtifact = async (predicate: (code: string) => boolean): Promise<string> => {
      const deadline = Date.now() + 10_000
      while (Date.now() < deadline) {
        try {
          const code = await readFile(resolve(root, 'dist/client.js'), 'utf8')
          if (predicate(code)) return code
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
        }
        await new Promise(resolveTimer => setTimeout(resolveTimer, 20))
      }
      throw new Error(`timed out waiting for watched Client artifact; events: ${events.join(', ')}`)
    }

    try {
      const first = await waitForArtifact(code => code.includes('Build. Ship. Observe.'))
      const sourcePath = resolve(root, 'src/client.tsx')
      const source = await readFile(sourcePath, 'utf8')
      await writeFile(sourcePath, source.replace('Build. Ship. Observe.', 'Build. Ship. Observe. Rebuilt'))
      const second = await waitForArtifact(code => code.includes('Build. Ship. Observe. Rebuilt'))
      expect(first).not.toBe(second)
    } finally {
      await result.close()
    }
  })
})
