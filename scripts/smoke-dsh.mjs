#!/usr/bin/env node

import { access, appendFile, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { apiChannel } from '../packages/dshx/dist/api/runtime.js'
import { classifyCompatibility, DEFAULT_COMPATIBILITY } from '../packages/dshx/dist/compat/index.js'

const workspace = resolve(fileURLToPath(new URL('..', import.meta.url)))
const timeoutMs = 120_000

function parseDshVersion(argv, env) {
  let cliVersion
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    if (argument === '--') continue
    if (argument === '--help' || argument === '-h') {
      console.log('Usage: pnpm smoke:dsh -- --version <dsh-version>\n\nDSH_VERSION may be used instead. Without either, the latest verified boundary is used.')
      return undefined
    }
    if (argument === '--version') {
      const value = argv[index + 1]
      if (value === undefined || value.startsWith('-')) throw new Error('--version requires a semantic version')
      cliVersion = value
      index += 1
      continue
    }
    if (argument.startsWith('--version=')) {
      cliVersion = argument.slice('--version='.length)
      continue
    }
    throw new Error(`Unknown smoke argument ${JSON.stringify(argument)}`)
  }
  const version = cliVersion ?? env.DSH_VERSION ?? DEFAULT_COMPATIBILITY.verified.latest
  const resolution = classifyCompatibility(version)
  if (resolution === undefined) {
    throw new Error(`DSH ${version} has no compatibility-generation adapter in this DSHX build`)
  }
  return { version, resolution }
}

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
    child.stdout.on('data', chunk => {
      stdout += chunk.toString()
    })
    child.stderr.on('data', chunk => {
      stderr += chunk.toString()
    })
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

async function expectFailureOneOf(command, args, codes, options = {}) {
  const result = await run(command, args, options)
  if (result.code === 0) throw new Error(`${commandLabel(command, args)} unexpectedly succeeded`)
  if (!codes.some(code => result.stdout.includes(code) || result.stderr.includes(code))) {
    throw new Error(`${commandLabel(command, args)} failed without one of ${codes.join(', ')}\n${result.stderr}\n${result.stdout}`)
  }
  return result
}

async function inspectMaybeAvailable(root, env, args) {
  const result = await run('pnpm', ['exec', 'dshx', ...args, '--json'], { cwd: root, env })
  let value
  try {
    value = JSON.parse(result.stdout)
  } catch (error) {
    error.cause = { stdout: result.stdout, stderr: result.stderr }
    throw error
  }
  const diagnostics = Array.isArray(value.diagnostics) ? value.diagnostics : []
  const allowedUnavailable = diagnostics.some(item => item && (item.code === 'DSHX3201' || item.code === 'DSHX3202'))
  if (result.code !== 0 && !allowedUnavailable) {
    throw new Error(`Inspect ${args.join(' ')} failed unexpectedly\n${result.stderr}\n${result.stdout}`)
  }
  return value
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

async function configureDsh(root, dshxTarball, dshVersion) {
  const compatibility = classifyCompatibility(dshVersion)?.compatibility
  if (compatibility === undefined) throw new Error(`No adapter can configure DSH ${dshVersion}`)
  const manifest = await packageJson(root)
  setDependency(manifest, '@becomeopc/dshx', `file:${dshxTarball}`)
  for (const name of [
    '@deepseek-ai/dsh',
    '@deepseek-ai/dsh-commands',
    '@deepseek-ai/dsh-cordis-host-runner',
    '@deepseek-ai/dsh-tool-cordis',
    '@deepseek-ai/dsh-tools',
    '@deepseek-ai/dsh-client-ui-slots',
    '@deepseek-ai/dsh-client-ui-sidebar',
  ])
    setDependency(manifest, name, dshVersion)
  manifest.peerDependencies ??= {}
  manifest.peerDependencies['@deepseek-ai/dsh'] = compatibility.dshRange
  manifest.peerDependencies['@deepseek-ai/dsh-tools'] = dshVersion
  await writePackageJson(root, manifest)
  // Reuse the local store when available, but allow a clean CI runner to resolve the
  // selected generation boundary from npm instead of assuming pre-populated metadata.
  await expectSuccess('pnpm', ['install', '--prefer-offline', '--no-frozen-lockfile'], { cwd: root })
  const version = await expectSuccess('pnpm', ['exec', 'dsh', '--version'], { cwd: root })
  if (version.stdout.trim() !== dshVersion) throw new Error(`Expected DSH ${dshVersion}, got ${version.stdout.trim()}`)
}

async function createProject(parent, name, dshxTarball, dshVersion) {
  await expectSuccess('node', [join(workspace, 'packages/create-dshx/dist/cli.js'), name, '--cwd', parent, '--no-install', '--yes'])
  const root = join(parent, name)
  await configureDsh(root, dshxTarball, dshVersion)
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
  await writeFile(
    join(root, 'dshx.config.ts'),
    `import { defineConfig } from '@becomeopc/dshx/config'\n\nexport default defineConfig({ profile: 'web', host: false })\n`,
  )
  await rm(join(root, 'src/host.ts'), { force: true })
}

async function makeNativeHost(root) {
  await writeFile(join(root, 'src/host.ts'), `export const name = 'native-plugin'\n\nexport function apply() {\n  // Native Host boundary smoke fixture.\n}\n`)
}

async function useAutomaticHostRestart(root) {
  const file = join(root, 'dshx.config.ts')
  const source = await readFile(file, 'utf8')
  await writeFile(file, source.replace("hostRestart: 'manual'", "hostRestart: 'auto'"))
}

async function callDshxApi(webUrl, packageId, method, version, input) {
  const rpcId = randomUUID()
  const response = await fetch(new URL(`${apiChannel(packageId, 'status')}/${method}`, webUrl), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      type: 'client-request',
      rpcId,
      method,
      payload: { version, input },
    }),
  })
  if (!response.ok) throw new Error(`DSHX API ${method} returned HTTP ${response.status}`)
  const body = await response.json()
  if (body.rpcId !== rpcId) throw new Error(`DSHX API ${method} returned mismatched rpcId ${String(body.rpcId)}`)
  return body.result
}

async function callOfficialApi(webUrl, method, payload) {
  const rpcId = randomUUID()
  const response = await fetch(new URL(`/api/${method}`, webUrl), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ type: 'client-request', rpcId, method, payload }),
  })
  if (!response.ok) throw new Error(`Official API ${method} returned HTTP ${response.status}`)
  const body = await response.json()
  if (body.rpcId !== rpcId) throw new Error(`Official API ${method} returned mismatched rpcId ${String(body.rpcId)}`)
  return body.result
}

async function callConnectionRpc(webUrl, endpoint, payload) {
  const rpcId = randomUUID()
  const response = await fetch(new URL(`/api/${endpoint}`, webUrl), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ type: 'client-request', rpcId, method: endpoint, payload }),
  })
  if (!response.ok) throw new Error(`Connection RPC ${endpoint} returned HTTP ${response.status}`)
  const body = await response.json()
  if (body.rpcId !== rpcId) throw new Error(`Connection RPC ${endpoint} returned mismatched rpcId ${String(body.rpcId)}`)
  return body.result
}

async function verifyGeneratedCommand(webUrl, projectRoot) {
  const created = await callOfficialApi(webUrl, 'session.create', { cwd: projectRoot })
  const sessionId = created.ok ? created.value?.sessionId : undefined
  if (typeof sessionId !== 'string') throw new Error(`Could not create Command smoke session: ${JSON.stringify(created)}`)
  const listed = await callConnectionRpc(webUrl, 'commands/list', {
    args: { agentId: sessionId },
  })
  if (!listed.ok || !listed.value?.some?.(item => item?.name === 'dshx-status')) {
    throw new Error(`Generated Command was not visible through the official registry: ${JSON.stringify(listed)}`)
  }
  const executed = await callConnectionRpc(webUrl, 'commands/execute', {
    args: { agentId: sessionId, line: '/dshx-status', images: [] },
  })
  if (!executed.ok || executed.value?.result?.kind !== 'success' || executed.value?.result?.text !== 'Implement /dshx-status') {
    throw new Error(`Generated Command did not execute through the official parser: ${JSON.stringify(executed)}`)
  }
}

async function jsonCommand(root, env, args) {
  const result = await expectSuccess('pnpm', ['exec', 'dshx', ...args, '--json'], { cwd: root, env })
  try {
    return JSON.parse(result.stdout)
  } catch (error) {
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
  let sessionReady = false
  let dshReady = false
  let webUrl
  let exited = false
  let resolveReady
  let rejectReady
  const readyPromise = new Promise((resolveResult, rejectResult) => {
    resolveReady = resolveResult
    rejectReady = rejectResult
  })
  const maybeReady = () => {
    if (sessionReady && dshReady) {
      clearTimeout(timer)
      resolveReady()
    }
  }
  const timer = setTimeout(() => rejectReady(new Error(`dshx dev did not start\n${stdout}\n${stderr}`)), timeoutMs)
  child.stdout.on('data', chunk => {
    stdout += chunk.toString()
    if (stdout.includes('Dev session started')) sessionReady = true
    const urls = [...stdout.matchAll(/dsh web:\s+(https?:\/\/\S+)/g)]
    if (urls.length > 0) {
      webUrl = urls.at(-1)?.[1]
      dshReady = true
    }
    maybeReady()
  })
  child.stderr.on('data', chunk => {
    stderr += chunk.toString()
  })
  child.once('error', error => {
    clearTimeout(timer)
    rejectReady(error)
  })
  child.once('close', (code, signal) => {
    exited = true
    if (!sessionReady || !dshReady) {
      clearTimeout(timer)
      rejectReady(new Error(`dshx dev exited before ready: ${code ?? signal}\n${stdout}\n${stderr}`))
    }
  })
  await readyPromise
  if (webUrl === undefined) throw new Error(`dshx dev did not report a Web URL\n${stdout}\n${stderr}`)
  await new Promise(resolveResult => setTimeout(resolveResult, 750))
  return {
    child,
    webUrl: () => webUrl,
    output: () => ({ stdout, stderr }),
    waitForOutput: async text => {
      const stdoutStart = stdout.length
      const stderrStart = stderr.length
      const deadline = Date.now() + timeoutMs
      while (Date.now() < deadline) {
        if (stdout.slice(stdoutStart).includes(text) || stderr.slice(stderrStart).includes(text)) return
        if (exited) throw new Error(`dshx dev exited before emitting ${text}\n${stdout}\n${stderr}`)
        await new Promise(resolveResult => setTimeout(resolveResult, 100))
      }
      throw new Error(`dshx dev did not emit ${text}\n${stdout}\n${stderr}`)
    },
    close: () =>
      new Promise(resolveResult => {
        if (exited) {
          resolveResult()
          return
        }
        const timer = setTimeout(() => {
          child.kill('SIGKILL')
          resolveResult()
        }, 10_000)
        child.once('close', () => {
          clearTimeout(timer)
          resolveResult()
        })
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
  const selected = parseDshVersion(process.argv.slice(2), process.env)
  if (selected === undefined) return
  const { version: dshVersion, resolution } = selected
  await access(join(workspace, 'packages/dshx/dist/cli/bin.js'))
  await access(join(workspace, 'packages/create-dshx/dist/cli.js'))
  const root = await mkdtemp(join(tmpdir(), `dshx-dsh-${dshVersion.replaceAll(/[^0-9A-Za-z.-]/g, '-')}-`))
  const dshHome = join(root, 'dsh-home')
  const tarballDir = join(root, 'tarballs')
  await (await import('node:fs/promises')).mkdir(tarballDir, { recursive: true })
  const dshxTarball = await packDshx(tarballDir)
  const projects = {}
  try {
    projects.fullA = await createProject(root, 'plugin-full-a', dshxTarball, dshVersion)
    await useAutomaticHostRestart(projects.fullA)
    await expectSuccess('pnpm', ['exec', 'dshx', 'add', 'command', '--name', 'dshx-status', '--description', 'Return DSHX status.'], { cwd: projects.fullA })
    projects.fullB = await createProject(root, 'plugin-full-b', dshxTarball, dshVersion)
    projects.hostOnly = await createProject(root, 'plugin-host-only', dshxTarball, dshVersion)
    await removeClient(projects.hostOnly)
    projects.clientOnly = await createProject(root, 'plugin-client-only', dshxTarball, dshVersion)
    await removeHost(projects.clientOnly)
    projects.native = await createProject(root, 'plugin-native', dshxTarball, dshVersion)
    await makeNativeHost(projects.native)

    for (const [name, project] of Object.entries(projects)) {
      await expectSuccess('pnpm', ['exec', 'dshx', 'build'], { cwd: project, env: { DSH_HOME: join(dshHome, name) } })
      await expectFailure('pnpm', ['exec', 'dshx', 'check', '--json'], 'DSHX4305', { cwd: project, env: { DSH_HOME: join(dshHome, name) } })
    }

    await expectFailure('pnpm', ['exec', 'dshx', 'add', 'tool', '--name', 'native.status'], 'DSHX6204', {
      cwd: projects.native,
      env: { DSH_HOME: join(dshHome, 'native') },
    })
    await expectFailure('pnpm', ['exec', 'dshx', 'add', 'tool', '--name', 'disabled.status'], 'DSHX6203', {
      cwd: projects.clientOnly,
      env: { DSH_HOME: join(dshHome, 'clientOnly') },
    })

    const hostDev = await startDev(projects.hostOnly, { DSH_HOME: join(dshHome, 'host-only') })
    try {
      const check = await jsonCommand(projects.hostOnly, { DSH_HOME: join(dshHome, 'host-only') }, ['check'])
      if (check.diagnostics.some(item => item.severity === 'error')) throw new Error('Host-only check failed after dev link')
      const hostServices = await jsonCommand(projects.hostOnly, { DSH_HOME: join(dshHome, 'host-only') }, ['inspect', 'services'])
      const hostEvents = await jsonCommand(projects.hostOnly, { DSH_HOME: join(dshHome, 'host-only') }, ['inspect', 'events'])
      if (hostServices.source !== 'runtime' || hostEvents.source !== 'runtime') throw new Error('Host-only Inspect did not return runtime data')
      await expectFailureOneOf(
        'pnpm',
        ['exec', 'dshx', 'add', 'ui', '--slot', 'sidebar.footer.action', '--provider', '@deepseek-ai/dsh-client-ui-sidebar', '--dry-run', '--json'],
        ['DSHX6102', 'DSHX3202'],
        { cwd: projects.hostOnly, env: { DSH_HOME: join(dshHome, 'host-only') } },
      )
      await expectSuccess('pnpm', ['exec', 'dshx', 'add', 'tool', '--name', 'host.status'], {
        cwd: projects.hostOnly,
        env: { DSH_HOME: join(dshHome, 'host-only') },
      })
      await expectSuccess('pnpm', ['exec', 'dshx', 'add', 'hook', '--event', 'session.created'], {
        cwd: projects.hostOnly,
        env: { DSH_HOME: join(dshHome, 'host-only') },
      })
      await expectSuccess('pnpm', ['exec', 'dshx', 'build'], { cwd: projects.hostOnly, env: { DSH_HOME: join(dshHome, 'host-only') } })
    } finally {
      await hostDev.close()
    }

    const clientDev = await startDev(projects.clientOnly, { DSH_HOME: join(dshHome, 'client-only') })
    try {
      const check = await jsonCommand(projects.clientOnly, { DSH_HOME: join(dshHome, 'client-only') }, ['check'])
      if (check.diagnostics.some(item => item.severity === 'error')) throw new Error('Client-only check failed after dev link')
      await expectFailure('pnpm', ['exec', 'dshx', 'inspect', 'services', '--json'], 'DSHX3201', {
        cwd: projects.clientOnly,
        env: { DSH_HOME: join(dshHome, 'client-only') },
      })
    } finally {
      await clientDev.close()
    }

    for (const name of ['fullB', 'hostOnly', 'clientOnly', 'native']) {
      await expectSuccess('pnpm', ['exec', 'dsh', 'plugin', '--profile', 'web', 'add', projects[name]], {
        cwd: projects.fullA,
        env: { DSH_HOME: join(dshHome, 'multi') },
      })
    }
    const fullDev = await startDev(projects.fullA, { DSH_HOME: join(dshHome, 'multi') })
    try {
      const initialApi = await callDshxApi(fullDev.webUrl(), 'plugin-full-a', 'get', 1)
      if (!initialApi.ok || initialApi.value?.version !== 1 || initialApi.value?.output?.project !== 'plugin-full-a') {
        throw new Error(`Full plugin API did not return its Host status: ${JSON.stringify(initialApi)}`)
      }
      const refreshedApi = await callDshxApi(fullDev.webUrl(), 'plugin-full-a', 'refresh', 1, { force: true })
      if (!refreshedApi.ok || refreshedApi.value?.output?.project !== 'plugin-full-a (refreshed)') {
        throw new Error(`Full plugin API refresh failed: ${JSON.stringify(refreshedApi)}`)
      }
      const incompatibleApi = await callDshxApi(fullDev.webUrl(), 'plugin-full-a', 'get', 2)
      if (incompatibleApi.ok || incompatibleApi.error?.code !== 'DSHX6401') {
        throw new Error(`Full plugin API accepted a mismatched version: ${JSON.stringify(incompatibleApi)}`)
      }
      await verifyGeneratedCommand(fullDev.webUrl(), projects.fullA)
      const hmr = fullDev.waitForOutput('client rebuilt')
      await appendFile(join(projects.fullA, 'src/client.tsx'), `\n// HMR smoke ${Date.now()}\n`)
      await hmr
      const restarted = fullDev.waitForOutput('dsh web:')
      await appendFile(join(projects.fullA, 'src/host.ts'), `\n// Host lifecycle smoke ${Date.now()}\n`)
      await restarted
      await new Promise(resolveResult => setTimeout(resolveResult, 750))
      const afterRestart = await callDshxApi(fullDev.webUrl(), 'plugin-full-a', 'get', 1)
      if (!afterRestart.ok || afterRestart.value?.output?.requestCount !== 1) {
        throw new Error(`Full plugin API did not recover after Host restart: ${JSON.stringify(afterRestart)}`)
      }
      await verifyGeneratedCommand(fullDev.webUrl(), projects.fullA)
      const check = await jsonCommand(projects.fullA, { DSH_HOME: join(dshHome, 'multi') }, ['check'])
      if (check.diagnostics.some(item => item.severity === 'error')) throw new Error('Full plugin check failed after dev link')
      const inspectEnv = { DSH_HOME: join(dshHome, 'multi') }
      const slots = await inspectMaybeAvailable(projects.fullA, inspectEnv, ['inspect', 'slots'])
      const exact = await inspectMaybeAvailable(projects.fullA, inspectEnv, ['inspect', 'slots', '--root', 'sidebar.footer.action'])
      const services = await jsonCommand(projects.fullA, { DSH_HOME: join(dshHome, 'multi') }, ['inspect', 'services'])
      const events = await jsonCommand(projects.fullA, { DSH_HOME: join(dshHome, 'multi') }, ['inspect', 'events'])
      console.log(
        JSON.stringify(
          {
            dsh: {
              version: dshVersion,
              generation: resolution.compatibility.protocolGeneration,
              adapterId: resolution.compatibility.id,
              support: resolution.support,
            },
            projects: Object.fromEntries(Object.entries(projects).map(([name, project]) => [name, project])),
            inspect: [slots, exact, services, events].map(summarizeInspect),
            api: { unary: 'verified', versionMismatch: 'verified', hostRestart: 'verified' },
            command: { scaffold: 'verified', parser: 'verified', hostRestart: 'verified' },
            profile: 'linked',
            bridge: 'running',
          },
          null,
          2,
        ),
      )
    } finally {
      await fullDev.close()
    }
    console.log(JSON.stringify({ cleanup: 'verified', dshHome }, null, 2))
  } finally {
    if (process.env.DSHX_KEEP_SMOKE !== '1') await rm(root, { recursive: true, force: true })
    else console.error(`Kept DSH ${dshVersion} smoke root at ${root}`)
  }
}

main().catch(error => {
  console.error(error instanceof Error ? (error.stack ?? error.message) : String(error))
  process.exitCode = 1
})
