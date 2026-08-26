import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { ResolvedDshxConfig } from '../src/config/types.js'
import { checkMigrationDiagnostics } from '../src/project/migrations.js'

const temporaryDirectories: string[] = []

async function project(
  source: string,
  configSource = "import { defineConfig } from '@becomeopc/dshx'\nexport default defineConfig({})\n",
): Promise<ResolvedDshxConfig> {
  const root = await mkdtemp(resolve(tmpdir(), 'dshx-migration-'))
  temporaryDirectories.push(root)
  await mkdir(resolve(root, 'src'), { recursive: true })
  await writeFile(resolve(root, 'src/plugin.tsx'), source)
  await writeFile(resolve(root, 'dshx.config.ts'), configSource)
  await writeFile(resolve(root, 'package.json'), JSON.stringify({ name: '@test/migration' }))
  return {
    root,
    packageFile: resolve(root, 'package.json'),
    configFile: resolve(root, 'dshx.config.ts'),
    configDependencies: [],
    packageId: '@test/migration',
    name: '@test/migration',
    outDir: resolve(root, 'dist'),
    profile: 'web',
    dev: { hostRestart: 'manual' },
    build: { sourcemap: true, declarations: true },
    compatibility: { allowUnsupported: false },
    manifest: { name: '@test/migration' },
  }
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map(directory => rm(directory, { recursive: true, force: true })))
})

describe('0.1.2 migration diagnostics', () => {
  it('allows the browser-safe root exports and namespace imports', async () => {
    const config = await project(
      [
        "import * as dshx from '@becomeopc/dshx'",
        "import { defineConfig, type DshxConfig } from '@becomeopc/dshx'",
        'const typed: DshxConfig = {}',
        'export default defineConfig({ ...typed, name: String(dshx) })',
        '',
      ].join('\n'),
    )
    await expect(checkMigrationDiagnostics(config)).resolves.toEqual([])
  })

  it('reports each removed authoring form with a precise replacement', async () => {
    const config = await project(
      [
        "import { defineHost } from '@becomeopc/dshx/host'",
        "import { defineClient, defineSlot, useQuery } from '@becomeopc/dshx/client'",
        "import { defineConversationNode } from '@becomeopc/dshx/conversation'",
        'defineHost({ api: [] })',
        'defineClient({ apis: [], conversationNodes: [] })',
        "defineSlot('conversation.chat.node', { component() {} })",
        'defineConversationNode({})',
        'void useQuery',
        '',
      ].join('\n'),
      "export default { host: 'src/host.ts', client: 'src/client.tsx' }\n",
    )
    const diagnostics = await checkMigrationDiagnostics(config)
    expect(diagnostics.map(item => item.message)).toEqual(
      expect.arrayContaining([
        expect.stringContaining('useQuery was renamed'),
        expect.stringContaining('defineConversationNode()'),
        expect.stringContaining('defineHost({ api })'),
        expect.stringContaining('defineClient({ apis })'),
        expect.stringContaining('conversationNodes'),
        expect.stringContaining('conversation.chat.node'),
        expect.stringContaining('config.host'),
        expect.stringContaining('config.client'),
      ]),
    )
    expect(diagnostics.every(item => item.code === 'DSHX4501' && item.hint.length > 0)).toBe(true)
  })
})
