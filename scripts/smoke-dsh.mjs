#!/usr/bin/env node

import { access, appendFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { createServer } from 'node:net'
import { fileURLToPath } from 'node:url'
import { apiChannel } from '../packages/dshx/dist/api/runtime.js'
import { classifyCompatibility, DEFAULT_COMPATIBILITY } from '../packages/dshx/dist/compat/index.js'

const workspace = resolve(fileURLToPath(new URL('..', import.meta.url)))
const timeoutMs = 120_000
const playwrightCli = join(workspace, 'node_modules/.bin', `playwright-cli${process.platform === 'win32' ? '.cmd' : ''}`)

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

async function inspectMaybeAvailable(root, env, args) {
  const result = await run('pnpm', ['exec', 'dshx', ...args, '--json'], {
    cwd: root,
    env,
  })
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
  for (const name of Object.keys(manifest.devDependencies ?? {})) {
    if (name === '@deepseek-ai/dsh' || name.startsWith('@deepseek-ai/dsh-')) setDependency(manifest, name, dshVersion)
  }
  for (const name of [
    '@deepseek-ai/dsh',
    '@deepseek-ai/dsh-agent',
    '@deepseek-ai/dsh-client-connection',
    '@deepseek-ai/dsh-commands',
    '@deepseek-ai/dsh-cordis-host-runner',
    '@deepseek-ai/dsh-system-prompt',
    '@deepseek-ai/dsh-settings',
    '@deepseek-ai/dsh-tool-cordis',
    '@deepseek-ai/dsh-tools',
    '@deepseek-ai/dsh-client-ui-slots',
    '@deepseek-ai/dsh-client-ui-sidebar',
    '@deepseek-ai/dsh-client-ui-settings',
    '@deepseek-ai/dsh-client-runtime',
    '@deepseek-ai/dsh-client-ui-conversation',
    '@deepseek-ai/dsh-llm',
  ])
    setDependency(manifest, name, dshVersion)
  manifest.peerDependencies ??= {}
  manifest.peerDependencies['@deepseek-ai/dsh'] = compatibility.dshRange
  manifest.peerDependencies['@deepseek-ai/dsh-tools'] = dshVersion
  await writePackageJson(root, manifest)
  // Reuse the local store when available, but allow a clean CI runner to resolve the
  // selected generation boundary from npm instead of assuming pre-populated metadata.
  await expectSuccess('pnpm', ['install', '--prefer-offline', '--no-frozen-lockfile'], { cwd: root })
  const version = await expectSuccess('pnpm', ['exec', 'dsh', '--version'], {
    cwd: root,
  })
  if (version.stdout.trim() !== dshVersion) throw new Error(`Expected DSH ${dshVersion}, got ${version.stdout.trim()}`)
}

async function createProject(parent, name, dshxTarball, dshVersion, options = {}) {
  await expectSuccess('node', [
    join(workspace, 'packages/create-dshx/dist/cli.js'),
    name,
    '--cwd',
    parent,
    '--no-install',
    '--yes',
    '--template',
    options.template ?? 'starter',
    '--style',
    options.style ?? 'css-modules',
  ])
  const root = join(parent, name)
  await configureDsh(root, dshxTarball, dshVersion)
  return root
}

async function removeClient(root) {
  const manifest = await packageJson(root)
  delete manifest.dsh.client
  if (manifest.exports && typeof manifest.exports === 'object') delete manifest.exports['./client']
  await writePackageJson(root, manifest)
  const configFile = join(root, 'dshx.config.ts')
  const config = await readFile(configFile, 'utf8')
  if (!config.includes("client: { entry: 'src/client.tsx' }")) throw new Error('Generated Client config could not be disabled for Host-only smoke')
  await writeFile(configFile, config.replace("client: { entry: 'src/client.tsx' }", 'client: false'))
  await rm(join(root, 'src/client.tsx'), { force: true })
  await rm(join(root, 'src/Plugin.module.css'), { force: true })
  await rm(join(root, 'src/css-modules.d.ts'), { force: true })
}

async function removeHost(root) {
  const manifest = await packageJson(root)
  await writePackageJson(root, manifest)
  await writeFile(
    join(root, 'dshx.config.ts'),
    `import { defineConfig } from '@becomeopc/dshx'\n\nexport default defineConfig({ profile: 'web', host: false, client: { entry: 'src/client.tsx' } })\n`,
  )
  await rm(join(root, 'src/host.ts'), { force: true })
}

async function makeNativeHost(root) {
  await writeFile(join(root, 'src/host.ts'), `export const name = 'native-plugin'\n\nexport function apply() {\n  // Native Host boundary smoke fixture.\n}\n`)
}

async function useAutomaticHostRestart(root) {
  const file = join(root, 'dshx.config.ts')
  const source = await readFile(file, 'utf8')
  const next = source.includes('hostRestart')
    ? source.replace("hostRestart: 'manual'", "hostRestart: 'auto'")
    : source.replace('export default defineConfig({', "export default defineConfig({\n  dev: { hostRestart: 'auto' },")
  await writeFile(file, next)
}

async function installConversationProbe(root, dshVersion) {
  const manifest = await packageJson(root)
  const client = manifest.dsh?.client
  if (client === undefined || !Array.isArray(client.inject)) throw new Error('Conversation smoke requires a generated Client manifest')
  client.inject = [...new Set([...client.inject, '@deepseek-ai/dsh-client-runtime', '@deepseek-ai/dsh-client-ui-conversation'])]
  manifest.peerDependencies ??= {}
  manifest.peerDependencies['@deepseek-ai/dsh-client-runtime'] = dshVersion
  manifest.peerDependencies['@deepseek-ai/dsh-client-ui-conversation'] = dshVersion
  manifest.peerDependencies['@deepseek-ai/dsh-llm'] = dshVersion
  await writePackageJson(root, manifest)

  const file = join(root, 'src/client.tsx')
  const source = await readFile(file, 'utf8')
  if (!source.includes("import { statusApi } from './api/status.js'")) throw new Error('Conversation smoke could not locate Showcase Client imports')
  if (!source.includes('const runtimeDeck = defineSlot')) throw new Error('Conversation smoke could not locate the Showcase Slot')
  if (!source.includes('slots: [runtimeDeck],')) throw new Error('Conversation smoke could not locate defineClient()')
  const imports = `import type {} from '@deepseek-ai/dsh-commands/types'
import { defineConversation, type ConversationRenderProps } from '@becomeopc/dshx/experimental/conversation'
`
  const contribution = `interface CommandLifecycleState {
  readonly commandId: string
  readonly name: string
  readonly phase: 'running' | 'done'
  readonly startSeq: number
  readonly doneSeq: number | null
  readonly result: 'success' | 'error' | null
}

const commandLifecycle = defineConversation({
  kind: 'dshx-command-lifecycle',
  events: {
    'command/run': {
      role: 'start',
      id: event => event.data.commandId,
      publication: 'immediate',
    },
    'command/done': {
      role: 'update',
      id: event => event.data.commandId,
      publication: 'immediate',
    },
  },
  initial(_context, event): CommandLifecycleState {
    return {
      commandId: event.data.commandId,
      name: event.data.name,
      phase: 'running',
      startSeq: event.seq,
      doneSeq: null,
      result: null,
    }
  },
  reduce(state, _context, event): CommandLifecycleState {
    return {
      ...state,
      phase: 'done',
      doneSeq: event.seq,
      result: event.data.kind,
    }
  },
  project(state, context) {
    return {
      ...state,
      matchCount: context.matches.length,
      location: context.start?.location.kind ?? 'unresolved',
    }
  },
})

function CommandLifecycleNode({ data }: ConversationRenderProps<typeof commandLifecycle>) {
  return (
    <div
      data-dshx-conversation="command-lifecycle"
      data-command-id={data.commandId}
      data-command-name={data.name}
      data-phase={data.phase}
      data-result={data.result ?? ''}
      data-match-count={data.matchCount}
      data-start-seq={data.startSeq}
      data-done-seq={data.doneSeq ?? ''}
      data-location={data.location}
      data-renderer-marker="conversation-v1"
    />
  )
}

const commandLifecycleView = commandLifecycle.render(CommandLifecycleNode)

`
  await writeFile(
    file,
    source
      .replace("import { statusApi } from './api/status.js'", `${imports}import { statusApi } from './api/status.js'`)
      .replace('const runtimeDeck = defineSlot', `${contribution}const runtimeDeck = defineSlot`)
      .replace('  slots: [runtimeDeck],', '  conversations: [commandLifecycleView],\n  slots: [runtimeDeck],'),
  )
}

async function startTailwindBrowser(webUrl, packageId) {
  const session = `dshx-${randomUUID()}`
  const output = join(workspace, 'output/playwright/dsh-smoke')
  const conversationDiagnosticScreenshot = join(output, `${session}-conversation-navigation.png`)
  await mkdir(output, { recursive: true })
  const command = args => expectSuccess(playwrightCli, [`-s=${session}`, ...args], { cwd: output })
  const evaluate = async expression => {
    const result = await command(['--raw', 'eval', expression])
    return JSON.parse(JSON.parse(result.stdout.trim()))
  }
  await command(['open', webUrl])
  // Snapshot before inspecting the page, as required by the browser smoke workflow.
  await command(['snapshot'])
  await command(['run-code', `async (page) => { await page.getByRole('heading', { name: ${JSON.stringify(packageId)} }).waitFor({ timeout: ${timeoutMs} }) }`])
  const dismissOptionalOnboarding = () =>
    command([
      'run-code',
      `async (page) => {
        const findVisibleAction = async (names, waitMs) => {
          const deadline = Date.now() + waitMs
          do {
            for (const name of names) {
              const action = page.getByRole('button', { name, exact: true })
              if (await action.count() > 0 && await action.first().isVisible()) return action.first()
            }
            await page.waitForTimeout(100)
          } while (Date.now() < deadline)
          return undefined
        }
        const dismiss = async (names, waitMs) => {
          const action = await findVisibleAction(names, waitMs)
          if (action === undefined) return false
          const dialog = action.locator('xpath=ancestor::*[@role="dialog"][1]')
          if (await dialog.count() !== 1) {
            throw new Error('Optional onboarding action did not belong to exactly one dialog: ' + names.join('/'))
          }
          await action.click()
          await dialog.waitFor({ state: 'hidden', timeout: 30000 })
          return true
        }
        const welcomed = await dismiss(['继续', 'Continue'], 3000)
        await dismiss(['稍后配置', 'Configure later'], welcomed ? 10000 : 3000)
      }`,
    ])
  await dismissOptionalOnboarding()
  const readStyle = () =>
    evaluate(`() => {
      const heading = [...document.querySelectorAll('h2')].find(node => node.textContent === ${JSON.stringify(packageId)})
      const section = heading?.closest('section')
      if (!(section instanceof HTMLElement)) throw new Error('Runtime Deck section is missing')
      const style = getComputedStyle(section)
      return JSON.stringify({
        width: style.width,
        borderRadius: style.borderRadius,
        backgroundColor: style.backgroundColor,
        ownedStyles: document.querySelectorAll(${JSON.stringify(`style[data-plugin="${packageId}"][data-plugin-css="${packageId}/client.css"]`)}).length,
      })
    }`)
  const conversationSelector = '[data-chat-flow-kind="dshx-command-lifecycle"] [data-dshx-conversation="command-lifecycle"]'
  const readConversation = () =>
    evaluate(`() => JSON.stringify([...document.querySelectorAll(${JSON.stringify(conversationSelector)})].map(node => ({
      commandId: node.getAttribute('data-command-id'),
      name: node.getAttribute('data-command-name'),
      phase: node.getAttribute('data-phase'),
      result: node.getAttribute('data-result'),
      matchCount: Number(node.getAttribute('data-match-count')),
      startSeq: Number(node.getAttribute('data-start-seq')),
      doneSeq: Number(node.getAttribute('data-done-seq')),
      location: node.getAttribute('data-location'),
      marker: node.getAttribute('data-renderer-marker'),
    })))`)
  const initial = await readStyle()
  if (
    !Number.isFinite(Number.parseFloat(initial.width)) ||
    Number.parseFloat(initial.width) <= 0 ||
    initial.borderRadius !== '12px' ||
    initial.backgroundColor === 'rgba(0, 0, 0, 0)' ||
    initial.ownedStyles !== 1
  ) {
    throw new Error(`Tailwind computed style or ownership mismatch: ${JSON.stringify(initial)}`)
  }
  return {
    initial,
    async waitForUpdate(previousBackground) {
      await command([
        'run-code',
        `async (page) => { await page.waitForFunction(() => {
          const heading = [...document.querySelectorAll('h2')].find(node => node.textContent === ${JSON.stringify(packageId)})
          const section = heading?.closest('section')
          return section instanceof HTMLElement && getComputedStyle(section).backgroundColor !== ${JSON.stringify(previousBackground)} && document.querySelectorAll(${JSON.stringify(
            `style[data-plugin="${packageId}"][data-plugin-css="${packageId}/client.css"]`,
          )}).length === 1
        }, undefined, { timeout: ${timeoutMs} }) }`,
      ])
      return readStyle()
    },
    async assertOwnedStyle() {
      await command([
        'run-code',
        `async (page) => { await page.waitForFunction(() => document.querySelectorAll(${JSON.stringify(
          `style[data-plugin="${packageId}"][data-plugin-css="${packageId}/client.css"]`,
        )}).length === 1, undefined, { timeout: ${timeoutMs} }) }`,
      ])
      return readStyle()
    },
    async openConversation(title) {
      await command([
        'run-code',
        `async (page) => {
          await page.reload({ waitUntil: 'domcontentloaded' })
          await page.getByRole('heading', { name: ${JSON.stringify(packageId)} }).waitFor({ timeout: ${timeoutMs} })
        }`,
      ])
      await dismissOptionalOnboarding()
      await command([
        'run-code',
        `async (page) => {
          const deadline = Date.now() + 85000
          const exactTitle = page.getByText(${JSON.stringify(title)}, { exact: true })
          const titled = page.getByRole('treeitem').filter({ has: exactTitle })
          while (Date.now() < deadline) {
            const titledCount = await titled.count()
            if (titledCount > 1) {
              throw new Error('Conversation title matched multiple session rows: ' + ${JSON.stringify(title)} + '; count=' + titledCount)
            }
            if (titledCount === 1 && await titled.first().isVisible()) {
              await titled.first().click()
              return
            }
            const collapsed = page.locator('[role="treeitem"][aria-expanded="false"]:visible')
            if (await collapsed.count() > 0) {
              await collapsed.evaluateAll(nodes => nodes.forEach(node => node.click()))
            }
            await page.waitForTimeout(200)
          }
          const summarize = async selector => page.locator(selector).evaluateAll(nodes => nodes.slice(0, 80).map(node => ({
            text: (node.textContent ?? '').trim().replace(/\\s+/g, ' ').slice(0, 240),
            role: node.getAttribute('role'),
            label: node.getAttribute('aria-label'),
            expanded: node.getAttribute('aria-expanded'),
            href: node.getAttribute('href'),
            visible: node instanceof HTMLElement && Boolean(node.offsetWidth || node.offsetHeight || node.getClientRects().length),
          })))
          const diagnostic = {
            url: page.url(),
            treeitems: await summarize('[role="treeitem"]'),
            dialogs: await summarize('[role="dialog"]'),
            buttons: await summarize('button'),
            links: await summarize('a'),
            visibleText: await page.locator('body').innerText().then(text => text.replace(/\\s+/g, ' ').slice(0, 4000)),
            screenshot: ${JSON.stringify(conversationDiagnosticScreenshot)},
          }
          await page.screenshot({ path: ${JSON.stringify(conversationDiagnosticScreenshot)}, fullPage: true })
          throw new Error('Conversation session did not hydrate: ' + ${JSON.stringify(title)} + '; diagnostic=' + JSON.stringify(diagnostic))
        }`,
      ])
    },
    async waitForConversation(count, marker) {
      await command([
        'run-code',
        `async (page) => { await page.waitForFunction(({ selector, count, marker }) => {
          const nodes = [...document.querySelectorAll(selector)]
          return nodes.length === count && nodes.every(node => node.getAttribute('data-renderer-marker') === marker)
        }, ${JSON.stringify({ selector: conversationSelector, count, marker })}, { timeout: ${timeoutMs} }) }`,
      ])
      return readConversation()
    },
    close: () => command(['close']),
  }
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
    body: JSON.stringify({
      type: 'client-request',
      rpcId,
      method: endpoint,
      payload,
    }),
  })
  if (!response.ok) throw new Error(`Connection RPC ${endpoint} returned HTTP ${response.status}`)
  const body = await response.json()
  if (body.rpcId !== rpcId) throw new Error(`Connection RPC ${endpoint} returned mismatched rpcId ${String(body.rpcId)}`)
  return body.result
}

async function waitForVisibleSession(webUrl, sessionId, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs
  let latest
  while (Date.now() < deadline) {
    latest = await callOfficialApi(webUrl, 'session.list', {})
    const session = latest.ok ? latest.value?.items?.find?.(item => item?.sessionId === sessionId) : undefined
    if (session !== undefined && session.blank === false) return session
    await new Promise(resolveResult => setTimeout(resolveResult, 100))
  }
  throw new Error(`Conversation smoke session did not become visible: ${JSON.stringify(latest)}`)
}

async function verifyGeneratedCommand(webUrl, projectRoot, existingSessionId) {
  const created = existingSessionId === undefined ? await callOfficialApi(webUrl, 'session.create', { cwd: projectRoot }) : undefined
  const sessionId = existingSessionId ?? (created?.ok ? created.value?.sessionId : undefined)
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
  if (!executed.ok || executed.value?.result?.kind !== 'success') {
    throw new Error(`Generated Command did not execute through the official parser: ${JSON.stringify(executed)}`)
  }
  let prompt
  try {
    prompt = JSON.parse(executed.value.result.text)
  } catch (error) {
    error.cause = executed.value.result.text
    throw error
  }
  const commandId = executed.value?.commandId
  if (typeof commandId !== 'string') throw new Error(`Generated Command did not return its lifecycle id: ${JSON.stringify(executed)}`)
  return { prompt, sessionId, commandId }
}

function verifyConversationNodes(nodes, commandIds, marker = 'conversation-v1') {
  if (nodes.length !== commandIds.length) throw new Error(`Conversation node count mismatch: ${JSON.stringify(nodes)}`)
  if (new Set(nodes.map(node => node.commandId)).size !== nodes.length) {
    throw new Error(`Conversation replay produced duplicate command nodes: ${JSON.stringify(nodes)}`)
  }
  if (nodes.some((node, index) => node.commandId !== commandIds[index])) {
    throw new Error(`Conversation nodes are not ordered by command start sequence: ${JSON.stringify(nodes)}`)
  }
  if (
    nodes.some(
      node =>
        node.name !== 'dshx-status' ||
        node.phase !== 'done' ||
        node.result !== 'success' ||
        node.matchCount !== 2 ||
        !Number.isInteger(node.startSeq) ||
        !Number.isInteger(node.doneSeq) ||
        node.doneSeq <= node.startSeq ||
        node.location !== 'session' ||
        node.marker !== marker,
    )
  ) {
    throw new Error(`Conversation reducer/project/render mismatch: ${JSON.stringify(nodes)}`)
  }
}

async function installPromptProbe(root, packageId) {
  const commandFile = join(root, 'src/commands/dshx-status.ts')
  const generated = await readFile(commandFile, 'utf8')
  if (!generated.includes('Implement /dshx-status')) throw new Error('Command scaffold did not produce its default editable handler')
  const toolName = `${packageId.replace(/[^a-zA-Z0-9_-]/g, '_')}_status`
  await writeFile(
    commandFile,
    `import { assembleContextFor } from '@deepseek-ai/dsh-agent'
import { MessageId } from '@deepseek-ai/dsh-llm'
import type { PromptAssembly } from '@deepseek-ai/dsh-system-prompt'
import { defineCommand } from '@becomeopc/dshx/host'

const sectionName = ${JSON.stringify(`${packageId}:guidance`)}
const contextName = ${JSON.stringify(`${packageId}:runtime`)}

export const dshx_statusCommand = defineCommand({
  name: 'dshx-status',
  description: 'Verify DSHX Prompt contributions.',
  async handler(invocation) {
    if (!invocation.agent.session.events.some((event: { readonly type: string }) => event.type === 'turn/start')) {
      invocation.agent.session.append('turn/start', { turn: 1 })
      invocation.agent.session.append('user/message', {
        id: MessageId('dshx-conversation-' + Date.now() + '-' + Math.random()),
        role: 'user',
        content: [{ type: 'text', text: 'DSHX Conversation lifecycle smoke.' }],
        source: { kind: 'user' },
      }, { surfaceOp: 'append' })
      invocation.agent.session.append('turn/end', { turn: 1, reason: { kind: 'completed' } })
    }
    const assemble = () => invocation.agent.ctx.systemPrompt.assemble(assembleContextFor(invocation.agent, invocation.signal))
    const summarize = (assembly: PromptAssembly) => ({
      section: assembly.sections.find(item => item.name === sectionName)?.text,
      sectionCount: assembly.sections.filter(item => item.name === sectionName).length,
      context: assembly.contexts.find(item => item.name === contextName)?.text,
      contextCount: assembly.contexts.filter(item => item.name === contextName).length,
    })
    const initial = await assemble()
    const disposeSection = invocation.agent.ctx.systemPrompt.section({ name: sectionName, order: 150, text: 'Scoped guidance.' })
    const disposeContext = invocation.agent.ctx.systemPrompt.context({ name: contextName, order: 0, text: 'Scoped runtime.' })
    let scoped
    let globalWhileScoped
    try {
      scoped = await assemble()
      globalWhileScoped = await invocation.agent.ctx.systemPrompt.assemble()
    } finally {
      disposeContext()
      disposeSection()
    }
    const restored = await assemble()
    setTimeout(() => {
      void invocation.agent.ctx.sessions.flush(invocation.agent.session).catch((error: unknown) => console.error('Conversation smoke flush failed', error))
    }, 0)
    return {
      kind: 'success',
      text: JSON.stringify({
        initial: summarize(initial),
        scoped: summarize(scoped),
        globalWhileScoped: summarize(globalWhileScoped),
        restored: summarize(restored),
        toolVisible: initial.tools.some((tool: { readonly name?: string }) => tool.name === ${JSON.stringify(toolName)}),
      }),
    }
  },
})
`,
  )
}

async function installSettingsProbe(root) {
  await writeFile(
    join(root, 'src/settings.ts'),
    `import Schema from '@deepseek-ai/schemastery'
import { defineSettings } from '@becomeopc/dshx/settings'

export const runtimeSettings = defineSettings({
  namespace: 'plugin-full-a',
  schema: Schema.object({
    showActivity: Schema.boolean().default(true),
    threshold: Schema.number().default(1),
    token: Schema.string().role('secret'),
  }),
  applies: 'live',
  client: {
    decode(value) {
      if (typeof value !== 'object' || value === null) throw new TypeError('invalid redacted settings')
      const candidate = value as { readonly showActivity?: unknown; readonly threshold?: unknown }
      if (typeof candidate.showActivity !== 'boolean' || typeof candidate.threshold !== 'number') throw new TypeError('invalid redacted settings')
      return { showActivity: candidate.showActivity, threshold: candidate.threshold }
    },
  },
})
`,
  )
  const hostFile = join(root, 'src/host.ts')
  const host = await readFile(hostFile, 'utf8')
  const ownership = `settings: [runtimeSettings.host({
    base: { showActivity: true, threshold: 3 },
    validate(value) {
      if (value.threshold > 10) throw new Error('threshold must be at most 10')
    },
  })],`
  if (!host.includes('settings: [runtimeSettings],')) throw new Error('Generated Host did not contain one-line Settings ownership')
  await writeFile(hostFile, host.replace('settings: [runtimeSettings],', ownership))
}

function verifyPromptProbe(probe, packageId, minimumExclusive) {
  const contextPrefix = `${packageId} status requests: `
  const contextValue = probe.initial?.context
  const requestCount =
    typeof contextValue === 'string' && contextValue.startsWith(contextPrefix) ? Number(contextValue.slice(contextPrefix.length)) : Number.NaN
  if (!Number.isInteger(requestCount) || requestCount < 0) {
    throw new Error(`Dynamic Prompt context is invalid: ${JSON.stringify(probe)}`)
  }
  if (minimumExclusive !== undefined && requestCount <= minimumExclusive) {
    throw new Error(`Dynamic Prompt context was not re-evaluated: ${JSON.stringify(probe)}`)
  }
  const global = {
    section: `Use the ${packageId.replace(/[^a-zA-Z0-9_-]/g, '_')}_status tool when the user asks whether this plugin is running.`,
    sectionCount: 1,
    context: `${packageId} status requests: ${requestCount}`,
    contextCount: 1,
  }
  const scoped = {
    section: 'Scoped guidance.',
    sectionCount: 1,
    context: 'Scoped runtime.',
    contextCount: 1,
  }
  if (JSON.stringify(probe.initial) !== JSON.stringify(global)) throw new Error(`Global Prompt contribution mismatch: ${JSON.stringify(probe)}`)
  if (JSON.stringify(probe.scoped) !== JSON.stringify(scoped)) throw new Error(`Scoped Prompt shadow mismatch: ${JSON.stringify(probe)}`)
  if (JSON.stringify(probe.globalWhileScoped) !== JSON.stringify(global)) throw new Error(`Scoped Prompt leaked globally: ${JSON.stringify(probe)}`)
  if (JSON.stringify(probe.restored) !== JSON.stringify(global)) throw new Error(`Prompt contribution did not restore after disposal: ${JSON.stringify(probe)}`)
  if (probe.toolVisible !== true) throw new Error(`Prompt assembly did not include the generated Tool schema: ${JSON.stringify(probe)}`)
  return requestCount
}

function settingsNamespace(result, namespace) {
  if (!result?.ok) throw new Error(`Settings request failed: ${JSON.stringify(result)}`)
  const namespaces = result.value?.namespaces
  const view = Array.isArray(namespaces) ? namespaces.find(item => item?.ns === namespace) : result.value
  if (view?.ns !== namespace) throw new Error(`Settings namespace ${namespace} is missing: ${JSON.stringify(result)}`)
  return view
}

async function verifySettingsLifecycle(webUrl) {
  const namespace = 'plugin-full-a'
  const initialResult = await callOfficialApi(webUrl, 'settings.describe', {})
  const initial = settingsNamespace(initialResult, namespace)
  if (initial.value?.showActivity !== true || initial.value?.threshold !== 3 || initial.applies !== 'live') {
    throw new Error(`Settings defaults/base layering mismatch: ${JSON.stringify(initial)}`)
  }
  if ('token' in initial.value || initial.secrets?.find(item => item.path?.join('.') === 'token')?.set !== false) {
    throw new Error(`Settings initial secret redaction mismatch: ${JSON.stringify(initial)}`)
  }
  const updatedResult = await callOfficialApi(webUrl, 'settings.update', {
    ns: namespace,
    patch: { showActivity: false, threshold: 4, token: 'smoke-secret' },
    expectedRevision: initial.revision,
  })
  const updated = settingsNamespace(updatedResult, namespace)
  if (updated.value?.showActivity !== false || updated.value?.threshold !== 4 || 'token' in updated.value) {
    throw new Error(`Settings update/redaction mismatch: ${JSON.stringify(updated)}`)
  }
  if (updated.secrets?.find(item => item.path?.join('.') === 'token')?.set !== true) {
    throw new Error(`Settings secret configured state is missing: ${JSON.stringify(updated)}`)
  }
  const stale = await callOfficialApi(webUrl, 'settings.update', {
    ns: namespace,
    patch: { showActivity: true },
    expectedRevision: initial.revision,
  })
  if (stale?.ok !== false) throw new Error(`Settings accepted a stale revision fence: ${JSON.stringify(stale)}`)
  const rejected = await callOfficialApi(webUrl, 'settings.update', {
    ns: namespace,
    patch: { threshold: 99 },
    expectedRevision: updated.revision,
  })
  if (rejected?.ok !== false) throw new Error(`Settings accepted Host validation rejection: ${JSON.stringify(rejected)}`)
  const recovered = settingsNamespace(await callOfficialApi(webUrl, 'settings.describe', {}), namespace)
  if (recovered.value?.showActivity !== false || recovered.value?.threshold !== 4 || recovered.revision !== updated.revision) {
    throw new Error(`Settings failed to recover after rejected writes: ${JSON.stringify(recovered)}`)
  }
  const unset = settingsNamespace(
    await callOfficialApi(webUrl, 'settings.mutate', {
      ns: namespace,
      ops: [{ op: 'unset', path: ['showActivity'] }],
      expectedRevision: recovered.revision,
    }),
    namespace,
  )
  if (unset.value?.showActivity !== true || unset.user?.showActivity !== undefined) {
    throw new Error(`Settings unset did not restore the composition base: ${JSON.stringify(unset)}`)
  }
  const persisted = settingsNamespace(
    await callOfficialApi(webUrl, 'settings.update', {
      ns: namespace,
      patch: { showActivity: false },
      expectedRevision: unset.revision,
    }),
    namespace,
  )
  return persisted.revision
}

async function verifySettingsAfterRestart(webUrl, previousRevision) {
  const described = await callOfficialApi(webUrl, 'settings.describe', {})
  const matches = described?.value?.namespaces?.filter?.(item => item?.ns === 'plugin-full-a') ?? []
  if (matches.length !== 1) throw new Error(`Settings Host restart produced duplicate/stale registrations: ${JSON.stringify(described)}`)
  const current = matches[0]
  if (current.value?.showActivity !== false || current.value?.threshold !== 4 || !Number.isInteger(current.revision)) {
    throw new Error(`Settings persistence did not survive Host restart: ${JSON.stringify(current)}`)
  }
  if (!Number.isInteger(previousRevision)) throw new Error(`Settings pre-restart revision was invalid: ${String(previousRevision)}`)
  if (current.secrets?.find(item => item.path?.join('.') === 'token')?.set !== true || 'token' in current.value) {
    throw new Error(`Settings secret redaction did not survive Host restart: ${JSON.stringify(current)}`)
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

async function availableLoopbackPort() {
  const server = createServer()
  server.unref()
  await new Promise((resolveResult, rejectResult) => {
    server.once('error', rejectResult)
    server.listen(0, '127.0.0.1', resolveResult)
  })
  const address = server.address()
  if (address === null || typeof address === 'string') {
    await new Promise(resolveResult => server.close(resolveResult))
    throw new Error(`Could not allocate an isolated DSH smoke port: ${String(address)}`)
  }
  await new Promise((resolveResult, rejectResult) => {
    server.close(error => (error === undefined ? resolveResult() : rejectResult(error)))
  })
  return address.port
}

async function startDev(root, env) {
  const port = await availableLoopbackPort()
  const child = spawn('pnpm', ['exec', 'dshx', 'dev', '--port', String(port)], {
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
    if (/^◆ Dev session\b/m.test(stdout)) sessionReady = true
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
  if (Number(new URL(webUrl).port) !== port) throw new Error(`dshx dev reported ${webUrl} instead of isolated port ${port}\n${stdout}\n${stderr}`)
  await new Promise(resolveResult => setTimeout(resolveResult, 750))
  return {
    child,
    port,
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
    projects.fullA = await createProject(root, 'plugin-full-a', dshxTarball, dshVersion, { template: 'showcase', style: 'tailwind' })
    await useAutomaticHostRestart(projects.fullA)
    await installConversationProbe(projects.fullA, dshVersion)
    await expectSuccess('pnpm', ['exec', 'dshx', 'add', 'command', '--name', 'dshx-status', '--description', 'Return DSHX status.'], { cwd: projects.fullA })
    await installPromptProbe(projects.fullA, 'plugin-full-a')
    await installSettingsProbe(projects.fullA)
    projects.fullB = await createProject(root, 'plugin-full-b', dshxTarball, dshVersion, { template: 'showcase', style: 'css-modules' })
    projects.hostOnly = await createProject(root, 'plugin-host-only', dshxTarball, dshVersion)
    await removeClient(projects.hostOnly)
    projects.clientOnly = await createProject(root, 'plugin-client-only', dshxTarball, dshVersion)
    await removeHost(projects.clientOnly)
    projects.native = await createProject(root, 'plugin-native', dshxTarball, dshVersion, { style: 'none' })
    await makeNativeHost(projects.native)

    for (const [name, project] of Object.entries(projects)) {
      await expectSuccess('pnpm', ['exec', 'dshx', 'build'], {
        cwd: project,
        env: { DSH_HOME: join(dshHome, name) },
      })
      await expectSuccess('pnpm', ['exec', 'dshx', 'check', '--json'], {
        cwd: project,
        env: { DSH_HOME: join(dshHome, name) },
      })
      await expectFailure('pnpm', ['exec', 'dshx', 'check', '--runtime', '--json'], 'DSHX4305', { cwd: project, env: { DSH_HOME: join(dshHome, name) } })
    }
    const settingsClientArtifact = await readFile(join(projects.fullA, 'dist/client.js'), 'utf8')
    if (!/settingsCapability:\s*true/.test(settingsClientArtifact)) {
      throw new Error('Generated Client artifact did not retain hook-driven Settings capability metadata')
    }
    if (!/apiCapability:\s*true/.test(settingsClientArtifact)) {
      throw new Error('Generated Client artifact did not retain hook-driven API capability metadata')
    }
    if (settingsClientArtifact.includes('threshold must be at most 10') || settingsClientArtifact.includes('@becomeopc/dshx/settings')) {
      throw new Error('Generated Client artifact retained Host-only Settings behavior or a private DSHX Settings import')
    }
    const settingsHostArtifact = await readFile(join(projects.fullA, 'dist/index.js'), 'utf8')
    if (settingsHostArtifact.includes('@becomeopc/dshx/settings') || !settingsHostArtifact.includes('@deepseek-ai/dsh-settings')) {
      throw new Error('Generated Host artifact did not inline DSHX Settings helpers over the official runtime service')
    }

    await expectFailure('pnpm', ['exec', 'dshx', 'add', 'tool', '--name', 'native.status'], 'DSHX6204', {
      cwd: projects.native,
      env: { DSH_HOME: join(dshHome, 'native') },
    })
    await expectFailure('pnpm', ['exec', 'dshx', 'add', 'tool', '--name', 'disabled.status'], 'DSHX6203', {
      cwd: projects.clientOnly,
      env: { DSH_HOME: join(dshHome, 'clientOnly') },
    })

    const hostDev = await startDev(projects.hostOnly, {
      DSH_HOME: join(dshHome, 'host-only'),
    })
    try {
      const check = await jsonCommand(projects.hostOnly, { DSH_HOME: join(dshHome, 'host-only') }, ['check', '--runtime'])
      if (check.diagnostics.some(item => item.severity === 'error')) throw new Error('Host-only check failed after dev link')
      const hostServices = await jsonCommand(projects.hostOnly, { DSH_HOME: join(dshHome, 'host-only') }, ['inspect', 'services'])
      const hostEvents = await jsonCommand(projects.hostOnly, { DSH_HOME: join(dshHome, 'host-only') }, ['inspect', 'events'])
      if (hostServices.source !== 'runtime' || hostEvents.source !== 'runtime') throw new Error('Host-only Inspect did not return runtime data')
      const uiDryRun = await run(
        'pnpm',
        ['exec', 'dshx', 'add', 'ui', '--slot', 'sidebar.footer.action', '--provider', '@deepseek-ai/dsh-client-ui-sidebar', '--dry-run', '--json'],
        {
          cwd: projects.hostOnly,
          env: { DSH_HOME: join(dshHome, 'host-only') },
        },
      )
      if (uiDryRun.code === 0) {
        const uiPlan = JSON.parse(uiDryRun.stdout)
        if (uiPlan.diagnostics?.some?.(item => item?.severity === 'error')) throw new Error(`Host-only UI dry-run failed: ${uiDryRun.stdout}`)
      } else if (!['DSHX6102', 'DSHX3202'].some(code => uiDryRun.stdout.includes(code) || uiDryRun.stderr.includes(code))) {
        throw new Error(`Host-only UI dry-run failed unexpectedly:\n${uiDryRun.stderr}\n${uiDryRun.stdout}`)
      }
      await expectSuccess('pnpm', ['exec', 'dshx', 'add', 'tool', '--name', 'host.status'], {
        cwd: projects.hostOnly,
        env: { DSH_HOME: join(dshHome, 'host-only') },
      })
      await expectSuccess('pnpm', ['exec', 'dshx', 'add', 'hook', '--event', 'session.created'], {
        cwd: projects.hostOnly,
        env: { DSH_HOME: join(dshHome, 'host-only') },
      })
      await expectSuccess('pnpm', ['exec', 'dshx', 'build'], {
        cwd: projects.hostOnly,
        env: { DSH_HOME: join(dshHome, 'host-only') },
      })
    } finally {
      await hostDev.close()
    }

    const clientDev = await startDev(projects.clientOnly, {
      DSH_HOME: join(dshHome, 'client-only'),
    })
    try {
      const check = await jsonCommand(projects.clientOnly, { DSH_HOME: join(dshHome, 'client-only') }, ['check', '--runtime'])
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
    const fullDev = await startDev(projects.fullA, {
      DSH_HOME: join(dshHome, 'multi'),
    })
    let browser
    try {
      browser = await startTailwindBrowser(fullDev.webUrl(), 'plugin-full-a')
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
      const firstCommand = await verifyGeneratedCommand(fullDev.webUrl(), projects.fullA)
      const firstPromptCount = verifyPromptProbe(firstCommand.prompt, 'plugin-full-a')
      const conversationTitle = `DSHX Conversation ${randomUUID()}`
      const renamed = await callOfficialApi(fullDev.webUrl(), 'session.rename', { sessionId: firstCommand.sessionId, title: conversationTitle })
      if (!renamed.ok) throw new Error(`Could not rename Conversation smoke session: ${JSON.stringify(renamed)}`)
      await waitForVisibleSession(fullDev.webUrl(), firstCommand.sessionId)
      await browser.openConversation(conversationTitle)
      const firstConversation = await browser.waitForConversation(1, 'conversation-v1')
      verifyConversationNodes(firstConversation, [firstCommand.commandId])
      const nextPromptStatus = await callDshxApi(fullDev.webUrl(), 'plugin-full-a', 'get', 1)
      if (!nextPromptStatus.ok || !Number.isInteger(nextPromptStatus.value?.output?.requestCount)) {
        throw new Error(`Prompt request count did not advance: ${JSON.stringify(nextPromptStatus)}`)
      }
      const secondCommand = await verifyGeneratedCommand(fullDev.webUrl(), projects.fullA, firstCommand.sessionId)
      verifyPromptProbe(secondCommand.prompt, 'plugin-full-a', firstPromptCount)
      const secondConversation = await browser.waitForConversation(2, 'conversation-v1')
      verifyConversationNodes(secondConversation, [firstCommand.commandId, secondCommand.commandId])
      const settingsRevision = await verifySettingsLifecycle(fullDev.webUrl())
      const hmr = fullDev.waitForOutput('client rebuilt')
      const clientFile = join(projects.fullA, 'src/client.tsx')
      const clientSource = await readFile(clientFile, 'utf8')
      if (!clientSource.includes('dshx:bg-slate-950')) throw new Error('Tailwind HMR fixture class is missing')
      const hostStartsBeforeClientHmr = (fullDev.output().stdout.match(/dsh web:/g) ?? []).length
      await writeFile(clientFile, clientSource.replace('dshx:bg-slate-950', 'dshx:bg-red-500').replace('conversation-v1', 'conversation-v2'))
      await hmr
      const updatedStyle = await browser.waitForUpdate(browser.initial.backgroundColor)
      if (updatedStyle.ownedStyles !== 1) throw new Error(`Client HMR left stale owned styles: ${JSON.stringify(updatedStyle)}`)
      const hmrConversation = await browser.waitForConversation(2, 'conversation-v2')
      verifyConversationNodes(hmrConversation, [firstCommand.commandId, secondCommand.commandId], 'conversation-v2')
      await new Promise(resolveResult => setTimeout(resolveResult, 1_000))
      if ((fullDev.output().stdout.match(/dsh web:/g) ?? []).length !== hostStartsBeforeClientHmr) {
        throw new Error('Client-only Tailwind HMR restarted the Host process')
      }
      const restarted = fullDev.waitForOutput('dsh web:')
      await appendFile(join(projects.fullA, 'src/host.ts'), `\n// Host lifecycle smoke ${Date.now()}\n`)
      await restarted
      await new Promise(resolveResult => setTimeout(resolveResult, 750))
      const afterRestart = await callDshxApi(fullDev.webUrl(), 'plugin-full-a', 'get', 1)
      const afterRestartCount = afterRestart.value?.output?.requestCount
      if (!afterRestart.ok || !Number.isInteger(afterRestartCount) || afterRestartCount < 1) {
        throw new Error(`Full plugin API did not recover after Host restart: ${JSON.stringify(afterRestart)}`)
      }
      const thirdCommand = await verifyGeneratedCommand(fullDev.webUrl(), projects.fullA, firstCommand.sessionId)
      verifyPromptProbe(thirdCommand.prompt, 'plugin-full-a')
      const restartedConversation = await browser.waitForConversation(3, 'conversation-v2')
      verifyConversationNodes(restartedConversation, [firstCommand.commandId, secondCommand.commandId, thirdCommand.commandId], 'conversation-v2')
      await verifySettingsAfterRestart(fullDev.webUrl(), settingsRevision)
      const afterHostRestartStyle = await browser.assertOwnedStyle()
      if (afterHostRestartStyle.ownedStyles !== 1) throw new Error(`Host restart left stale owned styles: ${JSON.stringify(afterHostRestartStyle)}`)
      const uiRebuilt = fullDev.waitForOutput('client rebuilt')
      void uiRebuilt.catch(() => undefined)
      const uiScaffold = await expectSuccess(
        'pnpm',
        ['exec', 'dshx', 'add', 'ui', '--slot', 'settings.general.item', '--provider', '@deepseek-ai/dsh-client-ui-settings', '--json'],
        {
          cwd: projects.fullA,
          env: { DSH_HOME: join(dshHome, 'multi') },
        },
      )
      const uiScaffoldResult = JSON.parse(uiScaffold.stdout)
      if (uiScaffoldResult.diagnostics?.some?.(item => item?.severity === 'error')) {
        throw new Error(`Real UI scaffold failed: ${uiScaffold.stdout}`)
      }
      const generatedUiFile = join(projects.fullA, 'src/slots/settings.general.item.tsx')
      const generatedUiSource = await readFile(generatedUiFile, 'utf8')
      const generatedClientSource = await readFile(join(projects.fullA, 'src/client.tsx'), 'utf8')
      if (!generatedUiSource.includes('defineSlot("settings.general.item"') || !generatedClientSource.includes('./slots/settings.general.item.js')) {
        throw new Error('Real UI scaffold did not generate and attach the requested Settings contribution')
      }
      await uiRebuilt
      const check = await jsonCommand(projects.fullA, { DSH_HOME: join(dshHome, 'multi') }, ['check', '--runtime'])
      if (check.diagnostics.some(item => item.severity === 'error')) throw new Error('Full plugin check failed after dev link')
      const inspectEnv = { DSH_HOME: join(dshHome, 'multi') }
      const slots = await inspectMaybeAvailable(projects.fullA, inspectEnv, ['inspect', 'slots'])
      const exact = await inspectMaybeAvailable(projects.fullA, inspectEnv, ['inspect', 'slots', '--root', 'sidebar.footer.action'])
      const generatedUiExact = await inspectMaybeAvailable(projects.fullA, inspectEnv, ['inspect', 'slots', '--root', 'settings.general.item'])
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
            inspect: [slots, exact, generatedUiExact, services, events].map(summarizeInspect),
            scaffold: {
              ui: 'verified',
              slot: 'settings.general.item',
              clientHmr: 'verified',
            },
            api: {
              clientHookWiring: 'verified',
              unary: 'verified',
              versionMismatch: 'verified',
              hostRestart: 'verified',
            },
            command: {
              scaffold: 'verified',
              parser: 'verified',
              hostRestart: 'verified',
            },
            prompt: {
              global: 'verified',
              scopedShadow: 'verified',
              dynamicContext: 'verified',
              toolSchemas: 'verified',
              hostRestart: 'verified',
            },
            conversation: {
              events: ['command/run', 'command/done'],
              historyReplay: 'verified',
              reduceProjectRender: 'verified',
              ordering: 'verified',
              clientHmr: 'verified',
              hostRestartRecovery: 'verified',
              pagination: 'unit-covered',
            },
            settings: {
              clientHookWiring: 'verified',
              layering: 'verified',
              writes: 'verified',
              revisionFence: 'verified',
              validationRecovery: 'verified',
              secrets: 'verified',
              hostRestart: 'verified',
            },
            browser: {
              port: fullDev.port,
              tailwindComputedStyle: 'verified',
              clientHmr: 'verified',
              ownedStyleCleanup: 'verified',
            },
            profile: 'linked',
            bridge: 'running',
          },
          null,
          2,
        ),
      )
    } finally {
      await browser?.close().catch(() => undefined)
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
