import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createCommandScaffold } from '../src/scaffold/command.js'
import { createHookScaffold } from '../src/scaffold/hook.js'
import { createToolScaffold } from '../src/scaffold/tool.js'
import type { AddToolDependencies } from '../src/scaffold/tool.js'
import type { ResolvedDshxConfig } from '../src/config/types.js'

/**
 * Tool, Command and Hook run the same pipeline; this suite states that once and
 * gives each kind its own row. Anything that differs belongs in the row.
 */

type KindName = 'tool' | 'command' | 'hook'

interface Kind {
  readonly name: KindName
  readonly key: 'name' | 'event'
  readonly value: string
  readonly invalidValue: string
  /** The module the kind generates by default. */
  readonly file: string
  /** What the generated module must contain. */
  readonly markers: readonly string[]
  /** How the entry must register it. */
  readonly registration: string
  readonly codes: { readonly invalidName: string; readonly native: string; readonly disabled: string; readonly duplicate: string; readonly rollback: string }
}

const kinds: readonly Kind[] = [
  {
    name: 'tool',
    key: 'name',
    value: 'status',
    invalidValue: 'bad name',
    file: 'src/tools/status.ts',
    markers: ["import { defineTool } from '@becomeopc/dshx/host'", 'name: "status"', 'parameters: {}', "schema: { type: 'string' }"],
    registration: 'tools: [statusTool]',
    codes: { invalidName: 'DSHX6201', native: 'DSHX6204', disabled: 'DSHX6203', duplicate: 'DSHX6206', rollback: 'DSHX6208' },
  },
  {
    name: 'command',
    key: 'name',
    value: 'status',
    invalidValue: 'Bad.Name',
    file: 'src/commands/status.ts',
    markers: ["import { defineCommand } from '@becomeopc/dshx/host'", 'name: "status"', "kind: 'success'"],
    registration: 'commands: [statusCommand]',
    codes: { invalidName: 'DSHX6501', native: 'DSHX6504', disabled: 'DSHX6503', duplicate: 'DSHX6506', rollback: 'DSHX6508' },
  },
  {
    name: 'hook',
    key: 'event',
    value: 'agent.ready',
    invalidValue: 'bad event',
    file: 'src/hooks/agent.ready.ts',
    markers: ["import type { Context } from '@becomeopc/dshx/host'", 'ctx.on("agent.ready"', '...args: unknown[]'],
    registration: 'registerAgentReadyHook(ctx)',
    codes: { invalidName: 'DSHX6301', native: 'DSHX6304', disabled: 'DSHX6303', duplicate: 'DSHX6306', rollback: 'DSHX6308' },
  },
]

function project(root: string, hostEntry?: string, configFile?: string): ResolvedDshxConfig {
  return {
    root,
    packageFile: resolve(root, 'package.json'),
    ...(configFile === undefined ? {} : { configFile }),
    configDependencies: [],
    packageId: '@demo/plugin',
    name: '@demo/plugin',
    settingsNamespace: '-demo-plugin',
    ...(hostEntry === undefined ? {} : { hostEntry }),
    outDir: resolve(root, 'dist'),
    profile: 'web',
    dev: { hostRestart: 'manual' },
    build: { sourcemap: true },
    compatibility: { allowUnsupported: false },
    manifest: { name: '@demo/plugin', type: 'module', exports: { '.': './dist/index.js' }, dsh: { bundle: { patch: './cordis.patch.yml' } } },
  }
}

async function setup(host: 'define' | 'native' | 'missing' | 'disabled'): Promise<{ root: string; project: ResolvedDshxConfig; cleanup: () => Promise<void> }> {
  const root = await mkdtemp(join(tmpdir(), 'dshx-add-contribution-'))
  await mkdir(resolve(root, 'src'), { recursive: true })
  await writeFile(
    resolve(root, 'package.json'),
    JSON.stringify({ name: '@demo/plugin', type: 'module', exports: { '.': './dist/index.js' }, dsh: { bundle: { patch: './cordis.patch.yml' } } }),
  )
  await writeFile(resolve(root, 'cordis.patch.yml'), '- insert:\n    - id: demo\n')
  let configFile: string | undefined
  if (host === 'define')
    await writeFile(resolve(root, 'src/host.ts'), "import { defineHost } from '@becomeopc/dshx/host'\n\nexport default defineHost({ setup() {} })\n")
  if (host === 'native') await writeFile(resolve(root, 'src/host.ts'), 'export const name = "demo"\nexport function apply() {}\n')
  if (host === 'disabled') {
    configFile = resolve(root, 'dshx.config.ts')
    await writeFile(configFile, "export default { host: false, client: 'src/client.tsx' }\n")
    await writeFile(resolve(root, 'src/client.tsx'), 'export default {}\n')
  }
  return {
    root,
    project: project(root, host === 'missing' || host === 'disabled' ? undefined : resolve(root, 'src/host.ts'), configFile),
    cleanup: () => rm(root, { recursive: true, force: true }),
  }
}

interface GenerateOptions {
  readonly dryRun?: boolean
  readonly checkManifest?: AddToolDependencies['checkManifest']
}

function generate(kind: Kind, target: ResolvedDshxConfig, value: string, options: GenerateOptions = {}) {
  const dependencies = options.checkManifest === undefined ? {} : { checkManifest: options.checkManifest }
  const dryRun = options.dryRun ?? false
  if (kind.name === 'tool') return createToolScaffold({ project: target, name: value, dryRun }, dependencies)
  if (kind.name === 'command') return createCommandScaffold({ project: target, name: value, dryRun }, dependencies)
  return createHookScaffold({ project: target, event: value, dryRun }, dependencies)
}

describe.each(kinds)('add $name scaffold', kind => {
  it('generates the module and registers it on defineHost', async () => {
    const value = await setup('define')
    try {
      const result = await generate(kind, value.project, kind.value, { checkManifest: async () => [] })
      expect(result.diagnostics).toEqual([])
      const generated = await readFile(resolve(value.root, kind.file), 'utf8')
      for (const marker of kind.markers) expect(generated).toContain(marker)
      const host = await readFile(resolve(value.root, 'src/host.ts'), 'utf8')
      expect(host).toContain(`from "./${kind.file.slice('src/'.length).replace(/\.ts$/, '.js')}"`)
      expect(host).toContain(kind.registration)
    } finally {
      await value.cleanup()
    }
  })

  it('supports dry-run, creates a missing Host, and is idempotent', async () => {
    const value = await setup('missing')
    try {
      const dry = await generate(kind, value.project, kind.value, { dryRun: true, checkManifest: async () => [] })
      expect(dry.diff).toContain(kind.file)
      await expect(readFile(resolve(value.root, 'src/host.ts'), 'utf8')).rejects.toThrow()
      await generate(kind, value.project, kind.value, { checkManifest: async () => [] })
      const repeated = { ...value.project, hostEntry: resolve(value.root, 'src/host.ts') }
      const second = await generate(kind, repeated, kind.value, { checkManifest: async () => [] })
      expect(second.diagnostics[0]?.code).toBe(kind.codes.duplicate)
    } finally {
      await value.cleanup()
    }
  })

  it('rejects invalid values, native Hosts, disabled Hosts, and rolls back checker failures', async () => {
    const value = await setup('define')
    try {
      expect((await generate(kind, value.project, kind.invalidValue)).diagnostics[0]?.code).toBe(kind.codes.invalidName)
      const failed = await generate(kind, value.project, kind.value, {
        checkManifest: async () => [{ code: 'DSHX4210', severity: 'error', message: 'bad', file: value.project.packageFile, hint: 'fix' }],
      })
      expect(failed.diagnostics[0]?.code).toBe(kind.codes.rollback)
      await expect(readFile(resolve(value.root, kind.file), 'utf8')).rejects.toThrow()
    } finally {
      await value.cleanup()
    }
    const native = await setup('native')
    try {
      expect((await generate(kind, native.project, kind.value)).diagnostics[0]?.code).toBe(kind.codes.native)
    } finally {
      await native.cleanup()
    }
    const disabled = await setup('disabled')
    try {
      expect((await generate(kind, disabled.project, kind.value)).diagnostics[0]?.code).toBe(kind.codes.disabled)
    } finally {
      await disabled.cleanup()
    }
  })
})

describe('add hook scaffold', () => {
  it('uses the setup parameter that is already there', async () => {
    const value = await setup('define')
    try {
      await writeFile(
        resolve(value.root, 'src/host.ts'),
        "import { defineHost } from '@becomeopc/dshx/host'\n\nexport default defineHost({ setup(context) { context.services } })\n",
      )
      const result = await createHookScaffold({ project: value.project, event: 'agent.ready' }, { checkManifest: async () => [] })
      expect(result.diagnostics).toEqual([])
      expect(await readFile(resolve(value.root, 'src/host.ts'), 'utf8')).toContain('registerAgentReadyHook(context)')
    } finally {
      await value.cleanup()
    }
  })
})

describe('scaffold architecture', () => {
  it.each(kinds)('routes $name through the generator instead of owning a plan', async kind => {
    const source = await readFile(new URL(`../src/scaffold/${kind.name}.ts`, import.meta.url), 'utf8')
    expect(source).toContain("from './generator.js'")
    expect(source).toContain('scaffoldContribution(')
    expect(source).not.toMatch(/\bapplyFilePlan|\brollbackFilePlan|\brenderFileDiff/)
  })
})
