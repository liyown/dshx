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
  const targets = []
  const visitTarget = value => {
    if (typeof value === 'string') {
      if (value.startsWith('./')) targets.push(value)
      return
    }
    if (value === null || typeof value !== 'object' || Array.isArray(value)) return
    for (const nested of Object.values(value)) visitTarget(nested)
  }
  visitTarget(manifest.exports)
  visitTarget(manifest.main)
  visitTarget(manifest.types)
  visitTarget(manifest.bin)
  for (const target of new Set(targets)) {
    const packedTarget = `package/${target.replace(/^\.\//, '')}`
    if (!files.has(packedTarget)) throw new Error(`${archive} declares missing package target ${target}`)
  }
  return { path, version: manifest.version, manifest }
}

function publicRequests(name, exportsField) {
  if (typeof exportsField === 'string') return [name]
  if (exportsField === null || typeof exportsField !== 'object' || Array.isArray(exportsField)) return []
  return Object.entries(exportsField)
    .filter(([, value]) => value !== null && (typeof value === 'string' || typeof value === 'object'))
    .map(([subpath]) => (subpath === '.' ? name : `${name}/${subpath.replace(/^\.\//, '')}`))
}

function containsPrivateDshxImport(code) {
  return /(?:\bfrom\s*|\bimport\s*(?:\(\s*)?|\brequire\s*\(\s*)["']@becomeopc\/dshx\//.test(code)
}

async function verifyTypeConsumers(install) {
  const source = [
    "import { defineConfig } from '@becomeopc/dshx'",
    "import { defineHost } from '@becomeopc/dshx/host'",
    "import { defineClient } from '@becomeopc/dshx/client'",
    "import { defineApi, method } from '@becomeopc/dshx/api'",
    "import { defineSettings } from '@becomeopc/dshx/settings'",
    "import { defineConversation } from '@becomeopc/dshx/experimental/conversation'",
    "import { buildClient } from '@becomeopc/dshx/tooling'",
    'void [defineConfig, defineHost, defineClient, defineApi, method, defineSettings, defineConversation, buildClient]',
    '',
  ].join('\n')
  await writeFile(join(install, 'consumer.ts'), source)
  for (const [name, options] of [
    ['nodenext', { module: 'NodeNext', moduleResolution: 'NodeNext' }],
    ['bundler', { module: 'ESNext', moduleResolution: 'Bundler' }],
  ]) {
    await writeFile(
      join(install, `tsconfig.${name}.json`),
      `${JSON.stringify({ compilerOptions: { ...options, target: 'ESNext', lib: ['ESNext', 'DOM'], strict: true, noEmit: true, skipLibCheck: true }, files: ['consumer.ts'] }, null, 2)}\n`,
    )
    await run(join(workspace, 'node_modules/.bin/tsc'), ['-p', `tsconfig.${name}.json`], { cwd: install })
  }
}

async function verifyRemovedSubpaths(install) {
  const removed = ['@becomeopc/dshx/compiler', '@becomeopc/dshx/compat', '@becomeopc/dshx/cli', '@becomeopc/dshx/conversation']
  const source = `
for (const request of ${JSON.stringify(removed)}) {
  try { await import(request); throw new Error(request + ' unexpectedly resolved') }
  catch (error) {
    if (error instanceof Error && error.message.endsWith(' unexpectedly resolved')) throw error
    if (!['ERR_PACKAGE_PATH_NOT_EXPORTED', 'ERR_MODULE_NOT_FOUND'].includes(error?.code)) throw error
  }
}
`
  await run(process.execPath, ['--input-type=module', '--eval', source], { cwd: install })
}

async function verifyCreatorMatrix(root, install, packed) {
  const dshx = packed.find(item => item.spec.name === '@becomeopc/dshx')
  if (!packed.some(item => item.spec.name === 'create-dshx') || dshx === undefined) {
    throw new Error('Creator matrix requires packed Core and Creator archives')
  }
  const binary = join(install, 'node_modules', '.bin', `create-dshx${process.platform === 'win32' ? '.cmd' : ''}`)
  const matrixRoot = join(root, 'creator-matrix')
  const packRoot = join(root, 'creator-packs')
  await mkdir(matrixRoot)
  await mkdir(packRoot)
  const projects = []
  for (const template of ['starter', 'showcase']) {
    for (const style of ['css-modules', 'tailwind', 'none']) {
      const name = `smoke-${template}-${style}`
      await run(binary, [name, '--cwd', matrixRoot, '--template', template, '--style', style, '--no-install'], { cwd: install })
      const project = join(matrixRoot, name)
      const manifestFile = join(project, 'package.json')
      const manifest = JSON.parse(await readFile(manifestFile, 'utf8'))
      manifest.devDependencies['@becomeopc/dshx'] = `file:${dshx.path}`
      await writeFile(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`)
      projects.push({ name, project, style })
    }
  }
  await writeFile(join(matrixRoot, 'pnpm-workspace.yaml'), "packages:\n  - 'smoke-*'\n")
  await run('pnpm', ['install', '--no-frozen-lockfile'], { cwd: matrixRoot })
  for (const { name, project, style } of projects) {
    await run('pnpm', ['exec', 'tsc', '-p', 'tsconfig.json', '--noEmit'], { cwd: project })
    await run('pnpm', ['run', 'check'], { cwd: project })
    await run('pnpm', ['run', 'build'], { cwd: project })
    const [host, client] = await Promise.all([readFile(join(project, 'dist/index.js'), 'utf8'), readFile(join(project, 'dist/client.js'), 'utf8')])
    if (containsPrivateDshxImport(host)) throw new Error(`${name} retained a private DSHX Host runtime import`)
    if (containsPrivateDshxImport(client)) throw new Error(`${name} retained a private DSHX Client runtime import`)
    if (style === 'tailwind' && !client.includes('data-plugin-css')) throw new Error(`${name} did not materialize owned Tailwind CSS`)
    await run('pnpm', ['pack', '--pack-destination', packRoot], { cwd: project })
  }
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
    const dshx = packed.find(item => item.spec.name === '@becomeopc/dshx')
    const peerPackages =
      dshx === undefined
        ? []
        : Object.entries(dshx.manifest.peerDependencies ?? {}).map(([name, range]) => `${name}@${dshx.manifest.devDependencies?.[name] ?? range}`)
    await run('npm', ['install', '--ignore-scripts', '@types/node@22.19.20', '@types/react@18.3.31', ...packed.map(item => item.path), ...peerPackages], {
      cwd: install,
    })
    for (const item of packed) {
      const manifestFile = join(install, 'node_modules', ...item.spec.name.split('/'), 'package.json')
      const manifest = JSON.parse(await readFile(manifestFile, 'utf8'))
      if (typeof manifest.bin?.[item.spec.bin] !== 'string') throw new Error(`${item.spec.bin} is missing from the installed package manifest`)
      const binary = join(install, 'node_modules', '.bin', `${item.spec.bin}${process.platform === 'win32' ? '.cmd' : ''}`)
      const help = await run(binary, ['--help'], { cwd: install })
      if (help.stdout.trim() === '') throw new Error(`${item.spec.bin} --help produced no output`)
      const version = await run(binary, ['--version'], { cwd: install })
      if (version.stdout.trim() !== item.version) throw new Error(`${item.spec.bin} --version returned ${version.stdout.trim()} instead of ${item.version}`)

      await run(join(workspace, 'node_modules/.bin/publint'), ['run', item.path], { cwd: workspace })
      await run(join(workspace, 'node_modules/.bin/attw'), [item.path, '--profile', 'esm-only', '--no-emoji', '--no-color'], { cwd: workspace })
    }
    const requests = packed.flatMap(item => publicRequests(item.spec.name, item.manifest.exports))
    await run(process.execPath, ['--input-type=module', '--eval', `await Promise.all(${JSON.stringify(requests)}.map(request => import(request)))`], {
      cwd: install,
    })
    await verifyTypeConsumers(install)
    await verifyRemovedSubpaths(install)
    await verifyCreatorMatrix(root, install, packed)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}

await main()
