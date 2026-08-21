export type CliCommand = 'build' | 'check' | 'dev' | 'inspect'
export type CliInspectTarget = 'slots' | 'tools'

export interface CliArgs {
  readonly command?: CliCommand
  readonly inspectTarget?: CliInspectTarget
  readonly cwd?: string
  readonly verbose: boolean
  readonly json: boolean
  readonly open: boolean
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
  let cwd: string | undefined
  let verbose = false
  let json = false
  let open = false
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
    if (token === '--cwd') {
      cwd = requireValue(argv, index, '--cwd')
      index += 1
      continue
    }
    if (token === 'build' || token === 'check' || token === 'dev' || token === 'inspect') {
      if (command !== undefined) throw new CliUsageError('Only one command may be specified.')
      command = token
      continue
    }
    if (token === 'slots' || token === 'tools') {
      if (inspectTarget !== undefined) throw new CliUsageError('Only one inspect target may be specified.')
      inspectTarget = token
      continue
    }
    throw new CliUsageError(`Unknown argument ${JSON.stringify(token)}.`)
  }

  if (json && command !== undefined && command !== 'check' && command !== 'inspect') throw new CliUsageError('--json is only valid with check or inspect.')
  if (open && command !== undefined && command !== 'dev') throw new CliUsageError('--open is only valid with dev.')
  if ((json || open) && command === undefined) throw new CliUsageError('An option requires a command.')
  if (command !== 'inspect' && inspectTarget !== undefined) throw new CliUsageError('Inspect targets are only valid with the inspect command.')
  if (command === 'inspect' && inspectTarget === undefined && !help && !version) throw new CliUsageError('Inspect requires a target: slots or tools.')
  if (help || version) return {
    ...(command === undefined ? {} : { command }),
    ...(inspectTarget === undefined ? {} : { inspectTarget }),
    ...(cwd === undefined ? {} : { cwd }),
    verbose, json, open, help, version,
  }
  if (command === undefined) throw new CliUsageError('A command is required: build, check, dev, or inspect.')
  return { command, ...(inspectTarget === undefined ? {} : { inspectTarget }), ...(cwd === undefined ? {} : { cwd }), verbose, json, open, help, version }
}
