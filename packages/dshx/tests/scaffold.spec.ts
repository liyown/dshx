import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createUiScaffold } from '../src/scaffold/ui.js'
import type { ResolvedDshxConfig } from '../src/config/types.js'
import type { InspectResult } from '../src/inspect/types.js'
import type { InspectOptions, InspectTarget } from '../src/inspect/types.js'

const compatibility = {
  id: 'protocol-1',
  protocolGeneration: 'protocol-1',
  lifecycle: 'active' as const,
  version: '0.1.0-rc.8',
  dshRange: '>=0.1.0-rc.8 <0.2.0-0',
  verified: { minimum: '0.1.0-rc.8', latest: '0.1.0-rc.8' },
  verifiedVersions: ['0.1.0-rc.8'],
  nodeRange: '^22.19.0 || >=24.0.0',
  profile: { listCommand: 'plugin-list-json' as const, addCommand: 'plugin-add' as const },
  inspect: { targets: ['slots', 'tools'] as const, provider: 'unavailable' as const },
  client: {
    platformModules: [],
    preloadedExternals: [],
    manifest: { platform: 'web' as const, moduleRequestsField: 'external' as const, packageEdgesField: 'inject' as const },
  },
}

function project(root: string, clientEntry: string | undefined, manifest: Record<string, unknown>): ResolvedDshxConfig {
  return {
    root,
    packageFile: resolve(root, 'package.json'),
    configDependencies: [],
    packageId: '@demo/plugin',
    name: '@demo/plugin',
    ...(clientEntry === undefined ? {} : { clientEntry }),
    hostEntry: resolve(root, 'src/host.ts'),
    outDir: resolve(root, 'dist'),
    profile: 'web',
    dev: { hostRestart: 'manual' },
    build: { sourcemap: true },
    compatibility: { allowUnsupported: false },
    manifest,
  }
}

function inspectResult(): InspectResult {
  return {
    profile: 'web',
    target: 'slots',
    source: 'runtime',
    items: [
      {
        name: 'sidebar.footer.action',
        provider: '@demo/sidebar',
        kind: 'list',
        scope: 'global',
        metadata: {
          catalog: {
            registration: [
              { name: 'id', required: true, type: 'string' },
              { name: 'order', required: false, type: 'number' },
            ],
            replaceRisk: 'none',
          },
          occupants: [],
        },
      },
    ],
    diagnostics: [],
  }
}

async function setup(full: boolean): Promise<{ root: string; project: ResolvedDshxConfig; cleanup: () => Promise<void> }> {
  const root = await mkdtemp(join(tmpdir(), 'dshx-add-ui-'))
  await writeFile(
    resolve(root, 'package.json'),
    JSON.stringify(
      full
        ? {
            name: '@demo/plugin',
            type: 'module',
            exports: { '.': './dist/index.js', './client': './dist/client.js' },
            dsh: { bundle: { patch: './cordis.patch.yml' }, client: { platform: 'web', inject: [], external: [], immediately: false } },
          }
        : { name: '@demo/plugin', type: 'module', exports: { '.': './dist/index.js' }, dsh: { bundle: { patch: './cordis.patch.yml' } } },
      null,
      2,
    ),
  )
  await writeFile(resolve(root, 'cordis.patch.yml'), '- insert:\n    - id: demo\n')
  await mkdir(resolve(root, 'src'), { recursive: true })
  await writeFile(resolve(root, 'src/host.ts'), 'export const name = "demo"\nexport function apply() {}\n')
  await writeFile(resolve(root, 'node_modules-marker'), '')
  if (full) {
    await writeFile(resolve(root, 'src/client.tsx'), 'import { defineClient } from "@becomeopc/dshx/client"\n\nexport default defineClient({ setup() {} })\n')
  }
  const manifest = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8')) as Record<string, unknown>
  return {
    root,
    project: project(root, full ? resolve(root, 'src/client.tsx') : undefined, manifest),
    cleanup: () => rm(root, { recursive: true, force: true }),
  }
}

describe('add ui scaffold', () => {
  it('adds a contribution to an existing DSHX Client without modifying package metadata', async () => {
    const value = await setup(true)
    try {
      const result = await createUiScaffold(
        { project: value.project, slot: 'sidebar.footer.action' },
        {
          compatibility,
          inspectComposition: async () => inspectResult(),
          resolveProvider: async () => true,
          checkManifest: async () => [],
        },
      )
      expect(result.diagnostics).toEqual([])
      expect(result.generatedFiles).toHaveLength(1)
      expect(await readFile(resolve(value.root, 'src/slots/sidebar.footer.action.tsx'), 'utf8')).toContain('defineSlot("sidebar.footer.action"')
      const client = await readFile(resolve(value.root, 'src/client.tsx'), 'utf8')
      expect(client).toContain('from "./slots/sidebar.footer.action.js"')
      expect(client).toContain('slots: [sidebar_footer_actionContribution]')
      expect(JSON.parse(await readFile(resolve(value.root, 'package.json'), 'utf8'))).toEqual(value.project.manifest)
    } finally {
      await value.cleanup()
    }
  })

  it('creates a Client and manifest metadata for a Host-only project', async () => {
    const value = await setup(false)
    try {
      const result = await createUiScaffold(
        { project: value.project, slot: 'sidebar.footer.action' },
        {
          compatibility,
          inspectComposition: async () => inspectResult(),
          resolveProvider: async () => true,
          checkManifest: async () => [],
        },
      )
      expect(result.manifestChanged).toBe(true)
      const manifest = JSON.parse(await readFile(resolve(value.root, 'package.json'), 'utf8')) as Record<string, unknown>
      expect(manifest.exports).toMatchObject({ './client': './dist/client.js' })
      expect(manifest.dsh).toMatchObject({ client: { platform: 'web', inject: ['@demo/sidebar'], external: [], immediately: false } })
      expect(await readFile(resolve(value.root, 'src/client.tsx'), 'utf8')).toContain('defineClient')
    } finally {
      await value.cleanup()
    }
  })

  it('supports dry-run, refuses existing generated files, and does not write on provider failure', async () => {
    const value = await setup(true)
    try {
      const dry = await createUiScaffold(
        { project: value.project, slot: 'sidebar.footer.action', dryRun: true },
        { compatibility, inspectComposition: async () => inspectResult(), resolveProvider: async () => true, checkManifest: async () => [] },
      )
      expect(dry.diff).toContain('sidebar.footer.action.tsx')
      expect(dry.diff).toContain('@@')
      expect(dry.diff).toContain('-export default defineClient({ setup() {} })')
      await expect(readFile(resolve(value.root, 'src/slots/sidebar.footer.action.tsx'), 'utf8')).rejects.toThrow()
      const failed = await createUiScaffold(
        { project: value.project, slot: 'sidebar.footer.action' },
        { inspectComposition: async () => inspectResult(), resolveProvider: async () => false },
      )
      expect(failed.diagnostics[0]?.code).toBe('DSHX6104')
      const created = await createUiScaffold(
        { project: value.project, slot: 'sidebar.footer.action' },
        { compatibility, inspectComposition: async () => inspectResult(), resolveProvider: async () => true, checkManifest: async () => [] },
      )
      expect(created.diagnostics).toEqual([])
      const repeated = await createUiScaffold(
        { project: value.project, slot: 'sidebar.footer.action' },
        { compatibility, inspectComposition: async () => inspectResult(), resolveProvider: async () => true, checkManifest: async () => [] },
      )
      expect(repeated.diagnostics[0]?.code).toBe('DSHX6109')
    } finally {
      await value.cleanup()
    }
  })

  it('rolls back all files when the post-generation manifest check fails', async () => {
    const value = await setup(false)
    try {
      const before = await readFile(resolve(value.root, 'package.json'), 'utf8')
      const result = await createUiScaffold(
        { project: value.project, slot: 'sidebar.footer.action' },
        {
          compatibility,
          inspectComposition: async () => inspectResult(),
          resolveProvider: async () => true,
          checkManifest: async () => [{ code: 'DSHX4210', severity: 'error', message: 'bad export', file: value.project.packageFile, hint: 'fix' }],
        },
      )
      expect(result.diagnostics[0]?.code).toBe('DSHX6108')
      await expect(readFile(resolve(value.root, 'src/client.tsx'), 'utf8')).rejects.toThrow()
      await expect(readFile(resolve(value.root, 'src/slots/sidebar.footer.action.tsx'), 'utf8')).rejects.toThrow()
      expect(await readFile(resolve(value.root, 'package.json'), 'utf8')).toBe(before)
    } finally {
      await value.cleanup()
    }
  })

  it('rolls back earlier files when an atomic write fails midway', async () => {
    const value = await setup(true)
    try {
      const clientBefore = await readFile(resolve(value.root, 'src/client.tsx'), 'utf8')
      let writes = 0
      const result = await createUiScaffold(
        { project: value.project, slot: 'sidebar.footer.action' },
        {
          compatibility,
          inspectComposition: async () => inspectResult(),
          resolveProvider: async () => true,
          checkManifest: async () => [],
          fs: {
            writeFileAtomic: async (file, data) => {
              writes += 1
              if (writes === 2) throw new Error('injected write failure')
              await writeFile(file, data, 'utf8')
            },
          },
        },
      )
      expect(result.diagnostics[0]?.code).toBe('DSHX6107')
      await expect(readFile(resolve(value.root, 'src/slots/sidebar.footer.action.tsx'), 'utf8')).rejects.toThrow()
      expect(await readFile(resolve(value.root, 'src/client.tsx'), 'utf8')).toBe(clientBefore)
    } finally {
      await value.cleanup()
    }
  })

  it('reports an existing native Client without changing it', async () => {
    const value = await setup(true)
    try {
      await writeFile(resolve(value.root, 'src/client.tsx'), 'export const name = "native"\nexport function apply() {}\n')
      const result = await createUiScaffold(
        { project: value.project, slot: 'sidebar.footer.action' },
        { inspectComposition: async () => inspectResult(), resolveProvider: async () => true },
      )
      expect(result.diagnostics[0]?.code).toBe('DSHX6105')
      expect(await readFile(resolve(value.root, 'src/client.tsx'), 'utf8')).toContain('native')
    } finally {
      await value.cleanup()
    }
  })

  it('performs a second exact query and omits list-only fields for a single Slot', async () => {
    const value = await setup(true)
    try {
      const calls: Array<{ slotRoot?: string }> = []
      const inspectComposition = async (_project: ResolvedDshxConfig, _target: InspectTarget, options?: InspectOptions): Promise<InspectResult> => {
        calls.push(options ?? {})
        return {
          profile: 'web',
          target: 'slots',
          source: 'runtime',
          diagnostics: [],
          items: [
            {
              name: 'sidebar.footer.action',
              provider: '@demo/sidebar',
              kind: 'single',
              scope: 'root',
              ...(options?.slotRoot === undefined ? {} : { metadata: { catalog: { registration: [], replaceRisk: 'none' }, occupants: [] } }),
            },
          ],
        }
      }
      const result = await createUiScaffold(
        { project: value.project, slot: 'sidebar.footer.action' },
        {
          compatibility,
          inspectComposition,
          resolveProvider: async () => true,
          checkManifest: async () => [],
        },
      )
      expect(result.diagnostics).toEqual([])
      expect(calls).toEqual([{}, { slotRoot: 'sidebar.footer.action' }])
      const generated = await readFile(resolve(value.root, 'src/slots/sidebar.footer.action.tsx'), 'utf8')
      expect(generated).not.toContain('id:')
      expect(generated).not.toContain('order:')
    } finally {
      await value.cleanup()
    }
  })

  it('refuses keyed Slots and incomplete exact metadata before writing', async () => {
    const value = await setup(true)
    try {
      const keyed = await createUiScaffold(
        { project: value.project, slot: 'sidebar.footer.action' },
        {
          inspectComposition: async (_project, _target, options): Promise<InspectResult> => ({
            profile: 'web',
            target: 'slots',
            source: 'runtime',
            diagnostics: [],
            items: [
              {
                name: 'sidebar.footer.action',
                provider: '@demo/sidebar',
                kind: options?.slotRoot === undefined ? 'list' : 'keyed',
                scope: 'root',
                ...(options?.slotRoot === undefined
                  ? {}
                  : { metadata: { catalog: { registration: [{ name: 'key', required: true, type: 'string' }], replaceRisk: 'none' } } }),
              },
            ],
          }),
          resolveProvider: async () => true,
        },
      )
      expect(keyed.diagnostics[0]?.code).toBe('DSHX6110')
      await expect(readFile(resolve(value.root, 'src/slots/sidebar.footer.action.tsx'), 'utf8')).rejects.toThrow()
    } finally {
      await value.cleanup()
    }
  })
})
