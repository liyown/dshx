import { access, mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { createServer, type Server } from 'node:http'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { Context } from '@deepseek-ai/cordis'
import { execa } from 'execa'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { MarketplaceHostService } from '../src/host-service.js'

const workspace = resolve(import.meta.dirname, '../../..')
const packageDirectory = resolve(import.meta.dirname, '..')
const dshCli = join(packageDirectory, 'node_modules/.bin', process.platform === 'win32' ? 'dsh.cmd' : 'dsh')

async function waitForFile(path: string, child: ReturnType<typeof execa>): Promise<void> {
  let exit: { readonly stdout: string; readonly stderr: string } | Error | undefined
  void child.then(
    result => {
      exit = {
        stdout: String(result.stdout ?? ''),
        stderr: String(result.stderr ?? ''),
      }
    },
    error => {
      exit = error instanceof Error ? error : new Error(String(error))
    },
  )
  const deadline = Date.now() + 25_000
  while (Date.now() < deadline) {
    if (exit !== undefined) {
      const detail = exit instanceof Error ? exit.message : `${exit.stderr}\n${exit.stdout}`
      throw new Error(`Restarted Profile exited before loading the target bundle.\n${detail}`)
    }
    try {
      await access(path)
      return
    } catch {
      await new Promise(resolveWait => setTimeout(resolveWait, 100))
    }
  }
  throw new Error('Restarted Profile did not load the installed target bundle.')
}

function listen(server: Server): Promise<number> {
  return new Promise((resolveListen, rejectListen) => {
    server.once('error', rejectListen)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (address === null || typeof address === 'string') return rejectListen(new Error('Hub fixture did not bind a TCP port.'))
      resolveListen(address.port)
    })
  })
}

describe('plugin marketplace self-bootstrap smoke', () => {
  let root: string
  let dshHome: string
  let profileDir: string
  let targetTarball: string
  let marketplaceTarball: string
  let marker: string
  let hub: Server | undefined
  let hubBaseUrl: string

  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), 'dshx-marketplace-smoke-'))
    dshHome = join(root, 'dsh-home')
    profileDir = join(dshHome, 'profiles', 'web')
    marker = join(root, 'target-loaded')
    const target = join(root, 'target')
    const packs = join(root, 'packs')
    await Promise.all([mkdir(target, { recursive: true }), mkdir(packs, { recursive: true })])
    await writeFile(
      join(target, 'package.json'),
      JSON.stringify(
        {
          name: '@dshx-smoke/marketplace-target',
          version: '1.0.0',
          type: 'module',
          main: './index.js',
          files: ['index.js', 'cordis.patch.yml'],
          dsh: { bundle: { patch: './cordis.patch.yml' } },
        },
        null,
        2,
      ),
    )
    await writeFile(
      join(target, 'index.js'),
      "import { writeFileSync } from 'node:fs'\nexport const name = 'marketplace-smoke-target'\nexport function apply() { writeFileSync(process.env.DSHX_MARKETPLACE_SMOKE_MARKER, 'loaded\\n') }\n",
    )
    await writeFile(join(target, 'cordis.patch.yml'), '- insert:\n    - id: marketplace-smoke-target\n      name: "@dshx-smoke/marketplace-target"\n')
    await execa('pnpm', ['pack', '--pack-destination', packs], { cwd: target })
    const archive = (await readdir(packs)).find(file => file.endsWith('.tgz'))
    if (archive === undefined) throw new Error('Target fixture did not produce a tarball.')
    targetTarball = join(packs, archive)

    const existingPacks = new Set(await readdir(packs))
    await execa('pnpm', ['pack', '--pack-destination', packs], {
      cwd: packageDirectory,
    })
    const marketplaceArchive = (await readdir(packs)).find(file => file.endsWith('.tgz') && !existingPacks.has(file))
    if (marketplaceArchive === undefined) throw new Error('Marketplace package did not produce a tarball.')
    marketplaceTarball = join(packs, marketplaceArchive)

    await execa(dshCli, ['plugin', '--profile', 'web', 'add', marketplaceTarball], {
      cwd: workspace,
      env: { DSH_HOME: dshHome },
      timeout: 5 * 60_000,
    })
    const initialManifest = JSON.parse(await readFile(join(profileDir, 'package.json'), 'utf8'))
    expect(initialManifest.dsh.profile.bundles).toContain('@becomeopc/dshx-plugin-marketplace')

    hub = createServer((request, response) => {
      response.setHeader('content-type', 'application/json')
      if (request.url?.startsWith('/api/marketplace/plugins/marketplace-smoke-target')) {
        response.end(
          JSON.stringify({
            plugin: {
              slug: 'marketplace-smoke-target',
              name: 'Marketplace smoke target',
              scope: '@dshx-smoke/marketplace-target',
              description: 'A local packed bundle used by the marketplace smoke.',
              version: '1.0.0',
              compat: '>=0.1.0-rc.8 <0.2.0-0',
              category: 'tools',
              badge: 'verified',
              glyph: 'S',
              iconUrl: null,
            },
            installTargets: [
              {
                kind: 'npm',
                spec: targetTarball,
                package_name: '@dshx-smoke/marketplace-target',
                version: '1.0.0',
                integrity: null,
                is_primary: 1,
                status: 'active',
              },
            ],
          }),
        )
        return
      }
      if (request.url?.startsWith('/api/marketplace/plugins')) {
        response.end(
          JSON.stringify({
            categories: [{ slug: 'tools', name: 'Tools' }],
            items: [
              {
                slug: 'marketplace-smoke-target',
                name: 'Marketplace smoke target',
                scope: '@dshx-smoke/marketplace-target',
                description: 'A local packed bundle used by the marketplace smoke.',
                version: '1.0.0',
                compat: '>=0.1.0-rc.8 <0.2.0-0',
                category: 'tools',
                badge: 'verified',
                glyph: 'S',
                iconUrl: null,
              },
            ],
            nextCursor: null,
          }),
        )
        return
      }
      response.statusCode = 404
      response.end('{}')
    })
    hubBaseUrl = `http://127.0.0.1:${await listen(hub)}`
  }, 120_000)

  afterAll(async () => {
    if (hub !== undefined) await new Promise<void>(resolveClose => hub?.close(() => resolveClose()))
    if (root !== undefined) await rm(root, { recursive: true, force: true })
  })

  it('installs through the typed marketplace service and loads after Profile restart', async () => {
    process.env.DSH_HOME = dshHome
    const ctx = { baseUrl: pathToFileURL(profileDir).href } as Context
    const service = new MarketplaceHostService({
      settings: () => ({ hubBaseUrl }),
    })
    const catalog = await service.list({ locale: 'en' }, ctx, new AbortController().signal)
    expect(catalog.items).toHaveLength(1)
    expect(catalog.items[0]).toMatchObject({
      slug: 'marketplace-smoke-target',
      installed: false,
      compatibility: 'compatible',
    })

    await expect(service.install('marketplace-smoke-target', ctx, new AbortController().signal)).resolves.toMatchObject({
      status: 'installed',
      packageName: '@dshx-smoke/marketplace-target',
      restartRequired: true,
    })
    const installedManifest = JSON.parse(await readFile(join(profileDir, 'package.json'), 'utf8'))
    expect(installedManifest.dsh.profile.bundles).toEqual(expect.arrayContaining(['@becomeopc/dshx-plugin-marketplace', '@dshx-smoke/marketplace-target']))

    const restarted = execa(dshCli, ['--profile', 'web', '--no-open', '--port', '0'], {
      cwd: workspace,
      env: { DSH_HOME: dshHome, DSHX_MARKETPLACE_SMOKE_MARKER: marker },
      reject: false,
    })
    try {
      await waitForFile(marker, restarted)
      expect(await readFile(marker, 'utf8')).toBe('loaded\n')
    } finally {
      restarted.kill('SIGTERM')
      await restarted.catch(() => undefined)
    }
  }, 120_000)
})
