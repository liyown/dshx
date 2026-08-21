import type { ResolvedDshxConfig } from '../config/types.js'
import { DshxError } from '../diagnostics.js'
import type { DshxDiagnostic } from '../diagnostics.js'
import { inspectProjectProfile, resolveDshInstallation } from '../profile/orchestrator.js'
import type { DshCommandResult, DshCommandRunner, ProfileOrchestratorOptions, ProjectProfileLink, ResolvedDshInstallation } from '../profile/types.js'
import type { InspectOptions, InspectProvider, InspectResult, InspectTarget, SlotSummary, ToolSummary } from './types.js'

const INSPECT_TIMEOUT_MS = 30_000

function diagnosticFromError(error: unknown, file: string, fallbackCode = 'DSHX3202') {
  if (error instanceof DshxError) {
    return { code: error.code, severity: 'error' as const, message: error.message.replace(/^DSHX\d+\n\n/, ''), file: error.file ?? file, hint: error.hint ?? 'Fix the reported runtime problem and try again.' }
  }
  return { code: fallbackCode, severity: 'error' as const, message: error instanceof Error ? error.message : String(error), file, hint: 'Run with --verbose to inspect the original provider error.' }
}

function unavailableProvider(file: string) {
  return { code: 'DSHX3201', severity: 'error' as const, message: 'No official DSH Runtime Inspect Provider is available to query from this process.', file, hint: 'Start a DSH composition with an exposed inspect provider, or use a DSH compatibility adapter that exposes cordisInspect.' }
}

function absentProfile(project: ResolvedDshxConfig) {
  return { code: 'DSHX3205', severity: 'error' as const, message: `Project ${JSON.stringify(project.packageId)} is not linked in profile ${JSON.stringify(project.profile)}.`, file: project.packageFile, hint: `Run "dshx dev" or "pnpm exec dsh plugin --profile ${project.profile} add ${project.root}" before inspecting the running composition.` }
}

function unsupportedTarget(file: string, target: InspectTarget) {
  return { code: 'DSHX3204', severity: 'error' as const, message: `The active DSH Inspect Provider does not support target ${JSON.stringify(target)}.`, file, hint: 'Use one of the targets supported by the active rc.8 provider: slots or tools.' }
}

function invalidProviderDto(file: string, error: unknown) {
  return {
    code: 'DSHX3203',
    severity: 'error' as const,
    message: error instanceof Error ? error.message : String(error),
    file,
    hint: 'Use an official runtime Inspect Provider and return the documented JSON-compatible Slot or Tool summary array.',
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function optionalString(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key]
  if (value === undefined) return undefined
  if (typeof value !== 'string') throw new Error(`Inspect field ${JSON.stringify(key)} must be a string when present.`)
  return value
}

function metadata(record: Record<string, unknown>, known: readonly string[]): Readonly<Record<string, unknown>> | undefined {
  const knownSet = new Set(known)
  const entries = Object.entries(record).filter(([key, value]) => !knownSet.has(key) && value !== undefined)
  return entries.length === 0 ? undefined : Object.fromEntries(entries)
}

export function normalizeSlots(value: unknown): readonly SlotSummary[] {
  if (!Array.isArray(value)) throw new Error('Slot Inspect output must be an array.')
  return value.map((entry, index) => {
    if (!isRecord(entry) || typeof entry.name !== 'string' || entry.name.trim() === '') throw new Error(`Slot Inspect item ${index} must contain a non-empty string name.`)
    const known = ['name', 'provider', 'kind', 'scope'] as const
    const provider = optionalString(entry, 'provider')
    const kind = optionalString(entry, 'kind')
    const scope = optionalString(entry, 'scope')
    const extra = metadata(entry, known)
    return {
      name: entry.name,
      ...(provider === undefined ? {} : { provider }),
      ...(kind === undefined ? {} : { kind }),
      ...(scope === undefined ? {} : { scope }),
      ...(extra === undefined ? {} : { metadata: extra }),
    }
  })
}

export function normalizeTools(value: unknown): readonly ToolSummary[] {
  if (!Array.isArray(value)) throw new Error('Tool Inspect output must be an array.')
  return value.map((entry, index) => {
    if (!isRecord(entry) || typeof entry.name !== 'string' || entry.name.trim() === '') throw new Error(`Tool Inspect item ${index} must contain a non-empty string name.`)
    const known = ['name', 'provider', 'description'] as const
    const provider = optionalString(entry, 'provider')
    const description = optionalString(entry, 'description')
    const extra = metadata(entry, known)
    return {
      name: entry.name,
      ...(provider === undefined ? {} : { provider }),
      ...(description === undefined ? {} : { description }),
      ...(extra === undefined ? {} : { metadata: extra }),
    }
  })
}

function profileOptions(options: InspectOptions): ProfileOrchestratorOptions {
  return {
    ...(options.runner === undefined ? {} : { runner: options.runner }),
    ...(options.env === undefined ? {} : { env: options.env }),
    ...(options.executable === undefined ? {} : { executable: options.executable }),
  }
}

/** Query a read-only provider without adding/removing Profile entries or writing files. */
export async function inspectProjectComposition(project: ResolvedDshxConfig, target: InspectTarget, options: InspectOptions = {}): Promise<InspectResult> {
  const diagnostics: DshxDiagnostic[] = []
  let dsh: ResolvedDshInstallation | undefined
  let profileLink: ProjectProfileLink | undefined
  try {
    dsh = await (options.resolveDsh ?? resolveDshInstallation)(project, profileOptions(options))
    diagnostics.push(...dsh.diagnostics)
    profileLink = await (options.inspectProfile ?? inspectProjectProfile)(project, {
      ...profileOptions(options),
      ...(dsh.executable === undefined ? {} : { executable: dsh.executable }),
    })
    if (profileLink.state === 'absent') return { profile: project.profile, target, source: 'runtime', items: [], diagnostics: [absentProfile(project), ...diagnostics], ...(dsh === undefined ? {} : { dsh }), profileLink }
  } catch (error) {
    return { profile: project.profile, target, source: 'runtime', items: [], diagnostics: [diagnosticFromError(error, project.packageFile)], cause: error, ...(dsh === undefined ? {} : { dsh }), ...(profileLink === undefined ? {} : { profileLink }) }
  }
  if (options.provider === undefined) return { profile: project.profile, target, source: 'runtime', items: [], diagnostics: [unavailableProvider(project.packageFile), ...diagnostics], ...(dsh === undefined ? {} : { dsh }), ...(profileLink === undefined ? {} : { profileLink }) }
  try {
    const method = target === 'slots' ? options.provider.listSlots : options.provider.listTools
    if (typeof method !== 'function') return { profile: project.profile, target, source: 'runtime', items: [], diagnostics: [unsupportedTarget(project.packageFile, target), ...diagnostics], ...(dsh === undefined ? {} : { dsh }), ...(profileLink === undefined ? {} : { profileLink }) }
    let raw: unknown
    try {
      raw = await method.call(options.provider)
    } catch (error) {
      return { profile: project.profile, target, source: 'runtime', items: [], diagnostics: [diagnosticFromError(error, project.packageFile), ...diagnostics], cause: error, ...(dsh === undefined ? {} : { dsh }), ...(profileLink === undefined ? {} : { profileLink }) }
    }
    let items: readonly SlotSummary[] | readonly ToolSummary[]
    try {
      items = target === 'slots' ? normalizeSlots(raw) : normalizeTools(raw)
    } catch (error) {
      return { profile: project.profile, target, source: 'runtime', items: [], diagnostics: [invalidProviderDto(project.packageFile, error), ...diagnostics], cause: error, ...(dsh === undefined ? {} : { dsh }), ...(profileLink === undefined ? {} : { profileLink }) }
    }
    return { profile: project.profile, target, source: 'runtime', items, diagnostics, ...(dsh === undefined ? {} : { dsh }), ...(profileLink === undefined ? {} : { profileLink }) }
  } catch (error) {
    return { profile: project.profile, target, source: 'runtime', items: [], diagnostics: [diagnosticFromError(error, project.packageFile), ...diagnostics], cause: error, ...(dsh === undefined ? {} : { dsh }), ...(profileLink === undefined ? {} : { profileLink }) }
  }
}
