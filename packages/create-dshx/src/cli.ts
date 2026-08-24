#!/usr/bin/env node
import { stdin, stdout, stderr } from 'node:process'
import { confirm as clackConfirm, isCancel, text as clackText } from '@clack/prompts'
import { defineCommand, parseArgs as parseCittyArgs } from 'citty'
import { createProject, packageVersion } from './create.js'
import type { CreateIO, PackageManager } from './types.js'

interface Args {
  readonly name?: string
  readonly cwd?: string
  readonly install: boolean
  readonly installExplicit: boolean
  readonly packageManager?: PackageManager
  readonly yes: boolean
  readonly help: boolean
  readonly version: boolean
}

const createArgs = {
  name: {
    type: 'positional',
    required: false,
    description: 'Project directory and package name.',
    valueHint: 'name',
  },
  cwd: {
    type: 'string',
    description: 'Create the project from this directory.',
    valueHint: 'path',
  },
  install: {
    type: 'boolean',
    default: true,
    description: 'Install dependencies after generation.',
    negativeDescription: 'Skip dependency installation.',
  },
  packageManager: {
    type: 'enum',
    options: ['pnpm', 'yarn', 'npm'] as string[],
    description: 'Use a specific package manager.',
    valueHint: 'name',
  },
  yes: {
    type: 'boolean',
    alias: 'y',
    description: 'Accept defaults without prompting.',
  },
  help: { type: 'boolean', alias: 'h', description: 'Show command help.' },
  version: {
    type: 'boolean',
    alias: 'V',
    description: 'Show the installed version.',
  },
} as const

/** Citty command metadata for the published create-dshx binary. */
export const createDshxCommand = defineCommand({
  meta: {
    name: 'create-dshx',
    description: 'Create a typed DeepSeek Harness plugin project.',
  },
  args: createArgs,
})

function parseArgs(argv: readonly string[]): Args {
  const install = argv.includes('--install')
  const noInstall = argv.includes('--no-install')
  if (install && noInstall) throw new Error('--install and --no-install cannot be combined.')
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]
    if (token === undefined || !token.startsWith('-')) continue
    if (['--install', '--no-install', '--yes', '-y', '--help', '-h', '--version', '-V'].includes(token)) continue
    if (token !== '--cwd' && token !== '--package-manager') throw new Error(`Unknown argument ${JSON.stringify(token)}.`)
    const value = argv[index + 1]
    if (value === undefined || value.startsWith('-')) throw new Error(`${token} requires a value.`)
    if (token === '--package-manager' && value !== 'pnpm' && value !== 'yarn' && value !== 'npm') {
      throw new Error('--package-manager must be pnpm, yarn, or npm.')
    }
    index += 1
  }
  const parsed = parseCittyArgs([...argv], createArgs)
  if (parsed._.length > 1) throw new Error('Only one project name may be specified.')
  return {
    ...(parsed.name === undefined ? {} : { name: parsed.name }),
    ...(parsed.cwd === undefined ? {} : { cwd: parsed.cwd }),
    install: parsed.install ?? true,
    installExplicit: install || noInstall,
    ...(parsed.packageManager === undefined ? {} : { packageManager: parsed.packageManager as PackageManager }),
    yes: parsed.yes ?? false,
    help: parsed.help ?? false,
    version: parsed.version ?? false,
  }
}

function printHelp(output: { write: (text: string) => void }): void {
  output.write('Usage: pnpm create dshx [name] [--cwd <path>] [--install|--no-install] [--yes] [--package-manager <pnpm|yarn|npm>]\n')
}

export async function runCreate(argv = process.argv.slice(2), io: CreateIO = {}): Promise<number> {
  const input = io.stdin ?? stdin
  const output = io.stdout ?? stdout
  const errorOutput = io.stderr ?? stderr
  const writeError = (text: string): void => {
    errorOutput.write(text)
  }
  let args: Args
  try {
    args = parseArgs(argv)
  } catch (error) {
    writeError(`${error instanceof Error ? error.message : String(error)}\n`)
    return 2
  }
  if (args.help) {
    printHelp(output)
    return 0
  }
  if (args.version) {
    output.write(`${packageVersion()}\n`)
    return 0
  }
  let name = args.name
  const interactive = Boolean(input.isTTY)
  if (name === undefined && interactive && !args.yes) {
    const answer = io.readLine === undefined ? await clackText({ message: 'Project name', input, output }) : await io.readLine('Project name: ')
    if (isCancel(answer)) {
      writeError('Operation cancelled.\n')
      return 130
    }
    name = answer.trim()
  }
  if (name === undefined || name === '') {
    writeError('A project name is required outside an interactive terminal.\n')
    return 2
  }
  let installDependencies = args.install
  if (args.install && interactive && !args.yes && !args.installExplicit) {
    if (io.confirm !== undefined) {
      installDependencies = await io.confirm('Install dependencies now?', true)
    } else if (io.readLine !== undefined) {
      const answer = (await io.readLine('Install dependencies now? [Y/n] ')).trim().toLowerCase()
      installDependencies = answer === '' || answer === 'y' || answer === 'yes'
    } else {
      const answer = await clackConfirm({
        message: 'Install dependencies now?',
        initialValue: true,
        input,
        output,
      })
      if (isCancel(answer)) {
        writeError('Operation cancelled.\n')
        return 130
      }
      installDependencies = answer
    }
  }
  const result = await createProject({
    name,
    ...(args.cwd === undefined ? {} : { cwd: args.cwd }),
    install: installDependencies,
    ...(args.packageManager === undefined ? {} : { packageManager: args.packageManager }),
  })
  for (const item of result.diagnostics) writeError(`${item.code} [${item.severity}] ${item.message}\n  file: ${item.file}\n  hint: ${item.hint}\n`)
  if (result.diagnostics.some((item) => item.severity === 'error')) return 1
  output.write(`Created ${result.packageId} in ${result.root}\n`)
  if (!result.installed) output.write(`Run your package manager's install command in ${result.root}.\n`)
  return 0
}

if (import.meta.url === `file://${process.argv[1]}`) process.exitCode = await runCreate()
