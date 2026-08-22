import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { resolveDshxConfig } from '../src/config/index.js'
import { applyManifestRepairPlan, createManifestRepairPlan, rollbackManifestRepairPlan } from '../src/project/index.js'

const roots: string[] = []

async function project(): Promise<string> {
  const root = await mkdtemp(resolve(tmpdir(), 'dshx-repair-'))
  roots.push(root)
  await writeFile(resolve(root, 'package.json'), JSON.stringify({ name: 'repair-demo', type: 'module', exports: {} }, null, 2))
  await writeFile(resolve(root, 'cordis.patch.yml'), '- insert: []\n')
  await writeFile(resolve(root, 'src-client.tsx'), 'export default {}\n')
  await writeFile(resolve(root, 'dshx.config.ts'), 'export default { client: "src-client.tsx" }\n')
  return root
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

describe('deterministic manifest repair plan', () => {
  it('plans only adapter-derived missing metadata and exposes a diff', async () => {
    const root = await project()
    const resolved = await resolveDshxConfig({ cwd: root })
    const plan = await createManifestRepairPlan(resolved)
    expect(plan.changedFiles).toEqual([resolved.packageFile])
    expect(plan.diff).toContain('--- ')
    const manifest = JSON.parse(plan.files[0]!.after) as Record<string, unknown>
    expect(manifest.exports).toMatchObject({ '.': './dist/index.js', './client': './dist/client.js', './cordis.patch.yml': './cordis.patch.yml', './package.json': './package.json' })
    expect(manifest.dsh).toMatchObject({ bundle: { patch: './cordis.patch.yml' }, client: { platform: 'web', inject: [], external: [], immediately: false } })
  })

  it('does not overwrite conflicting fields and leaves correct projects unchanged', async () => {
    const root = await project()
    await writeFile(resolve(root, 'package.json'), JSON.stringify({ name: 'repair-demo', type: 'module', exports: { '.': './custom.js' }, dsh: { bundle: { patch: './other.yml' } } }, null, 2))
    const resolved = await resolveDshxConfig({ cwd: root })
    const plan = await createManifestRepairPlan(resolved)
    expect(plan.diff).toContain('custom.js')
    expect(plan.diagnostics).toContainEqual(expect.objectContaining({ code: 'DSHX4142', severity: 'warning' }))
  })

  it('applies a reviewed plan without changing source files', async () => {
    const root = await project()
    const resolved = await resolveDshxConfig({ cwd: root })
    const before = await readFile(resolve(root, 'src-client.tsx'), 'utf8')
    const plan = await createManifestRepairPlan(resolved)
    await applyManifestRepairPlan(plan)
    expect(await readFile(resolve(root, 'src-client.tsx'), 'utf8')).toBe(before)
    expect(JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'))).toHaveProperty('dsh.client')
  })

  it('restores the original manifest when a reviewed plan is rolled back', async () => {
    const root = await project()
    const resolved = await resolveDshxConfig({ cwd: root })
    const packageFile = resolved.packageFile
    const before = await readFile(packageFile, 'utf8')
    const plan = await createManifestRepairPlan(resolved)
    await applyManifestRepairPlan(plan)
    expect(await readFile(packageFile, 'utf8')).not.toBe(before)
    await rollbackManifestRepairPlan(plan)
    expect(await readFile(packageFile, 'utf8')).toBe(before)
  })
})
