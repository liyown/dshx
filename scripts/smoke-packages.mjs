import { execFile } from 'node:child_process'
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

const exec = promisify(execFile)
const workspace = resolve(fileURLToPath(new URL('..', import.meta.url)))
const packages = [
  { name: '@becomeopc/dshx', directory: 'packages/dshx', bin: 'dshx' },
  { name: 'create-dshx', directory: 'packages/create-dshx', bin: 'create-dshx' },
  { name: '@becomeopc/dshx-hub-cli', directory: 'packages/framework-hub-cli', bin: 'dshx-hub' },
]

async function run(command, args, options = {}) {
  try {
    return await exec(command, args, { cwd: workspace, maxBuffer: 10 * 1024 * 1024, ...options })
  } catch (error) {
    const stdout = typeof error?.stdout === 'string' ? error.stdout : ''
    const stderr = typeof error?.stderr === 'string' ? error.stderr : ''
    throw new Error(`${command} ${args.join(' ')} failed\n${stdout}${stderr}`, { cause: error })
  }
}

async function pack(spec, destination) {
  const before = new Set(await readdir(destination))
  await run('pnpm', ['--filter', spec.name, 'pack', '--pack-destination', destination])
  const archive = (await readdir(destination)).find(file => !before.has(file) && file.endsWith('.tgz'))
  if (archive === undefined) throw new Error(`${spec.name} did not produce a package archive`)
  const path = join(destination, archive)
  const { stdout } = await run('tar', ['-tzf', path])
  const files = new Set(stdout.trim().split('\n'))
  const manifest = JSON.parse(await readFile(join(workspace, spec.directory, 'package.json'), 'utf8'))
  const binPath = manifest.bin?.[spec.bin]
  for (const required of ['package/README.md', 'package/LICENSE', `package/${binPath.replace(/^\.\//, '')}`]) {
    if (!files.has(required)) throw new Error(`${archive} is missing ${required}`)
  }
  return { path, version: manifest.version }
}

async function main() {
  const root = await mkdtemp(join(tmpdir(), 'dshx-package-smoke-'))
  const archives = join(root, 'archives')
  const install = join(root, 'install')
  await mkdir(archives)
  await mkdir(install)
  try {
    const packed = []
    for (const spec of packages) packed.push({ spec, ...(await pack(spec, archives)) })
    await writeFile(join(install, 'package.json'), '{"name":"dshx-package-smoke","private":true}\n')
    await run('npm', ['install', '--ignore-scripts', '--legacy-peer-deps', ...packed.map(item => item.path)], { cwd: install })
    for (const item of packed) {
      const manifestFile = join(install, 'node_modules', ...item.spec.name.split('/'), 'package.json')
      const manifest = JSON.parse(await readFile(manifestFile, 'utf8'))
      if (typeof manifest.bin?.[item.spec.bin] !== 'string') throw new Error(`${item.spec.bin} is missing from the installed package manifest`)
      const binary = join(install, 'node_modules', '.bin', `${item.spec.bin}${process.platform === 'win32' ? '.cmd' : ''}`)
      const help = await run(binary, ['--help'], { cwd: install })
      if (help.stdout.trim() === '') throw new Error(`${item.spec.bin} --help produced no output`)
      const version = await run(binary, ['--version'], { cwd: install })
      if (version.stdout.trim() !== item.version) throw new Error(`${item.spec.bin} --version returned ${version.stdout.trim()} instead of ${item.version}`)
    }
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}

await main()
