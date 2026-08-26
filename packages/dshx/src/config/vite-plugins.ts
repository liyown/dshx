import type { Plugin, PluginOption } from 'vite'
import { DshxError } from '../diagnostics.js'

function pluginLabel(plugin: Plugin): string {
  return plugin.name.trim() === '' ? '<anonymous>' : plugin.name
}

async function flatten(value: PluginOption, output: Plugin[], seen: Set<unknown>): Promise<void> {
  const awaited = await value
  if (!awaited) return
  if (Array.isArray(awaited)) {
    if (seen.has(awaited)) throw new DshxError('DSHX1401', 'Vite plugin options contain a recursive array.')
    seen.add(awaited)
    for (const nested of awaited) await flatten(nested, output, seen)
    seen.delete(awaited)
    return
  }
  if (typeof awaited !== 'object' || typeof awaited.name !== 'string') {
    throw new DshxError('DSHX1401', 'vite.plugins contains a value that is not a Vite PluginOption.', {
      hint: 'Pass the result of a Vite plugin factory.',
    })
  }
  output.push(awaited)
}

/** Resolve native Vite PluginOption promises and nesting while retaining order and identity. */
export async function resolveVitePlugins(options: readonly PluginOption[] | undefined, watch = false): Promise<Plugin[]> {
  const plugins: Plugin[] = []
  for (const option of options ?? []) await flatten(option, plugins, new Set())
  if (watch) {
    const buildPlugins = plugins.filter(plugin => plugin.apply !== 'serve')
    if (plugins.length > 0 && buildPlugins.length === 0) {
      throw new DshxError('DSHX1402', `Vite plugin ${JSON.stringify(pluginLabel(plugins[0]!))} only applies to a dev server.`, {
        hint: 'dshx dev uses Vite build-watch; use a plugin that supports command: "build".',
      })
    }
    return buildPlugins
  }
  return plugins
}
