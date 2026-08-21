export type CliCommand = 'build' | 'check' | 'dev'

export interface CliArgs {
  readonly command?: CliCommand
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
    if (token === 'build' || token === 'check' || token === 'dev') {
      if (command !== undefined) throw new CliUsageError('Only one command may be specified.')
      command = token
      continue
    }
    throw new CliUsageError(`Unknown argument ${JSON.stringify(token)}.`)
  }

  if (json && command !== undefined && command !== 'check') throw new CliUsageError('--json is only valid with check.')
  if (open && command !== undefined && command !== 'dev') throw new CliUsageError('--open is only valid with dev.')
  if ((json || open) && command === undefined) throw new CliUsageError('An option requires a command.')
  if (help || version) return {
    ...(command === undefined ? {} : { command }),
    ...(cwd === undefined ? {} : { cwd }),
    verbose, json, open, help, version,
  }
  if (command === undefined) throw new CliUsageError('A command is required: build, check, or dev.')
  return { command, ...(cwd === undefined ? {} : { cwd }), verbose, json, open, help, version }
}
