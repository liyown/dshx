import { realpath } from 'node:fs/promises'
import { isAbsolute } from 'node:path'
import { DEFAULT_COMPATIBILITY, classifyCompatibility } from '../compat/index.js'
import { DshxError } from '../diagnostics.js'
import type { DshxDiagnostic } from '../diagnostics.js'
import { runProjectDsh } from './command.js'
import type {
  DshCommandResult,
  DshCommandRunner,
  PreparedProjectProfile,
  ProfileOrchestratorOptions,
  ProfileProject,
  ProjectProfileLink,
  ResolvedDshInstallation,
} from './types.js'

const VERSION_TIMEOUT_MS = 15_000
const INSPECT_TIMEOUT_MS = 30_000
const ADD_TIMEOUT_MS = 120_000
const VERSION_PATTERN = /^v?(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?)$/
const DSH_NOT_FOUND_PATTERN = /(?:command ["']?dsh["']? not found|dsh: (?:command )?not found|not recognized as an internal or external command)/i

interface InstalledDependency {
  packageId: string
  path: string
}

function runnerOf(options: ProfileOrchestratorOptions): DshCommandRunner {
  return options.runner ?? runProjectDsh
}

function environmentOf(options: ProfileOrchestratorOptions): NodeJS.ProcessEnv {
  return { ...process.env, ...options.env }
}

function commandDetail(result: DshCommandResult): string {
  const detail = result.stderr.trim() || result.stdout.trim()
  return detail === '' ? `exit code ${result.exitCode ?? 'unknown'}` : detail.slice(0, 2_000)
}

function isDshMissing(result: DshCommandResult): boolean {
  return result.failureCode === 'ENOENT'
    || (result.exitCode === undefined && result.stdout.trim() === '' && result.stderr.trim() === '')
    || DSH_NOT_FOUND_PATTERN.test(result.stderr)
    || DSH_NOT_FOUND_PATTERN.test(result.stdout)
}

function validateProfileName(project: ProfileProject): void {
  const profile = project.profile
  if (profile.includes('/') || profile.includes('\\') || profile === '.' || profile === '..' || profile === 'node_modules') {
    throw new DshxError('DSHX4301', `Invalid DSH profile name ${JSON.stringify(profile)}.`, {
      file: project.configFile ?? project.packageFile,
      hint: 'Use a flat profile name such as "web", without path separators or reserved directory names.',
    })
  }
}

async function runDsh(
  project: ProfileProject,
  args: readonly string[],
  timeoutMs: number,
  options: ProfileOrchestratorOptions,
): Promise<DshCommandResult> {
  try {
    return await runnerOf(options)(args, {
      cwd: project.root,
      env: environmentOf(options),
      timeoutMs,
      ...(options.executable === undefined ? {} : { executable: options.executable }),
    })
  } catch (cause) {
    return { stdout: '', stderr: '', cause }
  }
}

/** Detect the project-local DSH CLI and select the compatibility adapter. */
export async function resolveDshInstallation(
  project: ProfileProject,
  options: ProfileOrchestratorOptions = {},
): Promise<ResolvedDshInstallation> {
  const result = await runDsh(project, ['--version'], VERSION_TIMEOUT_MS, options)
  if (result.exitCode !== 0) {
    if (isDshMissing(result)) {
      throw new DshxError('DSHX5001', 'No usable DSH CLI is available in the project or on PATH.', {
        cause: result.cause,
        file: project.packageFile,
        hint: 'Install @deepseek-ai/dsh as a project devDependency or make the official dsh command available on PATH.',
      })
    }
    throw new DshxError('DSHX5002', `Failed to read the installed DSH version: ${commandDetail(result)}`, {
      cause: result.cause,
      file: project.packageFile,
      hint: 'Run the project-local or PATH-resolved "dsh --version" command and fix the reported failure.',
    })
  }
  const match = VERSION_PATTERN.exec(result.stdout.trim())
  if (match?.[1] === undefined) {
    throw new DshxError('DSHX5002', `DSH returned an invalid version string: ${JSON.stringify(result.stdout.trim())}.`, {
      file: project.packageFile,
      hint: 'Ensure the resolved official dsh CLI prints one semantic version.',
    })
  }
  const version = match[1]
  const resolution = classifyCompatibility(version)
  if (resolution?.support === 'verified') {
    return {
      version,
      executable: result.executable ?? 'local',
      support: 'verified',
      adapterId: resolution.compatibility.id,
      protocolGeneration: resolution.compatibility.protocolGeneration,
      supportedRange: resolution.compatibility.dshRange,
      compatibility: resolution.compatibility,
      diagnostics: [],
    }
  }
  if (resolution?.support === 'compatible-range') {
    const diagnostic: DshxDiagnostic = {
      code: 'DSHX5101',
      severity: 'warning',
      message: `DSH ${version} is within the ${resolution.compatibility.protocolGeneration} compatibility range but has not been verified by DSHX; continuing with the ${resolution.compatibility.id} adapter.`,
      file: project.packageFile,
      hint: `Run the DSHX compatibility smoke tests for ${version}; use ${resolution.compatibility.verifiedVersions.join(', ')} for verified behavior.`,
    }
    return {
      version,
      executable: result.executable ?? 'local',
      support: 'compatible-range',
      adapterId: resolution.compatibility.id,
      protocolGeneration: resolution.compatibility.protocolGeneration,
      supportedRange: resolution.compatibility.dshRange,
      compatibility: resolution.compatibility,
      diagnostics: [diagnostic],
    }
  }
  if (!project.compatibility.allowUnsupported) {
    throw new DshxError('DSHX5101', `Unsupported DSH version ${JSON.stringify(version)}.`, {
      file: project.packageFile,
      hint: `Install a DSH version in ${DEFAULT_COMPATIBILITY.dshRange}, or set compatibility.allowUnsupported to true to continue at your own risk.`,
    })
  }
  const diagnostic: DshxDiagnostic = {
    code: 'DSHX5101',
    severity: 'warning',
    message: `DSH ${version} is outside the supported range ${DEFAULT_COMPATIBILITY.dshRange}; DSHX is continuing with the ${DEFAULT_COMPATIBILITY.id} adapter.`,
    file: project.packageFile,
    hint: `Use a DSH version in ${DEFAULT_COMPATIBILITY.dshRange} for verified behavior.`,
  }
  return {
    version,
    executable: result.executable ?? 'local',
    support: 'unsupported',
    adapterId: DEFAULT_COMPATIBILITY.id,
    protocolGeneration: DEFAULT_COMPATIBILITY.protocolGeneration,
    supportedRange: DEFAULT_COMPATIBILITY.dshRange,
    compatibility: DEFAULT_COMPATIBILITY,
    diagnostics: [diagnostic],
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

async function parseDependencies(
  project: ProfileProject,
  source: string,
): Promise<InstalledDependency[]> {
  let value: unknown
  try {
    value = JSON.parse(source)
  } catch (cause) {
    throw new DshxError('DSHX4302', 'DSH returned invalid JSON while inspecting the target profile.', {
      cause,
      file: project.packageFile,
      hint: `Run "pnpm exec dsh plugin --profile ${project.profile} list --depth 0 --json" and inspect its output.`,
    })
  }
  if (!Array.isArray(value) || value.length !== 1 || !isObject(value[0])) {
    throw new DshxError('DSHX4302', 'DSH returned an unexpected profile dependency document.', {
      file: project.packageFile,
      hint: 'Update DSHX or use the verified DSH version before linking this project.',
    })
  }
  const rawDependencies = value[0].dependencies
  if (rawDependencies === undefined) return []
  if (!isObject(rawDependencies)) {
    throw new DshxError('DSHX4302', 'The inspected profile dependencies must be an object.', {
      file: project.packageFile,
      hint: `Repair the profile through "pnpm exec dsh plugin --profile ${project.profile}" commands.`,
    })
  }
  return Promise.all(Object.entries(rawDependencies).map(async ([packageId, raw]) => {
    if (!isObject(raw) || typeof raw.path !== 'string' || raw.path.trim() === '' || !isAbsolute(raw.path)) {
      throw new DshxError('DSHX4302', `Profile dependency ${JSON.stringify(packageId)} has no valid resolved path.`, {
        file: project.packageFile,
        hint: `Remove and reinstall ${packageId} through the official dsh plugin command.`,
      })
    }
    const path = await realpath(raw.path).catch((cause: unknown) => {
      throw new DshxError('DSHX4302', `Profile dependency ${JSON.stringify(packageId)} points to a missing path: ${raw.path}`, {
        cause,
        file: project.packageFile,
        hint: `Remove and reinstall ${packageId} through the official dsh plugin command.`,
      })
    })
    return { packageId, path }
  }))
}

/** Inspect whether this exact package id and real project path are linked. */
export async function inspectProjectProfile(
  project: ProfileProject,
  options: ProfileOrchestratorOptions = {},
): Promise<ProjectProfileLink> {
  validateProfileName(project)
  const compatibility = options.compatibility ?? DEFAULT_COMPATIBILITY
  if (compatibility.profile.listCommand !== 'plugin-list-json') {
    throw new DshxError('DSHX4302', `The selected DSH adapter cannot inspect Profile ${JSON.stringify(project.profile)}.`, {
      file: project.packageFile,
      hint: 'Use a DSHX adapter that supports the official JSON Profile list command.',
    })
  }
  const args = ['plugin', '--profile', project.profile, 'list', '--depth', '0', '--json'] as const
  const result = await runDsh(project, args, INSPECT_TIMEOUT_MS, options)
  if (result.exitCode !== 0) {
    throw new DshxError('DSHX4302', `Failed to inspect DSH profile ${JSON.stringify(project.profile)}: ${commandDetail(result)}`, {
      cause: result.cause,
      file: project.packageFile,
      hint: `Run "pnpm exec dsh plugin --profile ${project.profile} list --depth 0 --json" and fix the reported failure.`,
    })
  }
  const dependencies = await parseDependencies(project, result.stdout)
  const desired = dependencies.find(dependency => dependency.packageId === project.packageId)
  const aliases = dependencies.filter(dependency => dependency.packageId !== project.packageId && dependency.path === project.root)
  if (desired !== undefined && desired.path !== project.root) {
    throw new DshxError(
      'DSHX4303',
      `Package ${JSON.stringify(project.packageId)} is already installed from another path: ${desired.path}`,
      {
        file: project.packageFile,
        hint: `Run "pnpm exec dsh plugin --profile ${project.profile} remove ${project.packageId}", then retry from this project.`,
      },
    )
  }
  if (aliases.length > 0) {
    const oldNames = aliases.map(dependency => dependency.packageId)
    throw new DshxError(
      'DSHX4303',
      `This project path is already linked under a different package name: ${oldNames.join(', ')}.`,
      {
        file: project.packageFile,
        hint: `Run "pnpm exec dsh plugin --profile ${project.profile} remove ${oldNames.join(' ')}", then retry.`,
      },
    )
  }
  return {
    state: desired === undefined ? 'absent' : 'linked',
    profile: project.profile,
    packageId: project.packageId,
    root: project.root,
  }
}

/** Ensure the project is linked once through the official DSH profile command. */
export async function ensureProjectProfile(
  project: ProfileProject,
  options: ProfileOrchestratorOptions = {},
): Promise<PreparedProjectProfile> {
  validateProfileName(project)
  const dsh = await resolveDshInstallation(project, options)
  const existing = await inspectProjectProfile(project, {
    ...options,
    compatibility: dsh.compatibility,
    ...(dsh.executable === undefined ? {} : { executable: dsh.executable }),
  })
  if (existing.state === 'linked') {
    return {
      profile: project.profile,
      packageId: project.packageId,
      root: project.root,
      dsh,
      link: 'existing',
      diagnostics: dsh.diagnostics,
    }
  }
  const result = await runDsh(
    project,
    ['plugin', '--profile', project.profile, 'add', project.root],
    ADD_TIMEOUT_MS,
    options,
  )
  if (result.exitCode !== 0) {
    throw new DshxError('DSHX4304', `Failed to link the project into DSH profile ${JSON.stringify(project.profile)}: ${commandDetail(result)}`, {
      cause: result.cause,
      file: project.packageFile,
      hint: `Run "pnpm exec dsh plugin --profile ${project.profile} add ${project.root}" and fix the reported failure.`,
    })
  }
  const installed = await inspectProjectProfile(project, {
    ...options,
    compatibility: dsh.compatibility,
    ...(dsh.executable === undefined ? {} : { executable: dsh.executable }),
  })
  if (installed.state !== 'linked') {
    throw new DshxError('DSHX4304', 'DSH reported a successful plugin add, but the project is still absent from the profile.', {
      file: project.packageFile,
      hint: `Inspect the profile with "pnpm exec dsh plugin --profile ${project.profile} list --depth 0 --json".`,
    })
  }
  return {
    profile: project.profile,
    packageId: project.packageId,
    root: project.root,
    dsh,
    link: 'added',
    diagnostics: dsh.diagnostics,
  }
}
