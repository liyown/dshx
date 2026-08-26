import { readFile, stat } from 'node:fs/promises'
import { isAbsolute, relative, resolve } from 'node:path'
import type { ResolvedDshxConfig } from '../config/types.js'
import type { DshxDiagnostic } from '../diagnostics.js'

interface PackageTarget {
  readonly field: string
  readonly target: string
}

function collectStrings(value: unknown, field: string, output: PackageTarget[]): void {
  if (typeof value === 'string') {
    output.push({ field, target: value })
    return
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => collectStrings(item, `${field}[${index}]`, output))
    return
  }
  if (typeof value !== 'object' || value === null) return
  for (const [key, nested] of Object.entries(value)) collectStrings(nested, `${field}.${key}`, output)
}

function diagnostic(config: ResolvedDshxConfig, target: PackageTarget, message: string, hint: string): DshxDiagnostic {
  return { code: 'DSHX4192', severity: 'error', message: `${target.field}: ${message}`, file: config.packageFile, hint }
}

/** Verify every publish-facing package target after build materializes artifacts. */
export async function checkPackageTargets(config: ResolvedDshxConfig): Promise<DshxDiagnostic[]> {
  let manifest: Record<string, unknown>
  try {
    const parsed: unknown = JSON.parse(await readFile(config.packageFile, 'utf8'))
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) throw new TypeError('package.json must contain an object')
    manifest = parsed as Record<string, unknown>
  } catch (error) {
    return [
      {
        code: 'DSHX4192',
        severity: 'error',
        message: `Cannot validate package targets: ${error instanceof Error ? error.message : String(error)}`,
        file: config.packageFile,
        hint: 'Restore a valid package.json, then rebuild.',
      },
    ]
  }

  const targets: PackageTarget[] = []
  collectStrings(manifest.main, 'main', targets)
  collectStrings(manifest.types, 'types', targets)
  collectStrings(manifest.bin, 'bin', targets)
  collectStrings(manifest.exports, 'exports', targets)
  const diagnostics: DshxDiagnostic[] = []
  const checked = new Set<string>()
  for (const target of targets) {
    const key = `${target.field}\0${target.target}`
    if (checked.has(key)) continue
    checked.add(key)
    const exportTarget = target.field === 'exports' || target.field.startsWith('exports.')
    if (target.target.includes('*') || (exportTarget && !target.target.startsWith('./'))) {
      diagnostics.push(
        diagnostic(
          config,
          target,
          `target ${JSON.stringify(target.target)} is not one concrete package-relative path.`,
          exportTarget
            ? 'Use a concrete export target beginning with "./" so DSHX can verify the packed artifact.'
            : 'Use a concrete package-relative path so DSHX can verify the packed artifact.',
        ),
      )
      continue
    }
    const file = resolve(config.root, target.target)
    const path = relative(config.root, file)
    if (path.startsWith('..') || isAbsolute(path)) {
      diagnostics.push(
        diagnostic(config, target, `target escapes the package root: ${JSON.stringify(target.target)}.`, 'Keep publish targets inside the plugin package.'),
      )
      continue
    }
    try {
      if (!(await stat(file)).isFile()) throw new TypeError('target is not a file')
    } catch {
      diagnostics.push(
        diagnostic(
          config,
          target,
          `target does not exist on disk: ${JSON.stringify(target.target)}.`,
          'Build the artifact or remove the stale package.json target before packing.',
        ),
      )
    }
  }
  return diagnostics
}
