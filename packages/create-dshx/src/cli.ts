#!/usr/bin/env node
import { createInterface } from 'node:readline/promises'
import { stdin, stdout, stderr } from 'node:process'
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

function parseArgs(argv: readonly string[]): Args {
  let name: string | undefined
  let cwd: string | undefined
  let install = true
  let installExplicit = false
  let packageManager: PackageManager | undefined
  let yes = false
  let help = false
  let version = false
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i]
    if (token === '--no-install' || token === '--install') {
      const nextInstall = token === '--install'
      if (installExplicit && install !== nextInstall) throw new Error('--install and --no-install cannot be combined.')
      install = nextInstall
      installExplicit = true
      continue
    }
    if (token === '--yes' || token === '-y') { yes = true; continue }
    if (token === '--help' || token === '-h') { help = true; continue }
    if (token === '--version' || token === '-V') { version = true; continue }
    if (token === '--cwd') {
      const value = argv[++i]
      if (value === undefined || value.startsWith('-')) throw new Error('--cwd requires a value.')
      cwd = value
      continue
    }
    if (token === '--package-manager') {
      const value = argv[++i]
      if (value !== 'pnpm' && value !== 'yarn' && value !== 'npm') throw new Error('--package-manager must be pnpm, yarn, or npm.')
      packageManager = value
      continue
    }
    if (token?.startsWith('-')) throw new Error(`Unknown argument ${JSON.stringify(token)}.`)
    if (name !== undefined) throw new Error('Only one project name may be specified.')
    name = token
  }
  return { ...(name === undefined ? {} : { name }), ...(cwd === undefined ? {} : { cwd }), install, installExplicit, ...(packageManager === undefined ? {} : { packageManager }), yes, help, version }
}

function printHelp(output: { write: (text: string) => void }): void {
  output.write('Usage: pnpm create dshx [name] [--cwd <path>] [--install|--no-install] [--yes] [--package-manager <pnpm|yarn|npm>]\n')
}

export async function runCreate(argv = process.argv.slice(2), io: CreateIO = {}): Promise<number> {
  const input = io.stdin ?? stdin
  const output = io.stdout ?? stdout
  const errorOutput = io.stderr ?? stderr
  const writeError = (text: string): void => { errorOutput.write(text) }
  let args: Args
  try { args = parseArgs(argv) } catch (error) { writeError(`${error instanceof Error ? error.message : String(error)}\n`); return 2 }
  if (args.help) { printHelp(output); return 0 }
  if (args.version) { output.write(`${packageVersion()}\n`); return 0 }
  let name = args.name
  const interactive = Boolean(input.isTTY)
  const rl = io.readLine === undefined && interactive ? createInterface({ input, output }) : undefined
  const readLine = io.readLine ?? (async (question: string): Promise<string> => rl?.question(question) ?? '')
  try {
    if (name === undefined && interactive && !args.yes) name = (await readLine('Project name: ')).trim()
    if (name === undefined || name === '') { writeError('A project name is required outside an interactive terminal.\n'); return 2 }
    let install = args.install
    if (args.install && interactive && !args.yes && !args.installExplicit) {
      const answer = (await readLine('Install dependencies now? [Y/n] ')).trim().toLowerCase()
      install = answer === '' || answer === 'y' || answer === 'yes'
    }
    const result = await createProject({ name, ...(args.cwd === undefined ? {} : { cwd: args.cwd }), install, ...(args.packageManager === undefined ? {} : { packageManager: args.packageManager }) })
    for (const item of result.diagnostics) writeError(`${item.code} [${item.severity}] ${item.message}\n  file: ${item.file}\n  hint: ${item.hint}\n`)
    if (result.diagnostics.some(item => item.severity === 'error')) return 1
    output.write(`Created ${result.packageId} in ${result.root}\n`)
    if (!result.installed) output.write(`Run your package manager's install command in ${result.root}.\n`)
    return 0
  } finally { rl?.close() }
}

if (import.meta.url === `file://${process.argv[1]}`) process.exitCode = await runCreate()
