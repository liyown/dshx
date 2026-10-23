import { assessProjectCompatibility, detectInstalledDshVersion, projectCompatibilityDiagnostics } from '../compat/index.js'
import type { DshCompatibility, DshProjectCompatibilityAssessment } from '../compat/index.js'
import type { ResolvedDshxConfig } from '../config/types.js'
import type { DshxDiagnostic } from '../diagnostics.js'
import { checkMigrationDiagnostics, checkProjectManifest, typecheckProject } from '../project/index.js'
import type { ProjectTypecheckResult } from '../project/index.js'
import type { CliRuntime } from './context.js'

/**
 * The checks every command runs before it does its own work. `build` needs
 * all four, `check` needs all four, `dev` needs only the first two; nobody
 * hand-assembles them.
 */
export type PreflightStep = 'compatibility' | 'manifest' | 'migrations' | 'typecheck'

export interface PreflightInput {
  readonly project: ResolvedDshxConfig
  readonly runtime?: CliRuntime
  /** A DSH version the caller already resolved, such as the prepared profile's runtime. */
  readonly installedVersion?: string
  /** Defaults to every step. */
  readonly steps?: readonly PreflightStep[]
}

export interface PreflightResult {
  readonly installedVersion: string | undefined
  readonly assessment: DshProjectCompatibilityAssessment
  readonly compatibility: DshCompatibility
  readonly compatibilityDiagnostics: readonly DshxDiagnostic[]
  readonly manifestDiagnostics: readonly DshxDiagnostic[]
  readonly migrationDiagnostics: readonly DshxDiagnostic[]
  readonly typecheckDiagnostics: readonly DshxDiagnostic[]
  /** Every requested step's diagnostics, in the order above. */
  readonly diagnostics: readonly DshxDiagnostic[]
  readonly typecheck?: ProjectTypecheckResult
}

export async function preflight(
  input: PreflightInput & { readonly steps?: undefined },
): Promise<PreflightResult & { readonly typecheck: ProjectTypecheckResult }>
export async function preflight(input: PreflightInput): Promise<PreflightResult>
export async function preflight(input: PreflightInput): Promise<PreflightResult> {
  const runtime = input.runtime ?? {}
  const steps = new Set<PreflightStep>(input.steps ?? ['compatibility', 'manifest', 'migrations', 'typecheck'])
  const installedVersion = input.installedVersion ?? (runtime.detectInstalledDsh ?? detectInstalledDshVersion)(input.project.packageFile)
  const assessment = assessProjectCompatibility(input.project.manifest, installedVersion)
  const compatibility = assessment.compatibility
  const compatibilityDiagnostics = steps.has('compatibility')
    ? projectCompatibilityDiagnostics(assessment, input.project.packageFile, input.project.compatibility)
    : []
  const manifestDiagnostics = steps.has('manifest') ? await (runtime.checkManifest ?? checkProjectManifest)(input.project, { compatibility }) : []
  const migrationDiagnostics = steps.has('migrations') ? await (runtime.checkMigrations ?? checkMigrationDiagnostics)(input.project) : []
  const typecheck = steps.has('typecheck') ? await (runtime.typecheckProject ?? typecheckProject)(input.project.root) : undefined
  const typecheckDiagnostics = typecheck?.diagnostics ?? []
  return {
    installedVersion,
    assessment,
    compatibility,
    compatibilityDiagnostics,
    manifestDiagnostics,
    migrationDiagnostics,
    typecheckDiagnostics,
    diagnostics: [...compatibilityDiagnostics, ...manifestDiagnostics, ...migrationDiagnostics, ...typecheckDiagnostics],
    ...(typecheck === undefined ? {} : { typecheck }),
  }
}

/**
 * What the installed DSH version implies for a build, once preflight has
 * assessed it. Only `build` reports these: an unsupported install is fatal
 * there and a warning elsewhere.
 */
export function installedSupportDiagnostics(
  project: ResolvedDshxConfig,
  installed: string | undefined,
  assessment: DshProjectCompatibilityAssessment,
): DshxDiagnostic[] {
  const compatibility = assessment.compatibility
  const resolution = assessment.resolution
  if (installed === undefined) {
    return [
      {
        code: 'DSHX5101',
        severity: 'warning',
        message: 'No project-local @deepseek-ai/dsh package was found; build is using the declared/default compatibility adapter.',
        file: project.packageFile,
        hint: 'Install @deepseek-ai/dsh in devDependencies to make the build protocol deterministic.',
      },
    ]
  }
  if (resolution === undefined) {
    const severity = project.compatibility.allowUnsupported ? 'warning' : 'error'
    return [
      {
        code: 'DSHX5101',
        severity,
        message: `Installed DSH ${installed} is outside the supported compatibility ranges.`,
        file: project.packageFile,
        hint: project.compatibility.allowUnsupported
          ? `The ${compatibility.id} adapter will be used at your own risk.`
          : 'Install a DSH version supported by this DSHX release or set compatibility.allowUnsupported to true for a temporary override.',
      },
    ]
  }
  if (resolution.support === 'compatible' || resolution.support === 'experimental') {
    return [
      {
        code: 'DSHX5101',
        severity: 'warning',
        message:
          resolution.support === 'experimental'
            ? `Installed DSH ${installed} is an unverified prerelease in the ${compatibility.protocolGeneration} compatibility generation.`
            : `Installed DSH ${installed} is in the ${compatibility.protocolGeneration} compatibility generation but has not been verified by DSHX.`,
        file: project.packageFile,
        hint: `Verified boundaries are ${compatibility.verified.minimum} and ${compatibility.verified.latest}.`,
      },
    ]
  }
  return []
}
