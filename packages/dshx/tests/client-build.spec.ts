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
    expect(map.sourcesContent?.some(source => source?.includes('DSHX Phase A') === true)).toBe(true)

    let registration: { id: string; factory: (requireModule: (id: string) => unknown) => Record<string, unknown> } | undefined
    const styles: Array<{ dataset: Record<string, string>; textContent: string }> = []
    const document = {
      querySelector: () => null,
      createElement: () => ({ dataset: {}, textContent: '' }),
      head: { appendChild: (style: { dataset: Record<string, string>; textContent: string }) => styles.push(style) },
    }
    vm.runInNewContext(code, {
      document,
      window: { __ModuleLoader__: { load: (value: typeof registration) => { registration = value } } },
    })
    expect(registration?.id).toBe('@dshx/phase-a-fixture')
    expect(styles).toHaveLength(0)

    const plugin = registration?.factory((id) => {
      if (id === 'react/jsx-runtime') {
        return { jsx: (type: unknown, props: unknown) => ({ type, props }) }
      }
      throw new Error(`unexpected require: ${id}`)
    })
    expect(styles).toHaveLength(1)
    expect(styles[0]?.dataset.plugin).toBe('@dshx/phase-a-fixture')
    expect(styles[0]?.dataset.pluginCss).toContain('src/Status.module.css')
    expect(styles[0]?.textContent).toContain('color:#087f5b')
    expect(plugin?.inject).toEqual(['slots'])

    const element = (plugin?.StatusButton as () => { props: { className: string; children: string } })()
    expect(element.props.children).toBe('DSHX Phase A')
    expect(element.props.className).toMatch(/_status$/)
  })

  it('rejects a Node builtin in the client graph', async () => {
    const root = await temporaryProject()
    await writeFile(resolve(root, 'src/client.tsx'), "import { readFile } from 'node:fs/promises'\nexport const apply = readFile\n")
    await expect(buildClient({
      packageId: '@dshx/phase-a-fixture',
      root,
      entry: 'src/client.tsx',
      outDir: 'dist',
    })).rejects.toThrow('DSHX1201')
  })

  it('rejects an undeclared DSH value import', async () => {
    const root = await temporaryProject()
    await writeFile(resolve(root, 'src/client.tsx'), "import value from '@deepseek-ai/dsh-client-ui-layout/client'\nexport const apply = value\n")
    await expect(buildClient({
      packageId: '@dshx/phase-a-fixture',
      root,
      entry: 'src/client.tsx',
      outDir: 'dist',
    })).rejects.toThrow('DSHX1202')
  })

  it('preserves an explicitly declared module request as an exact require', async () => {
    const root = await temporaryProject()
    await writeFile(
      resolve(root, 'src/client.tsx'),
      "import { marker } from '@deepseek-ai/dsh-client-ui-layout/client'\nexport const apply = marker\n",
    )
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

  it('does not remove the Host artifact from the shared output directory', async () => {
    const root = await temporaryProject()
    await mkdir(resolve(root, 'dist'), { recursive: true })
    await writeFile(resolve(root, 'dist/host.js'), 'export function apply() {}\n')
    await buildClient({
      packageId: '@dshx/phase-a-fixture',
      root,
      entry: 'src/client.tsx',
      outDir: 'dist',
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
    })
    if (!('on' in result) || !('close' in result)) throw new Error('watch build did not return a watcher')
    const events: string[] = []
    result.on('event', (event) => { events.push(event.code) })

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
      const first = await waitForArtifact(code => code.includes('DSHX Phase A'))
      const sourcePath = resolve(root, 'src/client.tsx')
      const source = await readFile(sourcePath, 'utf8')
      await writeFile(sourcePath, source.replace('DSHX Phase A', 'DSHX Phase A rebuilt'))
      const second = await waitForArtifact(code => code.includes('DSHX Phase A rebuilt'))
      expect(first).not.toBe(second)
    } finally {
      await result.close()
    }
  })
})
