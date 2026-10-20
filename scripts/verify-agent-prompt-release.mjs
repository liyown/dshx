import { execFile } from 'node:child_process'
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

const exec = promisify(execFile)
const workspace = resolve(fileURLToPath(new URL('..', import.meta.url)))
const metadata = JSON.parse(await readFile(resolve(workspace, 'apps/framework-hub/src/lib/generated/agent-prompt-meta.json'), 'utf8'))
const packageName = '@becomeopc/dshx-hub-cli'
const version = metadata.cliVersion
if (typeof version !== 'string' || version === '') throw new Error('The Hub prompt has no pinned CLI version.')

const temporary = await mkdtemp(join(tmpdir(), 'dshx-prompt-release-'))
try {
  const { stdout: publishedVersion } = await exec('npm', ['view', `${packageName}@${version}`, 'version'], { cwd: workspace, timeout: 60_000 })
  if (publishedVersion.trim() !== version) throw new Error(`Published ${packageName}@${version} returned ${publishedVersion.trim()}.`)

  await exec('npm', ['pack', `${packageName}@${version}`, '--pack-destination', temporary], { cwd: workspace, timeout: 120_000, maxBuffer: 10 * 1024 * 1024 })
  const archive = (await readdir(temporary)).find(file => file.endsWith('.tgz'))
  if (!archive) throw new Error('npm pack did not produce an archive.')
  const archivePath = join(temporary, archive)
  const [{ stdout: listing }, { stdout: registry }] = await Promise.all([
    exec('tar', ['-tzf', archivePath], { maxBuffer: 10 * 1024 * 1024 }),
    exec('tar', ['-xOf', archivePath, 'package/dist/command-registry.js'], {
      maxBuffer: 10 * 1024 * 1024,
    }),
  ])
  const files = new Set(listing.trim().split('\n'))
  if (!files.has('package/dist/index.js')) throw new Error(`${packageName}@${version} is missing its executable.`)
  if (!registry.includes('"ops bundle"')) throw new Error(`Published ${packageName}@${version} does not expose ops bundle.`)
  if (registry.includes('"ops prompt"')) throw new Error(`Published ${packageName}@${version} still exposes the administrator-only ops prompt command.`)
  for (const forbidden of ['package/dist/agent-prompt.md', 'package/dist/ops-prompt.json']) {
    if (files.has(forbidden)) throw new Error(`Published ${packageName}@${version} must not contain the administrator-only prompt file ${forbidden}.`)
  }
  console.log(`Verified ${packageName}@${version}: the public CLI exposes ops bundle and contains no administrator-only prompt files.`)
} catch (error) {
  console.error(`Agent prompt release check failed: ${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
} finally {
  await rm(temporary, { recursive: true, force: true })
}
