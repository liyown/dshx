import type { DshProjectCompatibilityAssessment } from '../compat/index.js'
import type { ResolvedDshxConfig } from '../config/types.js'
import type { DshxDiagnostic } from '../diagnostics.js'
import type { ResolvedDshInstallation } from '../profile/types.js'
import type { CliIO } from './context.js'
import { printDiagnostics, write } from './presentation.js'

/**
 * What a command reports: one JSON document, the diagnostics it already
 * rendered into that document, and the exit code both forms agree on. The
 * command supplies the envelope; only this module decides which of the two
 * forms reaches the terminal.
 */
export interface CommandReport {
  readonly code: number
  readonly diagnostics: readonly DshxDiagnostic[]
  readonly json: unknown
  /** Extra lines after the diagnostics, in text mode only. */
  readonly text?: () => void
}

export function renderReport(io: CliIO, asJson: boolean, report: CommandReport): number {
  if (asJson) {
    write(io.stdout, `${JSON.stringify(report.json, null, 2)}\n`)
    return report.code
  }
  printDiagnostics(io, report.diagnostics)
  report.text?.()
  return report.code
}

export function projectSummary(project: ResolvedDshxConfig): Record<string, unknown> {
  return {
    root: project.root,
    packageId: project.packageId,
    name: project.name,
    profile: project.profile,
    hostEntry: project.hostEntry,
    clientEntry: project.clientEntry,
    outDir: project.outDir,
  }
}

export function installationSummary(dsh: ResolvedDshInstallation | undefined): Record<string, unknown> | null {
  if (dsh === undefined) return null
  return {
    version: dsh.version,
    executable: dsh.executable ?? null,
    support: dsh.support,
    adapterId: dsh.adapterId,
    protocolGeneration: dsh.protocolGeneration,
    supportedRange: dsh.supportedRange,
    compatibility: dsh.compatibility,
    diagnostics: dsh.diagnostics,
  }
}

export function compatibilitySummary(assessment: DshProjectCompatibilityAssessment, dshxVersion: string): Record<string, unknown> {
  const support = assessment.installedVersion === undefined ? null : (assessment.resolution?.support ?? 'unsupported')
  return {
    dshxVersion,
    declaredRange: assessment.declaredRange ?? null,
    developmentSpecifier: assessment.developmentSpecifier ?? null,
    installedVersion: assessment.installedVersion ?? null,
    installedWithinDeclaredRange: assessment.installedWithinDeclaredRange ?? null,
    rangeStatus: assessment.rangeAnalysis?.status ?? 'missing',
    support,
    adapterId: assessment.compatibility.id,
    protocolGeneration: assessment.compatibility.protocolGeneration,
    lifecycle: assessment.compatibility.lifecycle,
    supportedRange: assessment.compatibility.dshRange,
    capabilities: assessment.capabilities,
  }
}
