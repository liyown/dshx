export type CliCommand = 'build' | 'check' | 'dev' | 'inspect' | 'add'
export type CliInspectTarget = 'slots' | 'tools'
export type CliAddTarget = 'ui' | 'tool' | 'hook'

export interface CliArgs {
  readonly command?: CliCommand
  readonly inspectTarget?: CliInspectTarget
  readonly addTarget?: CliAddTarget
  readonly cwd?: string
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
  readonly help: boolean
  readonly version: boolean
}

export class CliUsageError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CliUsageError'
  }
}

function requireValue(argv: readonly string[], index: number, option: string): string {
  const value = argv[index + 1]
  if (value === undefined || value.startsWith('-')) throw new CliUsageError(`${option} requires a value.`)
  return value
}

/** Parse the small, intentionally stable DSHX command grammar. */
export function parseCliArgs(argv: readonly string[]): CliArgs {
  let command: CliCommand | undefined
  let inspectTarget: CliInspectTarget | undefined
  let addTarget: CliAddTarget | undefined
  let cwd: string | undefined
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
  let help = false
  let version = false

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]
    if (token === undefined) continue
    if (token === '--help' || token === '-h') { help = true; continue }
    if (token === '--version' || token === '-V') { version = true; continue }
    if (token === '--verbose') { verbose = true; continue }
    if (token === '--json') { json = true; continue }
    if (token === '--open') { open = true; continue }
    if (token === '--dry-run') { dryRun = true; continue }
    if (token === '--cwd') {
      cwd = requireValue(argv, index, '--cwd')
      index += 1
      continue
    }
    if (token === '--slot' || token === '--provider' || token === '--file' || token === '--id' || token === '--name' || token === '--description' || token === '--event') {
      const value = requireValue(argv, index, token)
      if (token === '--slot') slot = value
      else if (token === '--provider') provider = value
      else if (token === '--file') file = value
      else if (token === '--id') id = value
      else if (token === '--name') name = value
      else if (token === '--description') description = value
      else event = value
      index += 1
      continue
    }
    if (token === '--order') {
      const value = requireValue(argv, index, '--order')
      const parsed = Number(value)
      if (!Number.isInteger(parsed)) throw new CliUsageError('--order requires an integer value.')
      order = parsed
      index += 1
      continue
    }
    if (token === 'build' || token === 'check' || token === 'dev' || token === 'inspect' || token === 'add') {
      if (command !== undefined) throw new CliUsageError('Only one command may be specified.')
      command = token
      continue
    }
    if (token === 'slots' || token === 'tools') {
      if (inspectTarget !== undefined) throw new CliUsageError('Only one inspect target may be specified.')
      inspectTarget = token
      continue
    }
    if (token === 'ui' || token === 'tool') {
      if (addTarget !== undefined) throw new CliUsageError('Only one add target may be specified.')
      addTarget = token
      continue
    }
    throw new CliUsageError(`Unknown argument ${JSON.stringify(token)}.`)
  }

  if (json && command !== undefined && command !== 'check' && command !== 'inspect' && command !== 'add') throw new CliUsageError('--json is only valid with check, inspect, or add.')
  if (open && command !== undefined && command !== 'dev') throw new CliUsageError('--open is only valid with dev.')
  if (dryRun && command !== 'add') throw new CliUsageError('--dry-run is only valid with add commands.')
  if ((slot !== undefined || provider !== undefined || id !== undefined || order !== undefined) && command !== 'add') throw new CliUsageError('add ui options are only valid with add ui.')
  if ((name !== undefined || description !== undefined) && command !== 'add') throw new CliUsageError('add tool options are only valid with add tool.')
  if (event !== undefined && command !== 'add') throw new CliUsageError('--event is only valid with add hook.')
  if ((json || open) && command === undefined) throw new CliUsageError('An option requires a command.')
  if (command !== 'inspect' && inspectTarget !== undefined) throw new CliUsageError('Inspect targets are only valid with the inspect command.')
  if (command !== 'add' && addTarget !== undefined) throw new CliUsageError('Add targets are only valid with the add command.')
  if (command === 'inspect' && inspectTarget === undefined && !help && !version) throw new CliUsageError('Inspect requires a target: slots or tools.')
  if (command === 'add' && addTarget === undefined && !help && !version) throw new CliUsageError('Add requires a target: ui, tool, or hook.')
  if (command === 'add' && addTarget !== 'ui' && addTarget !== 'tool' && addTarget !== 'hook') throw new CliUsageError('Only add ui, add tool, and add hook are supported.')
  if (help || version) return {
    ...(command === undefined ? {} : { command }),
    ...(inspectTarget === undefined ? {} : { inspectTarget }),
    ...(addTarget === undefined ? {} : { addTarget }),
    ...(cwd === undefined ? {} : { cwd }),
    ...(slot === undefined ? {} : { slot }),
    ...(name === undefined ? {} : { name }),
    ...(description === undefined ? {} : { description }),
    ...(event === undefined ? {} : { event }),
    ...(provider === undefined ? {} : { provider }),
    ...(file === undefined ? {} : { file }),
    ...(id === undefined ? {} : { id }),
    ...(order === undefined ? {} : { order }),
    verbose, json, open, dryRun, help, version,
  }
  if (command === undefined) throw new CliUsageError('A command is required: build, check, dev, inspect, or add.')
  return {
    command,
    ...(inspectTarget === undefined ? {} : { inspectTarget }),
    ...(addTarget === undefined ? {} : { addTarget }),
    ...(cwd === undefined ? {} : { cwd }),
    ...(slot === undefined ? {} : { slot }),
    ...(name === undefined ? {} : { name }),
    ...(description === undefined ? {} : { description }),
    ...(event === undefined ? {} : { event }),
    ...(provider === undefined ? {} : { provider }),
    ...(file === undefined ? {} : { file }),
    ...(id === undefined ? {} : { id }),
    ...(order === undefined ? {} : { order }),
    verbose, json, open, dryRun, help, version,
  }
}
