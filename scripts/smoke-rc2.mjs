#!/usr/bin/env node

import { access, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const workspace = resolve(fileURLToPath(new URL('..', import.meta.url)))
const rc2 = '0.1.1-rc.2'
const timeoutMs = 120_000

function commandLabel(command, args) {
  return [command, ...args].join(' ')
}

function run(command, args, options = {}) {
  return new Promise((resolveResult, rejectResult) => {
    const child = spawn(command, args, {
      cwd: options.cwd ?? workspace,
      env: { ...process.env, ...(options.env ?? {}) },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    let settled = false
    const timer = setTimeout(() => {
      child.kill('SIGTERM')
      const error = new Error(`Timed out after ${timeoutMs}ms: ${commandLabel(command, args)}`)
      error.cause = { stdout, stderr }
      if (!settled) {
        settled = true
        rejectResult(error)
      }
    }, options.timeoutMs ?? timeoutMs)
    child.stdout.on('data', chunk => { stdout += chunk.toString() })
    child.stderr.on('data', chunk => { stderr += chunk.toString() })
    child.once('error', error => {
      clearTimeout(timer)
      if (!settled) {
        settled = true
        rejectResult(Object.assign(error, { cause: { stdout, stderr } }))
      }
    })
    child.once('close', (code, signal) => {
      clearTimeout(timer)
      if (settled) return
      settled = true
      resolveResult({ command, args, code, signal, stdout, stderr })
    })
  })
}

async function expectSuccess(command, args, options = {}) {
  const result = await run(command, args, options)
  if (result.code !== 0) {
    throw new Error(`${commandLabel(command, args)} failed with ${result.code ?? result.signal}\n${result.stderr}\n${result.stdout}`)
  }
  return result
}

async function expectFailure(command, args, code, options = {}) {
  const result = await run(command, args, options)
  if (result.code === 0) throw new Error(`${commandLabel(command, args)} unexpectedly succeeded`)
  if (code !== undefined && !result.stdout.includes(code) && !result.stderr.includes(code)) {
    throw new Error(`${commandLabel(command, args)} failed without ${code}\n${result.stderr}\n${result.stdout}`)
  }
  return result
}

async function packageJson(root) {
  return JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))
}

async function writePackageJson(root, value) {
  await writeFile(join(root, 'package.json'), `${JSON.stringify(value, null, 2)}\n`)
}

function setDependency(manifest, name, version) {
  manifest.devDependencies ??= {}
  manifest.devDependencies[name] = version
}

async function configureRc2(root, dshxTarball) {
  const manifest = await packageJson(root)
  setDependency(manifest, '@becomeopc/dshx', `file:${dshxTarball}`)
  for (const name of [
    '@deepseek-ai/dsh',
    '@deepseek-ai/dsh-cordis-host-runner',
    '@deepseek-ai/dsh-tool-cordis',
    '@deepseek-ai/dsh-tools',
    '@deepseek-ai/dsh-client-ui-slots',
    '@deepseek-ai/dsh-client-ui-sidebar',
  ]) setDependency(manifest, name, rc2)
  manifest.peerDependencies ??= {}
  manifest.peerDependencies['@deepseek-ai/dsh-tools'] = rc2
  await writePackageJson(root, manifest)
  await expectSuccess('pnpm', ['install', '--no-frozen-lockfile'], { cwd: root })
  const version = await expectSuccess('pnpm', ['exec', 'dsh', '--version'], { cwd: root })
  if (version.stdout.trim() !== rc2) throw new Error(`Expected DSH ${rc2}, got ${version.stdout.trim()}`)
}

async function createProject(parent, name, dshxTarball) {
  await expectSuccess('node', [join(workspace, 'packages/create-dshx/dist/cli.js'), name, '--cwd', parent, '--no-install', '--yes'])
  const root = join(parent, name)
  await configureRc2(root, dshxTarball)
  return root
}

async function removeClient(root) {
  const manifest = await packageJson(root)
  delete manifest.dsh.client
  if (manifest.exports && typeof manifest.exports === 'object') delete manifest.exports['./client']
  await writePackageJson(root, manifest)
  await rm(join(root, 'src/client.tsx'), { force: true })
  await rm(join(root, 'src/Status.module.css'), { force: true })
  await rm(join(root, 'src/css-modules.d.ts'), { force: true })
}

async function removeHost(root) {
  const manifest = await packageJson(root)
  await writePackageJson(root, manifest)
  await writeFile(join(root, 'dshx.config.ts'), `import { defineConfig } from '@becomeopc/dshx/config'\n\nexport default defineConfig({ profile: 'web', host: false })\n`)
  await rm(join(root, 'src/host.ts'), { force: true })
}

async function makeNativeHost(root) {
  await writeFile(join(root, 'src/host.ts'), `export const name = 'native-plugin'\n\nexport function apply() {\n  // Native Host boundary smoke fixture.\n}\n`)
}

async function jsonCommand(root, env, args) {
  const result = await expectSuccess('pnpm', ['exec', 'dshx', ...args, '--json'], { cwd: root, env })
  try { return JSON.parse(result.stdout) } catch (error) {
    error.cause = { stdout: result.stdout, stderr: result.stderr }
    throw error
  }
}

function summarizeInspect(value) {
  return {
    target: value.target,
    source: value.source,
    itemCount: Array.isArray(value.items) ? value.items.length : -1,
    diagnostics: Array.isArray(value.diagnostics) ? value.diagnostics.map(item => item.code) : [],
  }
}

async function startDev(root, env) {
  const child = spawn('pnpm', ['exec', 'dshx', 'dev'], {
    cwd: root,
    env: { ...process.env, ...env },
    stdio: ['pipe', 'pipe', 'pipe'],
  })
  let stdout = ''
  let stderr = ''
  let ready = false
  let exited = false
  let resolveReady
  let rejectReady
  const readyPromise = new Promise((resolveResult, rejectResult) => { resolveReady = resolveResult; rejectReady = rejectResult })
  const timer = setTimeout(() => rejectReady(new Error(`dshx dev did not start\n${stdout}\n${stderr}`)), timeoutMs)
  child.stdout.on('data', chunk => {
    stdout += chunk.toString()
    if (stdout.includes('Dev session started')) { ready = true; clearTimeout(timer); resolveReady() }
  })
  child.stderr.on('data', chunk => { stderr += chunk.toString() })
  child.once('error', error => { clearTimeout(timer); rejectReady(error) })
  child.once('close', (code, signal) => {
    exited = true
    if (!ready) { clearTimeout(timer); rejectReady(new Error(`dshx dev exited before ready: ${code ?? signal}\n${stdout}\n${stderr}`)) }
  })
  await readyPromise
  await new Promise(resolveResult => setTimeout(resolveResult, 750))
  return {
    child,
    output: () => ({ stdout, stderr }),
    close: () => new Promise(resolveResult => {
      if (exited) { resolveResult(); return }
      const timer = setTimeout(() => { child.kill('SIGKILL'); resolveResult() }, 10_000)
      child.once('close', () => { clearTimeout(timer); resolveResult() })
      child.kill('SIGTERM')
    }),
  }
}

async function packDshx(destination) {
  await expectSuccess('pnpm', ['--filter', '@becomeopc/dshx', 'pack', '--pack-destination', destination])
  const files = (await import('node:fs/promises')).readdir(destination)
  const names = await files
  const file = names.find(name => name.includes('dshx-') && name.endsWith('.tgz'))
  if (file === undefined) throw new Error('pnpm pack did not produce a dshx tarball')
  return join(destination, file)
}

async function main() {
  await access(join(workspace, 'packages/dshx/dist/cli/bin.js'))
  await access(join(workspace, 'packages/create-dshx/dist/cli.js'))
  const root = await mkdtemp(join(tmpdir(), 'dshx-rc2-matrix-'))
  const dshHome = join(root, 'dsh-home')
  const tarballDir = join(root, 'tarballs')
  await (await import('node:fs/promises')).mkdir(tarballDir, { recursive: true })
  const dshxTarball = await packDshx(tarballDir)
  const projects = {}
  try {
    projects.fullA = await createProject(root, 'plugin-full-a', dshxTarball)
    projects.fullB = await createProject(root, 'plugin-full-b', dshxTarball)
    projects.hostOnly = await createProject(root, 'plugin-host-only', dshxTarball)
    await removeClient(projects.hostOnly)
    projects.clientOnly = await createProject(root, 'plugin-client-only', dshxTarball)
    await removeHost(projects.clientOnly)
    projects.native = await createProject(root, 'plugin-native', dshxTarball)
    await makeNativeHost(projects.native)

    for (const [name, project] of Object.entries(projects)) {
      await expectSuccess('pnpm', ['exec', 'dshx', 'build'], { cwd: project, env: { DSH_HOME: join(dshHome, name) } })
      await expectFailure('pnpm', ['exec', 'dshx', 'check', '--json'], 'DSHX4305', { cwd: project, env: { DSH_HOME: join(dshHome, name) } })
    }

    await expectFailure('pnpm', ['exec', 'dshx', 'add', 'tool', '--name', 'native.status'], 'DSHX6204', { cwd: projects.native, env: { DSH_HOME: join(dshHome, 'native') } })
    await expectFailure('pnpm', ['exec', 'dshx', 'add', 'tool', '--name', 'disabled.status'], 'DSHX6203', { cwd: projects.clientOnly, env: { DSH_HOME: join(dshHome, 'clientOnly') } })

    const hostDev = await startDev(projects.hostOnly, { DSH_HOME: join(dshHome, 'host-only') })
    try {
      const check = await jsonCommand(projects.hostOnly, { DSH_HOME: join(dshHome, 'host-only') }, ['check'])
      if (check.diagnostics.some(item => item.severity === 'error')) throw new Error('Host-only check failed after dev link')
      await expectFailure('pnpm', ['exec', 'dshx', 'inspect', 'services', '--json'], 'DSHX3201', { cwd: projects.hostOnly, env: { DSH_HOME: join(dshHome, 'host-only') } })
      await expectFailure('pnpm', ['exec', 'dshx', 'add', 'ui', '--slot', 'sidebar.footer.action', '--provider', '@deepseek-ai/dsh-client-ui-sidebar', '--dry-run', '--json'], 'DSHX6102', { cwd: projects.hostOnly, env: { DSH_HOME: join(dshHome, 'host-only') } })
      await expectSuccess('pnpm', ['exec', 'dshx', 'add', 'tool', '--name', 'host.status'], { cwd: projects.hostOnly, env: { DSH_HOME: join(dshHome, 'host-only') } })
      await expectSuccess('pnpm', ['exec', 'dshx', 'add', 'hook', '--event', 'session.created'], { cwd: projects.hostOnly, env: { DSH_HOME: join(dshHome, 'host-only') } })
      await expectSuccess('pnpm', ['exec', 'dshx', 'build'], { cwd: projects.hostOnly, env: { DSH_HOME: join(dshHome, 'host-only') } })
    } finally {
      await hostDev.close()
    }

    const clientDev = await startDev(projects.clientOnly, { DSH_HOME: join(dshHome, 'client-only') })
    try {
      const check = await jsonCommand(projects.clientOnly, { DSH_HOME: join(dshHome, 'client-only') }, ['check'])
      if (check.diagnostics.some(item => item.severity === 'error')) throw new Error('Client-only check failed after dev link')
      await expectFailure('pnpm', ['exec', 'dshx', 'inspect', 'services', '--json'], 'DSHX3201', { cwd: projects.clientOnly, env: { DSH_HOME: join(dshHome, 'client-only') } })
    } finally {
      await clientDev.close()
    }

    for (const name of ['plugin-full-b', 'plugin-host-only', 'plugin-client-only', 'plugin-native']) {
      await expectSuccess('pnpm', ['exec', 'dsh', 'plugin', '--profile', 'web', 'add', projects[name]], { cwd: projects.fullA, env: { DSH_HOME: join(dshHome, 'multi') } })
    }
    const fullDev = await startDev(projects.fullA, { DSH_HOME: join(dshHome, 'multi') })
    try {
      const check = await jsonCommand(projects.fullA, { DSH_HOME: join(dshHome, 'multi') }, ['check'])
      if (check.diagnostics.some(item => item.severity === 'error')) throw new Error('Full plugin check failed after dev link')
      const slots = await jsonCommand(projects.fullA, { DSH_HOME: join(dshHome, 'multi') }, ['inspect', 'slots'])
      const exact = await jsonCommand(projects.fullA, { DSH_HOME: join(dshHome, 'multi') }, ['inspect', 'slots', '--root', 'sidebar.footer.action'])
      const services = await jsonCommand(projects.fullA, { DSH_HOME: join(dshHome, 'multi') }, ['inspect', 'services'])
      const events = await jsonCommand(projects.fullA, { DSH_HOME: join(dshHome, 'multi') }, ['inspect', 'events'])
      console.log(JSON.stringify({
        rc2,
        projects: Object.fromEntries(Object.entries(projects).map(([name, project]) => [name, project])),
        inspect: [slots, exact, services, events].map(summarizeInspect),
        profile: 'linked',
        bridge: 'running',
      }, null, 2))
    } finally {
      await fullDev.close()
    }
    console.log(JSON.stringify({ cleanup: 'verified', dshHome }, null, 2))
  } finally {
    if (process.env.DSHX_KEEP_SMOKE !== '1') await rm(root, { recursive: true, force: true })
    else console.error(`Kept rc.2 smoke root at ${root}`)
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error))
  process.exitCode = 1
})
