import type { Context, Plugin } from '@deepseek-ai/cordis'
import type { DshCompatibility, DshxRuntimePluginSpec } from '../compat/types.js'

export interface RuntimePluginDiagnostic {
  readonly pluginId: string
  readonly packageName: string
  readonly message: string
  readonly cause?: unknown
}

export interface RuntimePluginState {
  readonly loaded: readonly string[]
  readonly skipped: readonly string[]
  readonly diagnostics: readonly RuntimePluginDiagnostic[]
}

interface InspectRegistry {
  list?: () => readonly { id?: unknown }[]
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function hasCapability(ctx: Context, capability: string): boolean {
  if (ctx.get(capability) !== undefined) return true
  if (capability === 'Service' || capability === 'Event') {
    const registry = ctx.get('cordisInspect') as InspectRegistry | undefined
    return registry?.list?.().some(entry => entry.id === capability) === true
  }
  return false
}

async function loadOfficialPlugin(packageName: string, load: DshxRuntimePluginSpec['load']): Promise<unknown> {
  if (packageName === '@deepseek-ai/dsh-cordis-host-runner') {
    const module = await import('@deepseek-ai/dsh-cordis-host-runner')
    return load === 'default' ? module.default : module
  }
  if (packageName === '@deepseek-ai/dsh-tool-cordis') {
    return await import('@deepseek-ai/dsh-tool-cordis')
  }
  throw new Error(`Runtime plugin ${JSON.stringify(packageName)} is not allowed by the active DSH adapter.`)
}

/** Mount adapter-approved runtime plugins without exposing arbitrary package loading. */
export async function loadRuntimePlugins(
  ctx: Context,
  compatibility: DshCompatibility | undefined,
): Promise<RuntimePluginState> {
  const specs = compatibility?.runtimePlugins ?? []
  const loaded: string[] = []
  const skipped: string[] = []
  const diagnostics: RuntimePluginDiagnostic[] = []
  for (const spec of specs) {
    if (spec.provides.every(capability => hasCapability(ctx, capability))) {
      skipped.push(spec.id)
      continue
    }
    try {
      const plugin = await loadOfficialPlugin(spec.packageName, spec.load)
      const fiber = ctx.plugin(plugin as Plugin)
      const awaitFiber = (fiber as { await?: () => Promise<unknown> } | undefined)?.await
      if (typeof awaitFiber === 'function') await awaitFiber.call(fiber)
      loaded.push(spec.id)
    } catch (cause) {
      diagnostics.push({ pluginId: spec.id, packageName: spec.packageName, message: errorMessage(cause), cause })
      if (!spec.optional) throw cause
    }
  }

  return { loaded, skipped, diagnostics }
}
