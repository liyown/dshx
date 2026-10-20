import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { capabilities } from '../packages/framework-hub-cli/dist/capabilities.js'
import { commandShapes } from '../packages/framework-hub-cli/dist/command-registry.js'
import {
  dailyOperationsCliChannel,
  dailyOperationsCommandContract,
  dailyOperationsPromptUrl,
  dailyOperationsPromptVersion,
  renderDailyOperationsBootstrap,
  renderDailyOperationsPrompt,
} from '../packages/hub-ops-prompt/dist/index.js'

const workspace = resolve(fileURLToPath(new URL('..', import.meta.url)))
const target = resolve(workspace, 'apps/framework-hub/src/lib/generated/agent-prompt.json')
const metaTarget = resolve(workspace, 'apps/framework-hub/src/lib/generated/agent-prompt-meta.json')
const check = process.argv.includes('--check')

const sha256 = value => createHash('sha256').update(value).digest('hex')

const cliPackage = JSON.parse(await readFile(resolve(workspace, 'packages/framework-hub-cli/package.json'), 'utf8'))
const cliVersion = cliPackage.version
if (typeof cliVersion !== 'string' || cliVersion === '') throw new Error('The CLI package version is missing.')

const surface = await capabilities()
const commandNames = new Set(surface.commands.map(entry => entry.command))
for (const entry of dailyOperationsCommandContract) {
  if (!commandNames.has(entry.command)) throw new Error(`Prompt contract names an unavailable command: ${entry.command}`)
  const shape = commandShapes[entry.command]
  if (shape === undefined) throw new Error(`Prompt contract names a command without a shape: ${entry.command}`)
  const flags = new Set([...entry.usage.matchAll(/--([a-z][a-z-]*)/g)].map(match => match[1]))
  for (const flag of flags) {
    if (!shape.options.includes(flag)) throw new Error(`Prompt usage for ${entry.command} names unknown flag --${flag}.`)
  }
  if (entry.access === 'hub-write' && !entry.usage.includes('--run-id RUN_ID')) throw new Error(`Hub write ${entry.command} must require --run-id RUN_ID.`)
}
const contractCommands = new Set(dailyOperationsCommandContract.map(entry => entry.command))
const commandAllowlist = new Set(['auth logout'])
for (const command of Object.keys(commandShapes)) {
  if (!contractCommands.has(command) && !commandAllowlist.has(command)) throw new Error(`Command is missing from the prompt contract: ${command}`)
}

const promptUrl = dailyOperationsPromptUrl
const npxCommand = `npx --yes --package ${cliPackage.name}@${cliVersion} dshx-hub`
const prompt = renderDailyOperationsPrompt({ cliVersion, promptUrl })
const bootstrap = renderDailyOperationsBootstrap({ cliVersion, promptUrl })
if (prompt.includes('{{') || bootstrap.includes('{{')) throw new Error('The rendered operations prompt contains a placeholder.')

const contentSha256 = sha256(JSON.stringify({ bootstrap, prompt }))
const generated = {
  meta: {
    promptVersion: dailyOperationsPromptVersion,
    cliVersion,
    cliChannel: dailyOperationsCliChannel,
    capabilitiesHash: surface.capabilitiesHash,
    contentSha256,
    sourceUrl: promptUrl,
    npxCommand,
  },
  bootstrap,
  prompt,
}
const output = `${JSON.stringify(generated, null, 2)}\n`
const metaOutput = `${JSON.stringify(generated.meta, null, 2)}\n`

async function existing(path) {
  try {
    return await readFile(path, 'utf8')
  } catch {
    return ''
  }
}

if (check) {
  const [current, currentMeta] = await Promise.all([existing(target), existing(metaTarget)])
  if (current !== output || currentMeta !== metaOutput) {
    console.error('Hub agent prompt is stale. Run pnpm hub:prompt:generate and commit the result.')
    process.exit(1)
  }
  console.log('Hub agent prompt is up to date.')
} else {
  await mkdir(dirname(target), { recursive: true })
  await Promise.all([writeFile(target, output), writeFile(metaTarget, metaOutput)])
  console.log(`Wrote ${target} (CLI ${cliVersion}, prompt v${dailyOperationsPromptVersion}).`)
}
