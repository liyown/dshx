import type { ResolvedDshxConfig } from '../../config/types.js'
import type { DshxDiagnostic } from '../../diagnostics.js'
import { inspectProjectComposition } from '../../inspect/index.js'
import type { InspectResult, InspectTarget } from '../../inspect/index.js'
import { CliUsageError, type CliArgs } from '../args.js'
import type { CliRunOptions } from '../context.js'
import { defaultIO, hasErrors, printVerboseCause, write } from '../presentation.js'
import { renderReport } from '../report.js'

function inspectSummary(project: ResolvedDshxConfig, result: InspectResult): Record<string, unknown> {
  return {
    project: {
      root: project.root,
      packageId: project.packageId,
      profile: project.profile,
    },
    target: result.target,
    source: result.source,
    items: result.items,
    diagnostics: result.diagnostics,
  }
}

export async function runInspect(args: CliArgs, options: CliRunOptions, project: ResolvedDshxConfig): Promise<number> {
  const io = options.io ?? defaultIO()
  const runtime = options.runtime ?? {}
  const target = args.inspectTarget as InspectTarget | undefined
  // The parser guarantees this in normal CLI use; retaining the guard keeps the
  // injected runtime API safe for callers that construct CliArgs themselves.
  if (target === undefined) throw new CliUsageError('Inspect requires a target: tools, services, events, or configs.')
  const result = await (runtime.inspectComposition ?? inspectProjectComposition)(project, target, args.root === undefined ? {} : { slotRoot: args.root })
  const code = renderReport(io, args.json, {
    code: hasErrors(result.diagnostics) ? 1 : 0,
    diagnostics: result.diagnostics,
    json: inspectSummary(project, result),
    text: () => {
      write(io.stdout, `Inspect ${target} (${result.source}) for ${project.packageId}\n`)
      for (const item of result.items) write(io.stdout, `${itemLine(target, item, args.root !== undefined)}\n`)
    },
  })
  if (args.verbose && result.cause !== undefined) printVerboseCause(io, result.cause)
  return code
}

/** The document `--json` reports when `inspect` fails before it can query the composition. */
export function inspectFailureEnvelope(args: CliArgs, item: DshxDiagnostic): Record<string, unknown> {
  return { project: null, target: args.inspectTarget ?? null, source: 'runtime', items: [], diagnostics: [item] }
}

/** One composition item, in the words its target uses. */
function itemLine(target: InspectTarget, item: unknown, rootSlot: boolean): string {
  if (target === 'slots') {
    const slot = item as {
      readonly name: string
      readonly provider?: string
      readonly kind?: string
      readonly scope?: string
      readonly metadata?: Readonly<Record<string, unknown>>
    }
    const details = [slot.provider, slot.kind, slot.scope].filter((value): value is string => value !== undefined).join(' / ')
    const purpose = rootSlot && typeof slot.metadata?.purpose === 'string' ? slot.metadata.purpose : undefined
    return `  ${slot.name}${details === '' ? '' : ` (${details})`}${purpose === undefined ? '' : `: ${purpose}`}`
  }
  if (target === 'tools') {
    const tool = item as { readonly name: string; readonly provider?: string; readonly description?: string }
    const details = [tool.provider, tool.description].filter((value): value is string => value !== undefined).join(' - ')
    return `  ${tool.name}${details === '' ? '' : `: ${details}`}`
  }
  if (target === 'services') {
    const service = item as { readonly name: string; readonly provider?: string; readonly scope?: string }
    const details = [service.provider, service.scope].filter((value): value is string => value !== undefined).join(' / ')
    return `  ${service.name}${details === '' ? '' : ` (${details})`}`
  }
  if (target === 'configs') {
    const config = item as { readonly name: string; readonly provider?: string; readonly patchId?: string; readonly status?: string }
    const details = [config.provider, config.patchId, config.status].filter((value): value is string => value !== undefined).join(' / ')
    return `  ${config.name}${details === '' ? '' : ` (${details})`}`
  }
  const event = item as { readonly name: string; readonly provider?: string }
  return `  ${event.name}${event.provider === undefined ? '' : ` (${event.provider})`}`
}
