import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { DEFAULT_COMPATIBILITY } from '../compat/index.js'
import type { DshCompatibility } from '../compat/types.js'
import type { ResolvedDshxConfig } from '../config/types.js'
import type { DshxDiagnostic } from '../diagnostics.js'
import { applyFilePlan } from '../scaffold/common.js'
import type { FilePlan } from '../scaffold/common.js'

export interface ManifestRepairPlan {
  readonly root: string
  readonly files: readonly FilePlan[]
  readonly changedFiles: readonly string[]
  readonly diagnostics: readonly DshxDiagnostic[]
  readonly diff: string
}

export interface ManifestRepairOptions {
  readonly compatibility?: DshCompatibility
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function issue(code: string, severity: 'error' | 'warning', message: string, file: string, hint: string): DshxDiagnostic {
  return { code, severity, message, file, hint }
}

function repairDiff(file: string, before: string, after: string): string {
  const oldLines = before.split('\n')
  const newLines = after.split('\n')
  return [
    `--- ${file}`,
    `+++ ${file}`,
    ...oldLines.map(line => `-${line}`),
    ...newLines.map(line => `+${line}`),
    '',
  ].join('\n')
}

function addMissing(record: Record<string, unknown>, key: string, value: unknown): boolean {
  if (record[key] !== undefined) return false
  record[key] = value
  return true
}

/** Build a plan for fields whose desired value is completely determined by the adapter. */
export async function createManifestRepairPlan(
  config: ResolvedDshxConfig,
  options: ManifestRepairOptions = {},
): Promise<ManifestRepairPlan> {
  const compatibility = options.compatibility ?? DEFAULT_COMPATIBILITY
  let source: string
  try {
    source = await readFile(config.packageFile, 'utf8')
  } catch (error) {
    return {
      root: config.root,
      files: [],
      changedFiles: [],
      diagnostics: [issue('DSHX4101', 'error', `Cannot read package.json: ${error instanceof Error ? error.message : String(error)}`, config.packageFile, 'Restore a readable package.json before creating a repair plan.')],
      diff: '',
    }
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(source)
  } catch (error) {
    return {
      root: config.root,
      files: [],
      changedFiles: [],
      diagnostics: [issue('DSHX4101', 'error', `package.json is not valid JSON: ${error instanceof Error ? error.message : String(error)}`, config.packageFile, 'Fix the JSON syntax before creating a repair plan.')],
      diff: '',
    }
  }
  if (!isObject(parsed)) {
    return {
      root: config.root,
      files: [],
      changedFiles: [],
      diagnostics: [issue('DSHX4101', 'error', 'package.json must contain a JSON object.', config.packageFile, 'Replace the document root with a package metadata object.')],
      diff: '',
    }
  }
  const diagnostics: DshxDiagnostic[] = []
  const manifest = parsed
  let changed = false

  let exportsField: Record<string, unknown>
  if (manifest.exports === undefined) {
    exportsField = {}
    manifest.exports = exportsField
    changed = true
  } else if (isObject(manifest.exports)) {
    exportsField = manifest.exports
  } else {
    diagnostics.push(issue('DSHX4141', 'warning', 'package.json exports is not a plain object; DSHX will not rewrite it automatically.', config.packageFile, 'Convert exports to an object and add the required entries manually.'))
    exportsField = {}
  }
  changed = addMissing(exportsField, '.', './dist/index.js') || changed
  changed = addMissing(exportsField, './cordis.patch.yml', './cordis.patch.yml') || changed
  changed = addMissing(exportsField, './package.json', './package.json') || changed
  if (config.clientEntry !== undefined) changed = addMissing(exportsField, './client', './dist/client.js') || changed

  let dsh: Record<string, unknown>
  if (manifest.dsh === undefined) {
    dsh = {}
    manifest.dsh = dsh
    changed = true
  } else if (isObject(manifest.dsh)) {
    dsh = manifest.dsh
  } else {
    diagnostics.push(issue('DSHX4141', 'warning', 'package.json dsh is not a plain object; DSHX will not rewrite it automatically.', config.packageFile, 'Convert dsh to an object and add the required metadata manually.'))
    dsh = {}
  }
  let bundle: Record<string, unknown>
  if (dsh.bundle === undefined) {
    bundle = {}
    dsh.bundle = bundle
    changed = true
  } else if (isObject(dsh.bundle)) {
    bundle = dsh.bundle
  } else {
    diagnostics.push(issue('DSHX4141', 'warning', 'package.json dsh.bundle is not a plain object; DSHX will not rewrite it automatically.', config.packageFile, 'Convert dsh.bundle to an object and add patch metadata manually.'))
    bundle = {}
  }
  const patchFile = resolve(config.root, 'cordis.patch.yml')
  const patchExists = await readFile(patchFile, 'utf8').then(() => true).catch(() => false)
  if (bundle.patch === undefined && patchExists) changed = addMissing(bundle, 'patch', './cordis.patch.yml') || changed
  else if (bundle.patch !== undefined && bundle.patch !== './cordis.patch.yml') diagnostics.push(issue('DSHX4142', 'warning', 'dsh.bundle.patch is present but does not match the project patch file; DSHX will not overwrite it.', config.packageFile, 'Review dsh.bundle.patch manually before applying a repair.'))
  else if (bundle.patch === undefined && !patchExists) diagnostics.push(issue('DSHX4143', 'warning', 'cordis.patch.yml is missing, so dsh.bundle.patch cannot be inferred safely.', patchFile, 'Create and validate cordis.patch.yml before repairing package metadata.'))

  if (config.clientEntry !== undefined) {
    let client: Record<string, unknown>
    if (dsh.client === undefined) {
      client = {}
      dsh.client = client
      changed = true
    } else if (isObject(dsh.client)) {
      client = dsh.client
    } else {
      diagnostics.push(issue('DSHX4141', 'warning', 'package.json dsh.client is not a plain object; DSHX will not rewrite it automatically.', config.packageFile, 'Convert dsh.client to an object and add client metadata manually.'))
      client = {}
    }
    changed = addMissing(client, 'platform', compatibility.client.manifest.platform) || changed
    changed = addMissing(client, 'inject', []) || changed
    changed = addMissing(client, 'external', []) || changed
    changed = addMissing(client, 'immediately', false) || changed
  }

  const after = changed ? `${JSON.stringify(manifest, null, 2)}\n` : source
  const files = changed ? [{ file: config.packageFile, before: source, after }] : []
  return {
    root: config.root,
    files,
    changedFiles: files.map(item => item.file),
    diagnostics,
    diff: files.length === 0 ? '' : repairDiff(config.packageFile, source, after),
  }
}

/** Apply a previously reviewed repair plan using the shared atomic file transaction. */
export async function applyManifestRepairPlan(plan: ManifestRepairPlan): Promise<void> {
  if (plan.files.length === 0) return
  if (plan.diagnostics.some(item => item.severity === 'error')) throw new Error('Cannot apply a repair plan with errors.')
  await applyFilePlan(plan.files)
}
