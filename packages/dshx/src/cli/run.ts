import type { DshxDiagnostic } from '../diagnostics.js'
import { resolveDshxConfig } from '../config/resolve.js'
import type { ResolvedDshxConfig } from '../config/types.js'
import { CliUsageError, parseCliArgs, type CliArgs } from './args.js'
import type { CliRunOptions } from './context.js'
import { addFailureEnvelope, runAdd } from './commands/add.js'
import { runBuild } from './commands/build.js'
import { checkFailureEnvelope, runCheck } from './commands/check.js'
import { runDev } from './commands/dev.js'
import { inspectFailureEnvelope, runInspect } from './commands/inspect.js'
import { defaultIO, diagnosticFromError, printVerboseCause, write } from './presentation.js'
import { renderReport } from './report.js'
import { VERSION } from './version.js'

export type { CliIO, CliRunOptions, CliRuntime } from './context.js'

type CommandHandler = (args: CliArgs, options: CliRunOptions, project: ResolvedDshxConfig) => Promise<number>

const USAGE =
  'Usage: dshx <build|check|dev|inspect|add> [target] [options]\n\nOptions: --cwd <path> --verbose --help --version\ncheck/inspect/add: --json\ncheck: --runtime --fix --dry-run\ndev: --open --port <port>\ninspect targets: tools, services, events, configs\nadd targets: ui, tool, command, hook\nadd ui options: --slot <name> --provider <package> --file <path> --id <id> --order <integer> --dry-run\nadd tool options: --name <name> --description <text> --file <path> --dry-run\nadd command options: --name <name> --description <text> --file <path> --dry-run\nadd hook options: --event <name> --file <path> --dry-run\n'

function commandHandler(args: CliArgs): CommandHandler {
  if (args.command === 'build') return runBuild
  if (args.command === 'check') return runCheck
  if (args.command === 'inspect') return runInspect
  if (args.command === 'add') return runAdd
  return runDev
}

/**
 * The `--json` document a command reports when it fails before it has anything
 * to report, in the shape that command's callers already parse.
 */
function failureEnvelope(args: CliArgs, item: DshxDiagnostic): unknown {
  if (args.command === 'inspect') return inspectFailureEnvelope(args, item)
  if (args.command === 'add') return addFailureEnvelope(args, item)
  if (args.command === 'check') return checkFailureEnvelope(item)
  return { project: null, diagnostics: [item] }
}

function reportsJson(args: CliArgs): boolean {
  return args.json && (args.command === 'check' || args.command === 'inspect' || args.command === 'add')
}

export async function runCli(argv: readonly string[], options: CliRunOptions = {}): Promise<number> {
  const io = options.io ?? defaultIO()
  let args: CliArgs
  try {
    args = parseCliArgs(argv)
  } catch (error) {
    write(io.stderr, `error: ${error instanceof CliUsageError ? error.message : String(error)}\n`)
    write(io.stderr, 'Run "dshx --help" for usage.\n')
    return 2
  }
  if (args.help) {
    write(io.stdout, USAGE)
    return 0
  }
  if (args.version) {
    write(io.stdout, `${options.version ?? VERSION}\n`)
    return 0
  }
  try {
    const runtime = options.runtime ?? {}
    const project = await (runtime.resolveConfig ?? resolveDshxConfig)(
      args.cwd === undefined ? (options.cwd === undefined ? {} : { cwd: options.cwd }) : { cwd: args.cwd },
    )
    return await commandHandler(args)(args, options, project)
  } catch (error) {
    const item = diagnosticFromError(error)
    const code = renderReport(io, reportsJson(args), { code: 1, diagnostics: [item], json: failureEnvelope(args, item) })
    if (args.verbose) printVerboseCause(io, error)
    return code
  }
}
