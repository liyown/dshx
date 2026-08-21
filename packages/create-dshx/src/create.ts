import { join, resolve } from 'node:path'
import { createRequire } from 'node:module'
import { defaultFileSystem } from './fs.js'
import { commandAvailable, defaultCommandRunner, installCommand } from './command.js'
import { renderTemplate, TEMPLATE_FILES } from './templates.js'
import type { CommandRunner, CreateDiagnostic, CreateProjectOptions, CreateProjectResult, FileSystem, PackageManager } from './types.js'

export interface CreateDependencies {
  readonly fs?: FileSystem
  readonly runner?: CommandRunner
  readonly dshxVersion?: string
  readonly dshVersion?: string
}

const NAME_RE = /^[a-z0-9](?:[a-z0-9._-]*[a-z0-9_-])?$/
const require = createRequire(import.meta.url)

export function packageVersion(): string {
  try {
    const manifest = require('../package.json') as { version?: unknown }
    if (typeof manifest.version === 'string' && manifest.version !== '') return manifest.version
  } catch { /* package metadata may be unavailable in source-only environments */ }
  return '0.1.0'
}

function diagnostic(code: `DSHX${number}`, message: string, file: string, hint: string, cause?: unknown): CreateDiagnostic {
  return { code, severity: 'error', message, file, hint, ...(cause === undefined ? {} : { cause }) }
}

export function validateProjectName(name: string): CreateDiagnostic | undefined {
  if (!NAME_RE.test(name) || name.length > 214 || name.startsWith('.') || name.endsWith('.')) {
    return diagnostic('DSHX6001', `Invalid project name ${JSON.stringify(name)}.`, name, 'Use a non-scoped npm package name containing lowercase letters, numbers, dots, hyphens, or underscores.')
  }
  return undefined
}

async function packageManagerFromProject(root: string, fs: FileSystem): Promise<PackageManager | undefined> {
  if (await fs.exists(join(root, 'pnpm-lock.yaml'))) return 'pnpm'
  if (await fs.exists(join(root, 'yarn.lock'))) return 'yarn'
  if (await fs.exists(join(root, 'package-lock.json'))) return 'npm'
  if (await fs.exists(join(root, 'package.json'))) {
    try {
      const parsed = JSON.parse(await fs.readFile(join(root, 'package.json'))) as { packageManager?: unknown }
      if (typeof parsed.packageManager === 'string') {
        const manager = parsed.packageManager.split('@')[0]
        if (manager === 'pnpm' || manager === 'yarn' || manager === 'npm') return manager
      }
    } catch { /* the generated project has no metadata yet */ }
  }
  return undefined
}

export async function detectPackageManager(root: string, fs: FileSystem = defaultFileSystem, runner: CommandRunner = defaultCommandRunner): Promise<PackageManager | undefined> {
  const projectManager = await packageManagerFromProject(root, fs)
  if (projectManager !== undefined) return projectManager
  for (const manager of ['pnpm', 'yarn', 'npm'] as const) {
    if (await commandAvailable(manager, runner)) return manager
  }
  return undefined
}

export async function createProject(options: CreateProjectOptions, dependencies: CreateDependencies = {}): Promise<CreateProjectResult> {
  const fs = dependencies.fs ?? defaultFileSystem
  const runner = dependencies.runner ?? defaultCommandRunner
  const root = resolve(options.cwd ?? process.cwd(), options.name)
  const nameError = validateProjectName(options.name)
  if (nameError !== undefined) return { root, packageId: options.name, files: [], installed: false, diagnostics: [nameError] }
  if (await fs.exists(root)) {
    return { root, packageId: options.name, files: [], installed: false, diagnostics: [diagnostic('DSHX6002', `Target directory already exists: ${root}.`, root, 'Choose a new directory or remove the existing project before creating a new one.')] }
  }

  const context = {
    packageId: options.name,
    dshxVersion: dependencies.dshxVersion ?? options.dshxVersion ?? packageVersion(),
    dshVersion: dependencies.dshVersion ?? options.dshVersion ?? '>=0.1.0-rc.8 <0.2.0',
  }
  const files: string[] = []
  try {
    await fs.mkdir(root)
    for (const file of TEMPLATE_FILES) {
      const target = join(root, file)
      await fs.mkdir(resolve(target, '..'))
      await fs.writeFile(target, renderTemplate(file, context))
      files.push(target)
    }
  } catch (error) {
    return { root, packageId: options.name, files, installed: false, diagnostics: [diagnostic('DSHX6003', error instanceof Error ? error.message : String(error), root, 'Fix filesystem permissions and run the generator again in a new directory.', error)] }
  }

  if (options.install === false) return { root, packageId: options.name, files, installed: false, diagnostics: [] }
  const manager = options.packageManager ?? await detectPackageManager(root, fs, runner)
  if (manager === undefined) return { root, packageId: options.name, files, installed: false, diagnostics: [diagnostic('DSHX6005', 'No supported package manager was found.', root, 'Install pnpm, yarn, or npm, then run the install command in the generated project.')] }
  const command = installCommand(manager)
  const result = await runner(command.command, command.args, { cwd: root })
  if (result.exitCode !== 0) return { root, packageId: options.name, files, packageManager: manager, installed: false, diagnostics: [diagnostic('DSHX6004', `Dependency installation failed with ${manager}.`, root, `Run "${manager} install" in the generated project and retry.`, result)] }
  return { root, packageId: options.name, files, packageManager: manager, installed: true, diagnostics: [] }
}
