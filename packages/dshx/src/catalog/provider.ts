import { DshxError } from '../diagnostics.js'
import type { DshxDiagnostic } from '../diagnostics.js'
import { resolveDshInstallation } from '../profile/orchestrator.js'
import type { ProfileOrchestratorOptions } from '../profile/types.js'
import { normalizeEvents, normalizeServices, normalizeSlots, normalizeTools } from '../inspect/provider.js'
import type { EventSummary, InspectTarget, ServiceSummary, SlotSummary, ToolSummary } from '../inspect/types.js'
import type { ResolvedDshxConfig } from '../config/types.js'
import type { CatalogItem, CatalogOptions, CatalogProvider, CatalogResult } from './types.js'

function diagnosticFromError(error: unknown, file: string, fallbackCode = 'DSHX3302'): DshxDiagnostic {
  if (error instanceof DshxError) {
    return {
      code: error.code,
      severity: 'error',
      message: error.message.replace(/^DSHX\d+\n\n/, ''),
      file: error.file ?? file,
      hint: error.hint ?? 'Fix the reported Catalog provider problem and try again.',
    }
  }
  return {
    code: fallbackCode,
    severity: 'error',
    message: error instanceof Error ? error.message : String(error),
    file,
    hint: 'Use --verbose to inspect the original static metadata provider error.',
  }
}

function unavailable(file: string): DshxDiagnostic {
  return {
    code: 'DSHX3301',
    severity: 'error',
    message: 'No verified offline Catalog metadata provider is available for this DSH compatibility adapter.',
    file,
    hint: 'Use dshx inspect with a running Composition, or install a DSHX adapter that exposes package metadata Catalogs.',
  }
}

function unsupported(file: string, target: InspectTarget): DshxDiagnostic {
  return {
    code: 'DSHX3301',
    severity: 'error',
    message: `The selected offline Catalog does not support target ${JSON.stringify(target)}.`,
    file,
    hint: 'Use a target declared by the active compatibility adapter, or use runtime inspect for live data.',
  }
}

function invalid(file: string, error: unknown): DshxDiagnostic {
  return {
    code: 'DSHX3303',
    severity: 'error',
    message: error instanceof Error ? error.message : String(error),
    file,
    hint: 'Use an official package-metadata provider and return a JSON-compatible summary array.',
  }
}

function profileOptions(options: CatalogOptions): ProfileOrchestratorOptions {
  return {
    ...(options.runner === undefined ? {} : { runner: options.runner }),
    ...(options.env === undefined ? {} : { env: options.env }),
    ...(options.executable === undefined ? {} : { executable: options.executable }),
  }
}

function methodFor(target: InspectTarget, provider: CatalogProvider): (() => Promise<readonly CatalogItem[]>) | undefined {
  if (target === 'slots') return async () => normalizeSlots(await provider.listSlots()) as readonly SlotSummary[]
  if (target === 'tools') return async () => normalizeTools(await provider.listTools()) as readonly ToolSummary[]
  if (target === 'services') return async () => normalizeServices(await provider.listServices()) as readonly ServiceSummary[]
  if (target === 'events') return async () => normalizeEvents(await provider.listEvents()) as readonly EventSummary[]
  return undefined
}

/** Read static package metadata without connecting to a running Composition. */
export async function catalogProjectCapabilities(
  project: ResolvedDshxConfig,
  target: InspectTarget,
  options: CatalogOptions = {},
): Promise<CatalogResult> {
  let dsh: Awaited<ReturnType<NonNullable<CatalogOptions['resolveDsh']>>> | undefined
  try {
    dsh = await (options.resolveDsh ?? resolveDshInstallation)(project, profileOptions(options))
  } catch (error) {
    return { profile: project.profile, target, source: 'offline', items: [], diagnostics: [diagnosticFromError(error, project.packageFile)] , cause: error }
  }
  const diagnostics = [...dsh.diagnostics]
  const capability = dsh.compatibility.catalog
  if (capability === undefined || capability.source !== 'package-metadata') {
    return { profile: project.profile, target, source: 'offline', items: [], diagnostics: [unavailable(project.packageFile), ...diagnostics], dsh }
  }
  if (!capability.targets.includes(target)) {
    return { profile: project.profile, target, source: 'offline', items: [], diagnostics: [unsupported(project.packageFile, target), ...diagnostics], dsh }
  }
  if (options.provider === undefined) {
    return { profile: project.profile, target, source: 'offline', items: [], diagnostics: [unavailable(project.packageFile), ...diagnostics], dsh }
  }
  const method = methodFor(target, options.provider)
  if (method === undefined) {
    return { profile: project.profile, target, source: 'offline', items: [], diagnostics: [unsupported(project.packageFile, target), ...diagnostics], dsh }
  }
  try {
    return { profile: project.profile, target, source: 'offline', items: await method(), diagnostics, dsh }
  } catch (error) {
    const diagnostic = error instanceof Error && /Catalog output must|Catalog field|Inspect output must|Inspect item/.test(error.message)
      ? invalid(project.packageFile, error)
      : diagnosticFromError(error, project.packageFile)
    return { profile: project.profile, target, source: 'offline', items: [], diagnostics: [diagnostic, ...diagnostics], cause: error, dsh }
  }
}
