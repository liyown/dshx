import { createRequire } from 'node:module'
import type { DshCompatibility, DshxRuntimePluginSpec } from './compat/types.js'
import type { ResolvedDshxConfig } from './config/types.js'
import type { DshxDiagnostic } from './diagnostics.js'
import type { RuntimePluginStatus, RuntimePluginStatusKind } from './host/runtime-plugins.js'

export interface RuntimePluginReport {
  readonly plugins: readonly RuntimePluginStatus[]
  readonly diagnostics: readonly DshxDiagnostic[]
}

function packageStatus(spec: DshxRuntimePluginSpec, require: NodeRequire): { readonly status: RuntimePluginStatusKind; readonly message?: string } {
  try {
    require.resolve(spec.packageName)
    return { status: 'available' }
  } catch (error) {
    return { status: 'missing', message: error instanceof Error ? error.message : String(error) }
  }
}

/** Read adapter-approved runtime plugin availability without starting DSH. */
export function inspectRuntimePlugins(project: ResolvedDshxConfig, compatibility: DshCompatibility | undefined): RuntimePluginReport {
  const specs = compatibility?.runtimePlugins ?? []
  const require = createRequire(project.packageFile)
  const plugins: RuntimePluginStatus[] = []
  const diagnostics: DshxDiagnostic[] = []
  for (const spec of specs) {
    const result = packageStatus(spec, require)
    const plugin: RuntimePluginStatus = {
      id: spec.id,
      packageName: spec.packageName,
      provides: spec.provides,
      status: result.status,
      ...(result.message === undefined ? {} : { message: result.message }),
    }
    plugins.push(plugin)
    if (result.status === 'missing') {
      diagnostics.push({
        code: 'DSHX5102',
        severity: spec.optional ? 'warning' : 'error',
        message: `Runtime plugin ${JSON.stringify(spec.packageName)} is not installed or cannot be resolved from this project.`,
        file: project.packageFile,
        hint: `Install ${spec.packageName} in the project's devDependencies, then run the check again.`,
      })
    }
  }
  return { plugins, diagnostics }
}
