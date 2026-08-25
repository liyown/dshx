import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { parse } from 'yaml'
import { DEFAULT_COMPATIBILITY } from '../compat/index.js'
import type { DshCompatibility } from '../compat/types.js'
import { clientUsesSettings } from '../compiler/client/capabilities.js'
import type { ResolvedDshxConfig } from '../config/types.js'
import type { DshxDiagnostic, DshxDiagnosticSeverity } from '../diagnostics.js'

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function issue(code: string, severity: DshxDiagnosticSeverity, message: string, file: string, hint: string): DshxDiagnostic {
  return { code, severity, message, file, hint }
}

function conditionalTarget(value: unknown): string | undefined {
  if (typeof value === 'string') return value
  if (isObject(value) && typeof value.default === 'string') return value.default
  return undefined
}

function exportTarget(exportsField: unknown, subpath: string): string | undefined {
  if (subpath === '.' && (typeof exportsField === 'string' || (isObject(exportsField) && 'default' in exportsField))) {
    return conditionalTarget(exportsField)
  }
  if (!isObject(exportsField)) return undefined
  return conditionalTarget(exportsField[subpath])
}

function checkExport(diagnostics: DshxDiagnostic[], exportsField: unknown, subpath: string, expected: string, code: string, file: string): void {
  const actual = exportTarget(exportsField, subpath)
  if (actual === expected) return
  diagnostics.push(
    issue(
      code,
      'error',
      `package.json exports[${JSON.stringify(subpath)}] must resolve to ${JSON.stringify(expected)}.`,
      file,
      actual === undefined ? 'Add the required package export.' : `Replace ${JSON.stringify(actual)} with ${JSON.stringify(expected)}.`,
    ),
  )
}

function checkStringArray(diagnostics: DshxDiagnostic[], value: unknown, field: string, code: string, file: string): string[] | undefined {
  if (value === undefined) return []
  if (!Array.isArray(value)) {
    diagnostics.push(issue(code, 'error', `${field} must be an array of strings.`, file, `Set ${field} to an array, or use [] when it has no entries.`))
    return undefined
  }
  const valid: string[] = []
  let invalid = false
  for (const item of value) {
    if (typeof item !== 'string' || item.trim() === '' || item !== item.trim()) invalid = true
    else valid.push(item)
  }
  if (invalid) {
    diagnostics.push(
      issue(
        code,
        'error',
        `${field} entries must be non-empty strings without surrounding whitespace.`,
        file,
        'Remove non-string and empty entries, and trim surrounding whitespace.',
      ),
    )
  }
  const duplicates = [...new Set(valid.filter((item, index) => valid.indexOf(item) !== index))]
  if (duplicates.length > 0) {
    diagnostics.push(
      issue(code, 'error', `${field} contains duplicate entries: ${duplicates.join(', ')}.`, file, 'Keep each package or module request only once.'),
    )
  }
  return invalid ? undefined : valid
}

async function checkPatch(diagnostics: DshxDiagnostic[], root: string, packageFile: string): Promise<void> {
  const patchFile = resolve(root, 'cordis.patch.yml')
  let source: string
  try {
    source = await readFile(patchFile, 'utf8')
  } catch {
    diagnostics.push(
      issue(
        'DSHX4123',
        'error',
        'The declared bundle patch cordis.patch.yml does not exist.',
        packageFile,
        'Create cordis.patch.yml with a top-level YAML array.',
      ),
    )
    return
  }
  let value: unknown
  try {
    value = parse(source)
  } catch (error) {
    diagnostics.push(
      issue(
        'DSHX4124',
        'error',
        `cordis.patch.yml is not valid YAML: ${error instanceof Error ? error.message : String(error)}`,
        patchFile,
        'Fix the YAML syntax and keep patch operations in a top-level array.',
      ),
    )
    return
  }
  if (!Array.isArray(value)) {
    diagnostics.push(
      issue(
        'DSHX4124',
        'error',
        'cordis.patch.yml must contain a top-level YAML array.',
        patchFile,
        'Prefix each patch operation with "-" so the document root is an array.',
      ),
    )
  }
}

function checkPublishingHints(diagnostics: DshxDiagnostic[], manifest: Record<string, unknown>, file: string): void {
  if (manifest.main !== './dist/index.js') {
    diagnostics.push(
      issue(
        'DSHX4190',
        'warning',
        'package.json main should point to "./dist/index.js" for legacy Node resolution.',
        file,
        'Set main to "./dist/index.js" before publishing.',
      ),
    )
  }
  const files = Array.isArray(manifest.files)
    ? manifest.files.filter((value): value is string => typeof value === 'string').map(value => value.replace(/^\.\//, '').replace(/\/$/, ''))
    : []
  const missing = ['dist', 'cordis.patch.yml'].filter(value => !files.includes(value))
  if (missing.length > 0) {
    diagnostics.push(
      issue(
        'DSHX4191',
        'warning',
        `package.json files should include: ${missing.join(', ')}.`,
        file,
        'Published packages need both compiled artifacts and the bundle patch.',
      ),
    )
  }
}

function checkClient(diagnostics: DshxDiagnostic[], config: ResolvedDshxConfig, manifest: Record<string, unknown>, compatibility: DshCompatibility): void {
  const file = config.packageFile
  const dsh = isObject(manifest.dsh) ? manifest.dsh : undefined
  const declaration = dsh?.client
  if (config.clientEntry === undefined) {
    if (declaration !== undefined) {
      diagnostics.push(
        issue(
          'DSHX4201',
          'error',
          'Client is disabled but package.json still declares dsh.client.',
          file,
          'Enable a Client entry or remove dsh.client so DSH does not load a missing bundle.',
        ),
      )
    }
    return
  }

  checkExport(diagnostics, manifest.exports, './client', './dist/client.js', 'DSHX4210', file)
  if (!isObject(declaration)) {
    diagnostics.push(
      issue(
        'DSHX4211',
        'error',
        'Client projects must declare an object at dsh.client.',
        file,
        'Add dsh.client with platform, inject, external, and immediately metadata.',
      ),
    )
    return
  }
  if (declaration.platform !== compatibility.client.manifest.platform) {
    diagnostics.push(
      issue(
        'DSHX4211',
        'error',
        `dsh.client.platform must be ${JSON.stringify(compatibility.client.manifest.platform)}.`,
        file,
        `Set dsh.client.platform to ${JSON.stringify(compatibility.client.manifest.platform)}.`,
      ),
    )
  }
  checkStringArray(diagnostics, declaration.inject, 'dsh.client.inject', 'DSHX4212', file)
  const external = checkStringArray(diagnostics, declaration.external, 'dsh.client.external', 'DSHX4213', file)
  if (declaration.immediately !== undefined && typeof declaration.immediately !== 'boolean') {
    diagnostics.push(
      issue(
        'DSHX4214',
        'error',
        'dsh.client.immediately must be a boolean.',
        file,
        'Set dsh.client.immediately to true or false, or remove the optional field.',
      ),
    )
  }
  if (external === undefined) return

  const baseline = new Set([...compatibility.client.platformModules, ...compatibility.client.preloadedExternals])
  for (const request of external) {
    if (request === config.packageId || request.startsWith(`${config.packageId}/`)) {
      diagnostics.push(
        issue(
          'DSHX4215',
          'error',
          `dsh.client.external must not request its own package: ${JSON.stringify(request)}.`,
          file,
          'Remove self-references from dsh.client.external.',
        ),
      )
    } else if (baseline.has(request)) {
      diagnostics.push(
        issue(
          'DSHX4215',
          'error',
          `dsh.client.external must not repeat the ${compatibility.id} baseline module ${JSON.stringify(request)}.`,
          file,
          'Remove baseline modules; DSH provides them implicitly.',
        ),
      )
    }
  }
}

async function checkSettingsCapability(diagnostics: DshxDiagnostic[], config: ResolvedDshxConfig, manifest: Record<string, unknown>): Promise<void> {
  if (config.clientEntry === undefined || !(await clientUsesSettings(config.clientEntry, config.root))) return
  const dsh = isObject(manifest.dsh) ? manifest.dsh : undefined
  const client = isObject(dsh?.client) ? dsh.client : undefined
  const inject = Array.isArray(client?.inject) ? client.inject : []
  if (inject.includes('@deepseek-ai/dsh-client-ui-settings')) return
  diagnostics.push(
    issue(
      'DSHX4216',
      'error',
      'useSettings() requires @deepseek-ai/dsh-client-ui-settings in dsh.client.inject.',
      config.packageFile,
      'Add "@deepseek-ai/dsh-client-ui-settings" to dsh.client.inject so DSH loads the official settingsScope provider first.',
    ),
  )
}

/** Collect current package and bundle metadata issues without changing project files. */
export async function checkProjectManifest(config: ResolvedDshxConfig, options: { readonly compatibility?: DshCompatibility } = {}): Promise<DshxDiagnostic[]> {
  const diagnostics: DshxDiagnostic[] = []
  let source: string
  try {
    source = await readFile(config.packageFile, 'utf8')
  } catch (error) {
    return [
      issue(
        'DSHX4101',
        'error',
        `Cannot read package.json: ${String(error)}`,
        config.packageFile,
        'Restore a readable package.json at the resolved project root.',
      ),
    ]
  }
  let value: unknown
  try {
    value = JSON.parse(source)
  } catch (error) {
    return [
      issue(
        'DSHX4101',
        'error',
        `package.json is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
        config.packageFile,
        'Fix the JSON syntax before running DSHX again.',
      ),
    ]
  }
  if (!isObject(value)) {
    return [
      issue(
        'DSHX4101',
        'error',
        'package.json must contain a JSON object.',
        config.packageFile,
        'Replace the document root with a JSON object containing the package metadata.',
      ),
    ]
  }
  const manifest = value
  if (typeof manifest.name !== 'string' || manifest.name.trim() === '') {
    diagnostics.push(
      issue(
        'DSHX4101',
        'error',
        'package.json name must be a non-empty string.',
        config.packageFile,
        'Set name to the installable package id, for example "@scope/my-plugin".',
      ),
    )
  } else if (manifest.name !== config.packageId) {
    diagnostics.push(
      issue(
        'DSHX4101',
        'error',
        `package.json name changed from the resolved package id ${JSON.stringify(config.packageId)}.`,
        config.packageFile,
        'Resolve the project again before checking or restore the package name.',
      ),
    )
  }
  if (manifest.type !== 'module') {
    diagnostics.push(
      issue('DSHX4102', 'error', 'package.json type must be "module" for the Host ESM artifact.', config.packageFile, 'Set package.json type to "module".'),
    )
  }
  checkExport(diagnostics, manifest.exports, '.', './dist/index.js', 'DSHX4110', config.packageFile)
  checkExport(diagnostics, manifest.exports, './cordis.patch.yml', './cordis.patch.yml', 'DSHX4121', config.packageFile)
  checkExport(diagnostics, manifest.exports, './package.json', './package.json', 'DSHX4122', config.packageFile)

  const dsh = isObject(manifest.dsh) ? manifest.dsh : undefined
  const bundle = isObject(dsh?.bundle) ? dsh.bundle : undefined
  if (bundle?.patch !== './cordis.patch.yml') {
    diagnostics.push(
      issue(
        'DSHX4120',
        'error',
        'package.json dsh.bundle.patch must be "./cordis.patch.yml".',
        config.packageFile,
        'Set dsh.bundle.patch to "./cordis.patch.yml".',
      ),
    )
  }
  await checkPatch(diagnostics, config.root, config.packageFile)
  checkClient(diagnostics, config, manifest, options.compatibility ?? DEFAULT_COMPATIBILITY)
  await checkSettingsCapability(diagnostics, config, manifest)
  checkPublishingHints(diagnostics, manifest, config.packageFile)
  return diagnostics
}
