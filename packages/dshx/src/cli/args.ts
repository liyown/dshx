import { defineCommand, parseArgs as parseCittyArgs } from 'citty'

export type CliCommand = 'build' | 'check' | 'dev' | 'inspect' | 'add'
export type CliInspectTarget = 'slots' | 'tools' | 'services' | 'events'
export type CliAddTarget = 'ui' | 'tool' | 'command' | 'hook'

export interface CliArgs {
  readonly command?: CliCommand
  readonly inspectTarget?: CliInspectTarget
  readonly addTarget?: CliAddTarget
  readonly cwd?: string
  readonly root?: string
  readonly verbose: boolean
  readonly json: boolean
  readonly open: boolean
  readonly slot?: string
  readonly name?: string
  readonly description?: string
  readonly event?: string
  readonly provider?: string
  readonly file?: string
  readonly id?: string
  readonly order?: number
  readonly dryRun: boolean
  readonly fix: boolean
  readonly help: boolean
  readonly version: boolean
}

export class CliUsageError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CliUsageError'
  }
}

const valueOptions = new Set(['--cwd', '--root', '--slot', '--name', '--description', '--event', '--provider', '--file', '--id', '--order'])
const booleanOptions = new Set(['--help', '-h', '--version', '-V', '--verbose', '--json', '--open', '--dry-run', '--fix'])

const sharedArgs = {
  cwd: {
    type: 'string',
    description: 'Run from a different project directory.',
    valueHint: 'path',
  },
  root: {
    type: 'string',
    description: 'Limit Slot inspection to a root Slot.',
    valueHint: 'slot',
  },
  verbose: {
    type: 'boolean',
    description: 'Print underlying command failures.',
  },
  json: { type: 'boolean', description: 'Emit stable machine-readable JSON.' },
  open: { type: 'boolean', description: 'Open the development URL.' },
  slot: {
    type: 'string',
    description: 'Select a Slot by name.',
    valueHint: 'name',
  },
  name: {
    type: 'string',
    description: 'Name a generated Tool or Command.',
    valueHint: 'name',
  },
  description: {
    type: 'string',
    description: 'Describe a generated Tool or Command.',
    valueHint: 'text',
  },
  event: {
    type: 'string',
    description: 'Select a DSH lifecycle event.',
    valueHint: 'name',
  },
  provider: {
    type: 'string',
    description: 'Select a UI provider package.',
    valueHint: 'package',
  },
  file: {
    type: 'string',
    description: 'Override the generated file path.',
    valueHint: 'path',
  },
  id: {
    type: 'string',
    description: 'Set the generated contribution id.',
    valueHint: 'id',
  },
  order: {
    type: 'string',
    description: 'Set the UI contribution order.',
    valueHint: 'integer',
  },
  dryRun: {
    type: 'boolean',
    description: 'Plan changes without writing files.',
  },
  fix: { type: 'boolean', description: 'Repair safe manifest issues.' },
  help: { type: 'boolean', alias: 'h', description: 'Show command help.' },
  version: {
    type: 'boolean',
    alias: 'V',
    description: 'Show the installed version.',
  },
} as const

/** Citty command metadata is the single declaration of DSHX commands and options. */
export const dshxCommand = defineCommand({
  meta: {
    name: 'dshx',
    description: 'Build, check, inspect, and scaffold typed DeepSeek Harness plugins.',
  },
  args: sharedArgs,
  subCommands: {
    build: defineCommand({
      meta: {
        name: 'build',
        description: 'Build Host and Client plugin artifacts.',
      },
      args: sharedArgs,
    }),
    check: defineCommand({
      meta: {
        name: 'check',
        description: 'Validate compatibility and project wiring.',
      },
      args: sharedArgs,
    }),
    dev: defineCommand({
      meta: {
        name: 'dev',
        description: 'Run a compatibility-aware DSH development session.',
      },
      args: sharedArgs,
    }),
    inspect: defineCommand({
      meta: {
        name: 'inspect',
        description: 'Inspect Slots, Tools, Services, or Events.',
      },
      args: sharedArgs,
    }),
    add: defineCommand({
      meta: {
        name: 'add',
        description: 'Scaffold a UI, Tool, Command, or Hook contribution.',
      },
      args: sharedArgs,
    }),
  },
})

function validateOptionTokens(argv: readonly string[]): void {
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]
    if (token === undefined || !token.startsWith('-')) continue
    if (booleanOptions.has(token)) continue
    if (!valueOptions.has(token)) throw new CliUsageError(`Unknown argument ${JSON.stringify(token)}.`)
    const value = argv[index + 1]
    if (value === undefined || value.startsWith('-')) throw new CliUsageError(`${token} requires a value.`)
    index += 1
  }
}

/** Parse the small, intentionally stable DSHX command grammar. */
export function parseCliArgs(argv: readonly string[]): CliArgs {
  validateOptionTokens(argv)
  const parsed = parseCittyArgs([...argv], sharedArgs)
  let command: CliCommand | undefined
  let inspectTarget: CliInspectTarget | undefined
  let addTarget: CliAddTarget | undefined
  let cwd: string | undefined
  let root: string | undefined
  let verbose = false
  let json = false
  let open = false
  let slot: string | undefined
  let name: string | undefined
  let description: string | undefined
  let event: string | undefined
  let provider: string | undefined
  let file: string | undefined
  let id: string | undefined
  let order: number | undefined
  let dryRun = false
  let fix = false
  let help = false
  let version = false

  for (const token of parsed._) {
    if (token === undefined) continue
    if (token === 'build' || token === 'check' || token === 'dev' || token === 'inspect' || token === 'add') {
      if (command !== undefined) throw new CliUsageError('Only one command may be specified.')
      command = token
      continue
    }
    if (token === 'slots' || token === 'tools' || token === 'services' || token === 'events') {
      if (inspectTarget !== undefined) throw new CliUsageError('Only one inspect target may be specified.')
      inspectTarget = token
      continue
    }
    if (token === 'ui' || token === 'tool' || token === 'command' || token === 'hook') {
      if (addTarget !== undefined) throw new CliUsageError('Only one add target may be specified.')
      addTarget = token
      continue
    }
    throw new CliUsageError(`Unknown argument ${JSON.stringify(token)}.`)
  }

  cwd = parsed.cwd
  root = parsed.root
  verbose = parsed.verbose ?? false
  json = parsed.json ?? false
  open = parsed.open ?? false
  slot = parsed.slot
  name = parsed.name
  description = parsed.description
  event = parsed.event
  provider = parsed.provider
  file = parsed.file
  id = parsed.id
  dryRun = parsed.dryRun ?? false
  fix = parsed.fix ?? false
  help = parsed.help ?? false
  version = parsed.version ?? false
  if (parsed.order !== undefined) {
    const value = Number(parsed.order)
    if (!Number.isInteger(value)) throw new CliUsageError('--order requires an integer value.')
    order = value
  }

  if (json && command !== undefined && command !== 'check' && command !== 'inspect' && command !== 'add')
    throw new CliUsageError('--json is only valid with check, inspect, or add.')
  if (open && command !== undefined && command !== 'dev') throw new CliUsageError('--open is only valid with dev.')
  if (dryRun && command !== 'add' && !(command === 'check' && fix)) throw new CliUsageError('DSHX4147: --dry-run is only valid with add commands or check --fix.')
  if (fix && command !== 'check') throw new CliUsageError('DSHX4147: --fix is only valid with check.')
  if ((slot !== undefined || provider !== undefined || id !== undefined || order !== undefined) && command !== 'add')
    throw new CliUsageError('add ui options are only valid with add ui.')
  if ((name !== undefined || description !== undefined) && command !== 'add') throw new CliUsageError('add name options are only valid with add tool or add command.')
  if (event !== undefined && command !== 'add') throw new CliUsageError('--event is only valid with add hook.')
  if (root !== undefined && (command !== 'inspect' || inspectTarget !== 'slots')) throw new CliUsageError('--root is only valid with inspect slots.')
  if ((json || open) && command === undefined) throw new CliUsageError('An option requires a command.')
  if (command !== 'inspect' && inspectTarget !== undefined) throw new CliUsageError('Inspect targets are only valid with the inspect command.')
  if (command !== 'add' && addTarget !== undefined) throw new CliUsageError('Add targets are only valid with the add command.')
  if (command === 'inspect' && inspectTarget === undefined && !help && !version) throw new CliUsageError('Inspect requires a target: slots, tools, services, or events.')
  if (command === 'add' && addTarget === undefined && !help && !version) throw new CliUsageError('Add requires a target: ui, tool, command, or hook.')
  if (command === 'add' && addTarget !== 'ui' && addTarget !== 'tool' && addTarget !== 'command' && addTarget !== 'hook')
    throw new CliUsageError('Only add ui, add tool, add command, and add hook are supported.')
  if (command === 'add' && addTarget !== 'ui' && (slot !== undefined || provider !== undefined || id !== undefined || order !== undefined))
    throw new CliUsageError('Slot options are only valid with add ui.')
  if (command === 'add' && addTarget !== 'tool' && addTarget !== 'command' && (name !== undefined || description !== undefined))
    throw new CliUsageError('Name and description options are only valid with add tool or add command.')
  if (command === 'add' && addTarget !== 'hook' && event !== undefined) throw new CliUsageError('--event is only valid with add hook.')
  if (help || version)
    return {
      ...(command === undefined ? {} : { command }),
      ...(inspectTarget === undefined ? {} : { inspectTarget }),
      ...(addTarget === undefined ? {} : { addTarget }),
      ...(cwd === undefined ? {} : { cwd }),
      ...(root === undefined ? {} : { root }),
      ...(slot === undefined ? {} : { slot }),
      ...(name === undefined ? {} : { name }),
      ...(description === undefined ? {} : { description }),
      ...(event === undefined ? {} : { event }),
      ...(provider === undefined ? {} : { provider }),
      ...(file === undefined ? {} : { file }),
      ...(id === undefined ? {} : { id }),
      ...(order === undefined ? {} : { order }),
      verbose,
      json,
      open,
      dryRun,
      fix,
      help,
      version,
    }
  if (command === undefined) throw new CliUsageError('A command is required: build, check, dev, inspect, or add.')
  return {
    command,
    ...(inspectTarget === undefined ? {} : { inspectTarget }),
    ...(addTarget === undefined ? {} : { addTarget }),
    ...(cwd === undefined ? {} : { cwd }),
    ...(root === undefined ? {} : { root }),
    ...(slot === undefined ? {} : { slot }),
    ...(name === undefined ? {} : { name }),
    ...(description === undefined ? {} : { description }),
    ...(event === undefined ? {} : { event }),
    ...(provider === undefined ? {} : { provider }),
    ...(file === undefined ? {} : { file }),
    ...(id === undefined ? {} : { id }),
    ...(order === undefined ? {} : { order }),
    verbose,
    json,
    open,
    dryRun,
    fix,
    help,
    version,
  }
}
