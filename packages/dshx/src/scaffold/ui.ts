import { createRequire } from 'node:module'
import { access, mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import { dirname, relative, resolve, sep } from 'node:path'
import ts from 'typescript'
import { DEFAULT_COMPATIBILITY } from '../compat/index.js'
import type { DshCompatibility } from '../compat/types.js'
import type { ResolvedDshxConfig } from '../config/types.js'
import type { DshxDiagnostic } from '../diagnostics.js'
import { inspectProjectComposition } from '../inspect/index.js'
import type { InspectOptions, InspectResult, SlotSummary } from '../inspect/index.js'
import { checkProjectManifest } from '../project/index.js'

export interface AddUiOptions {
  readonly project: ResolvedDshxConfig
  readonly slot?: string
  readonly provider?: string
  readonly file?: string
  readonly id?: string
  readonly order?: number
  readonly dryRun?: boolean
  readonly inspect?: InspectOptions
}

export interface ScaffoldFileSystem {
  readonly readFile: (file: string, encoding: 'utf8') => Promise<string>
  readonly writeFile: (file: string, data: string, encoding: 'utf8') => Promise<void>
  readonly mkdir: (file: string, options: { readonly recursive: true }) => Promise<unknown>
  readonly rename: (from: string, to: string) => Promise<void>
  readonly unlink: (file: string) => Promise<void>
  readonly access: (file: string) => Promise<void>
}

export interface AddUiDependencies {
  readonly fs?: Partial<ScaffoldFileSystem>
  readonly inspectComposition?: typeof inspectProjectComposition
  readonly checkManifest?: typeof checkProjectManifest
  readonly resolveProvider?: (projectRoot: string, provider: string) => Promise<boolean>
  readonly selectSlot?: (items: readonly SlotSummary[]) => Promise<string | undefined>
  readonly compatibility?: DshCompatibility
}

export interface AddUiResult {
  readonly root: string
  readonly slot: SlotSummary
  readonly provider: string
  readonly changedFiles: readonly string[]
  readonly generatedFiles: readonly string[]
  readonly manifestChanged: boolean
  readonly diagnostics: readonly DshxDiagnostic[]
  readonly diff?: string
}

interface PlannedFile {
  readonly file: string
  readonly before?: string
  readonly after: string
}

const defaultFs: ScaffoldFileSystem = { readFile, writeFile, mkdir, rename, unlink, access }

function diagnostic(code: string, message: string, file: string, hint: string, severity: 'error' | 'warning' = 'error'): DshxDiagnostic {
  return { code, severity, message, file, hint }
}

function mergeFs(input: Partial<ScaffoldFileSystem> | undefined): ScaffoldFileSystem {
  return { ...defaultFs, ...(input ?? {}) }
}

function safeName(value: string): string {
  const name = value.replace(/[^a-zA-Z0-9_$]+/g, '_').replace(/^_+|_+$/g, '')
  if (name === '') return 'GeneratedSlot'
  return /^[0-9]/.test(name) ? `Slot_${name}` : name
}

function safeFileName(value: string): string {
  const name = value.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '')
  return name === '' ? 'slot' : name
}

function inside(root: string, target: string): boolean {
  const path = relative(root, target)
  return path !== '' && !path.startsWith(`..${sep}`) && path !== '..' && !path.startsWith(sep)
}

function defaultId(project: ResolvedDshxConfig, slot: string): string {
  return `${project.packageId}.${slot}`
}

function defaultComponentName(slot: string): string {
  return `${safeName(slot)}Slot`
}

function contributionIdentifier(slot: string): string {
  return `${safeName(slot)}Contribution`
}

function providerClient(provider: string): string {
  return `${provider}/client`
}

async function defaultResolveProvider(projectRoot: string, provider: string): Promise<boolean> {
  try {
    const require = createRequire(resolve(projectRoot, 'package.json'))
    require.resolve(providerClient(provider))
    require.resolve('@deepseek-ai/dsh-client-ui-slots')
    return true
  } catch {
    return false
  }
}

function generatedSource(slot: SlotSummary, provider: string, id: string, order: number): string {
  const component = defaultComponentName(slot.name)
  return `import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'\nimport type {} from ${JSON.stringify(providerClient(provider))}\nimport { defineSlot } from 'dshx/client'\n\nexport function ${component}(_props: PropsRuntime<${JSON.stringify(slot.name)}>) {\n  return <button type="button">{${JSON.stringify(slot.name)}}</button>\n}\n\nexport const generatedSlot = defineSlot(${JSON.stringify(slot.name)}, {\n  id: ${JSON.stringify(id)},\n  order: ${order},\n  component: ${component},\n})\n`
}

function relativeImport(fromFile: string, targetFile: string): string {
  let value = relative(dirname(fromFile), targetFile).replaceAll('\\', '/')
  if (!value.startsWith('.')) value = `./${value}`
  return value.replace(/\.(?:tsx?|jsx?)$/, '')
}

function findDefaultDefineClient(sourceFile: ts.SourceFile): ts.CallExpression | undefined {
  for (const statement of sourceFile.statements) {
    if (!ts.isExportAssignment(statement)) continue
    const expression = statement.expression
    if (ts.isCallExpression(expression) && ts.isIdentifier(expression.expression) && expression.expression.text === 'defineClient') return expression
  }
  return undefined
}

function propertyNamed(object: ts.ObjectLiteralExpression, name: string): ts.PropertyAssignment | undefined {
  return object.properties.find((property): property is ts.PropertyAssignment => ts.isPropertyAssignment(property) && ts.isIdentifier(property.name) && property.name.text === name)
}

function hasSlotRegistration(sourceFile: ts.SourceFile, slotName: string): boolean {
  let found = false
  const visit = (node: ts.Node): void => {
    if (found) return
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'defineSlot') {
      const first = node.arguments[0]
      if (first !== undefined && ts.isStringLiteral(first) && first.text === slotName) found = true
    }
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
  return found
}

function modifyClientSource(source: string, file: string, contributionFile: string, slotName: string): { source: string | undefined; duplicate: boolean } {
  const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  if (hasSlotRegistration(sourceFile, slotName)) return { source: undefined, duplicate: true }
  const call = findDefaultDefineClient(sourceFile)
  const argument = call?.arguments[0]
  if (call === undefined || call.arguments.length !== 1 || argument === undefined || !ts.isObjectLiteralExpression(argument)) return { source: undefined, duplicate: false }
  const object = argument
  const slots = propertyNamed(object, 'slots')
  const slotProperty = object.properties.find(property => property.name !== undefined && ts.isIdentifier(property.name) && property.name.text === 'slots')
  if (slotProperty !== undefined && (slots === undefined || !ts.isArrayLiteralExpression(slots.initializer))) return { source: undefined, duplicate: false }
  const importPath = relativeImport(file, contributionFile)
  const identifier = contributionIdentifier(slotName)
  const importLine = `import { generatedSlot as ${identifier} } from ${JSON.stringify(importPath)}\n`
  const edits: Array<{ start: number; end: number; text: string }> = []
  const imports = sourceFile.statements.filter(ts.isImportDeclaration)
  const importEnd = imports.length === 0 ? 0 : imports[imports.length - 1]!.end
  edits.push({ start: importEnd, end: importEnd, text: `${importEnd === 0 ? '' : '\n'}${importLine}` })
  if (slots !== undefined && ts.isArrayLiteralExpression(slots.initializer)) {
    const array = slots.initializer
    const hasItems = array.elements.length > 0
    edits.push({ start: array.end - 1, end: array.end - 1, text: `${hasItems ? ', ' : ''}${identifier}` })
  } else {
    const openBrace = object.getStart(sourceFile) + source.slice(object.getStart(sourceFile), object.getEnd()).indexOf('{') + 1
    const hasProperties = object.properties.length > 0
    edits.push({ start: openBrace, end: openBrace, text: `${hasProperties ? '\n' : ''}  slots: [${identifier}],${hasProperties ? '' : '\n'}` })
  }
  edits.sort((a, b) => b.start - a.start)
  let result = source
  for (const edit of edits) result = `${result.slice(0, edit.start)}${edit.text}${result.slice(edit.end)}`
  return { source: result, duplicate: false }
}

function newClientSource(clientFile: string, contributionFile: string, slotName: string): string {
  const importPath = relativeImport(clientFile, contributionFile)
  const identifier = contributionIdentifier(slotName)
  return `import { defineClient } from 'dshx/client'\nimport { generatedSlot as ${identifier} } from ${JSON.stringify(importPath)}\n\nexport default defineClient({\n  slots: [${identifier}],\n})\n`
}

function updateManifest(
  source: string,
  provider: string,
  compatibility: DshCompatibility,
): { source: string; manifest: Record<string, unknown> } {
  const value = JSON.parse(source) as Record<string, unknown>
  const exports = value.exports
  if (exports !== undefined && (typeof exports !== 'object' || exports === null || Array.isArray(exports))) throw new Error('package.json exports must be an object when adding a Client entry.')
  const nextExports = (exports ?? {}) as Record<string, unknown>
  const existingClient = nextExports['./client']
  if (existingClient !== undefined && existingClient !== './dist/client.js' && !(typeof existingClient === 'object' && existingClient !== null && !Array.isArray(existingClient) && (existingClient as Record<string, unknown>).default === './dist/client.js')) throw new Error('package.json already declares an incompatible ./client export.')
  nextExports['./client'] = existingClient ?? './dist/client.js'
  value.exports = nextExports
  const dsh = typeof value.dsh === 'object' && value.dsh !== null && !Array.isArray(value.dsh) ? value.dsh as Record<string, unknown> : {}
  const client = typeof dsh.client === 'object' && dsh.client !== null && !Array.isArray(dsh.client) ? dsh.client as Record<string, unknown> : {}
  const inject = Array.isArray(client.inject) && client.inject.every(item => typeof item === 'string') ? [...client.inject as string[]] : []
  if (!inject.includes(provider)) inject.push(provider)
  dsh.client = { ...client, platform: compatibility.client.manifest.platform, inject, external: Array.isArray(client.external) ? client.external : [], immediately: typeof client.immediately === 'boolean' ? client.immediately : false }
  value.dsh = { ...dsh, client: dsh.client }
  return { source: `${JSON.stringify(value, null, 2)}\n`, manifest: value }
}

function diffFor(plan: readonly PlannedFile[]): string {
  return plan.map(item => `--- ${item.file}\n+++ ${item.file}\n${item.after.split('\n').map(line => `+${line}`).join('\n')}\n`).join('\n')
}

async function applyPlan(plan: readonly PlannedFile[], fs: ScaffoldFileSystem): Promise<void> {
  const applied: PlannedFile[] = []
  const temps: string[] = []
  try {
    for (let index = 0; index < plan.length; index += 1) {
      const item = plan[index]!
      await fs.mkdir(dirname(item.file), { recursive: true })
      const temp = `${item.file}.dshx-tmp-${process.pid}-${index}`
      temps.push(temp)
      await fs.writeFile(temp, item.after, 'utf8')
      await fs.rename(temp, item.file)
      applied.push(item)
    }
  } catch (cause) {
    for (const item of applied.reverse()) {
      if (item.before === undefined) await fs.unlink(item.file).catch(() => undefined)
      else {
        const temp = `${item.file}.dshx-rollback-${process.pid}`
        await fs.writeFile(temp, item.before, 'utf8').catch(() => undefined)
        await fs.rename(temp, item.file).catch(() => undefined)
      }
    }
    for (const temp of temps) await fs.unlink(temp).catch(() => undefined)
    throw cause
  }
}

async function rollbackPlan(plan: readonly PlannedFile[], fs: ScaffoldFileSystem): Promise<void> {
  for (const item of [...plan].reverse()) {
    if (item.before === undefined) {
      await fs.unlink(item.file).catch(() => undefined)
      continue
    }
    const temp = `${item.file}.dshx-rollback-${process.pid}`
    await fs.writeFile(temp, item.before, 'utf8').catch(() => undefined)
    await fs.rename(temp, item.file).catch(() => undefined)
  }
}

async function readExisting(fs: ScaffoldFileSystem, file: string): Promise<string | undefined> {
  try { return await fs.readFile(file, 'utf8') } catch { return undefined }
}

function result(project: ResolvedDshxConfig, slot: SlotSummary, provider: string, diagnostics: readonly DshxDiagnostic[], plan: readonly PlannedFile[], manifestChanged: boolean, diff?: string): AddUiResult {
  return {
    root: project.root,
    slot,
    provider,
    changedFiles: plan.map(item => item.file),
    generatedFiles: plan.filter(item => item.before === undefined).map(item => item.file),
    manifestChanged,
    diagnostics,
    ...(diff === undefined ? {} : { diff }),
  }
}

/** Generate a Slot contribution and attach it to a DSHX-managed Client. */
export async function createUiScaffold(options: AddUiOptions, dependencies: AddUiDependencies = {}): Promise<AddUiResult> {
  const { project } = options
  const fs = mergeFs(dependencies.fs)
  const packageFile = project.packageFile
  let inspect: InspectResult
  try {
    inspect = await (dependencies.inspectComposition ?? inspectProjectComposition)(project, 'slots', options.inspect)
  } catch (cause) {
    const item = diagnostic('DSHX6102', 'Unable to inspect the running DSH composition.', packageFile, 'Start a supported DSH Runtime Inspect Provider and retry.', 'error')
    return result(project, { name: options.slot ?? '' }, options.provider ?? '', [item], [], false)
  }
  if (inspect.diagnostics.some(item => item.severity === 'error')) {
    const mapped = inspect.diagnostics.map(item => item.code === 'DSHX3201' ? diagnostic('DSHX6102', item.message, item.file, item.hint) : item)
    return result(project, { name: options.slot ?? '' }, options.provider ?? '', mapped, [], false)
  }
  const slots = inspect.items as readonly SlotSummary[]
  let slotName = options.slot
  if (slotName === undefined) slotName = await dependencies.selectSlot?.(slots)
  if (slotName === undefined || slotName.trim() === '') {
    const item = diagnostic('DSHX6101', 'A Slot name is required in non-interactive mode.', packageFile, 'Pass --slot <slot-name>, or run in a TTY to choose a Slot interactively.')
    return result(project, { name: '' }, options.provider ?? '', [item], [], false)
  }
  const slot = slots.find(item => item.name === slotName)
  if (slot === undefined) {
    const item = diagnostic('DSHX6103', `Slot ${JSON.stringify(slotName)} was not returned by the Runtime Inspect Provider.`, packageFile, 'Run dshx inspect slots and choose an available Slot name.')
    return result(project, { name: slotName }, options.provider ?? '', [item], [], false)
  }
  const provider = options.provider ?? slot.provider
  if (provider === undefined || provider.trim() === '') {
    const item = diagnostic('DSHX6103', `Slot ${JSON.stringify(slot.name)} has no provider package metadata.`, packageFile, 'Pass --provider <package> explicitly or use a provider that exposes package metadata.')
    return result(project, slot, '', [item], [], false)
  }
  if (options.provider !== undefined && slot.provider !== undefined && options.provider !== slot.provider) {
    const item = diagnostic('DSHX6103', `Provider ${JSON.stringify(options.provider)} does not match the inspected provider ${JSON.stringify(slot.provider)}.`, packageFile, 'Use the provider reported by dshx inspect slots or inspect the desired Slot again.')
    return result(project, slot, provider, [item], [], false)
  }
  if (options.id !== undefined && options.id.trim() === '') {
    const item = diagnostic('DSHX6101', 'The Slot registration id must be a non-empty string.', packageFile, 'Pass a non-empty value to --id or omit it to use the deterministic default.')
    return result(project, slot, provider, [item], [], false)
  }
  if (options.order !== undefined && !Number.isInteger(options.order)) {
    const item = diagnostic('DSHX6101', 'The Slot order must be an integer.', packageFile, 'Pass an integer value to --order or omit it to use 0.')
    return result(project, slot, provider, [item], [], false)
  }
  const providerExists = await (dependencies.resolveProvider ?? defaultResolveProvider)(project.root, provider)
  if (!providerExists) {
    const item = diagnostic('DSHX6104', `Provider type entry ${JSON.stringify(providerClient(provider))} is not installed.`, packageFile, `Install ${provider} as a project devDependency, then run dshx add ui again.`)
    return result(project, slot, provider, [item], [], false)
  }
  const clientFile = project.clientEntry ?? resolve(project.root, 'src/client.tsx')
  if (!inside(project.root, clientFile)) {
    const item = diagnostic('DSHX6106', `Client output path must stay inside the project root: ${clientFile}.`, packageFile, 'Choose a Client entry under the project root.')
    return result(project, slot, provider, [item], [], false)
  }
  const targetFile = resolve(project.root, options.file ?? `src/slots/${safeFileName(slot.name)}.tsx`)
  if (!inside(project.root, targetFile)) {
    const item = diagnostic('DSHX6106', `Generated file must stay inside the project root: ${targetFile}.`, packageFile, 'Use --file with a path under the project root.')
    return result(project, slot, provider, [item], [], false)
  }
  if (!targetFile.endsWith('.tsx')) {
    const item = diagnostic('DSHX6106', `Generated Slot files must use a .tsx extension: ${targetFile}.`, targetFile, 'Use --file with a .tsx path so the generated JSX can compile.')
    return result(project, slot, provider, [item], [], false)
  }
  const existingGenerated = await readExisting(fs, targetFile)
  if (existingGenerated !== undefined) {
    const generatedAst = ts.createSourceFile(targetFile, existingGenerated, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
    if (hasSlotRegistration(generatedAst, slot.name)) {
      const item = diagnostic('DSHX6109', `Slot ${JSON.stringify(slot.name)} is already generated in ${targetFile}.`, targetFile, 'Keep the existing contribution; no new files were written.', 'warning')
      return result(project, slot, provider, [item], [], false)
    }
    const item = diagnostic('DSHX6106', `Generated Slot file already exists: ${targetFile}.`, targetFile, 'Choose another --file path or remove the existing file after reviewing it.')
    return result(project, slot, provider, [item], [], false)
  }
  const clientBefore = await readExisting(fs, clientFile)
  const packageBefore = await readExisting(fs, packageFile)
  if (packageBefore === undefined) {
    const item = diagnostic('DSHX6107', `Cannot read project manifest: ${packageFile}.`, packageFile, 'Fix the project manifest permissions and retry.')
    return result(project, slot, provider, [item], [], false)
  }
  let clientAfter: string
  let manifestAfter: string | undefined
  let manifest: Record<string, unknown> = project.manifest as Record<string, unknown>
  let manifestChanged = false
  if (clientBefore === undefined) {
    clientAfter = newClientSource(clientFile, targetFile, slot.name)
    try {
      const updated = updateManifest(packageBefore, provider, dependencies.compatibility ?? DEFAULT_COMPATIBILITY)
      manifestAfter = updated.source
      manifest = updated.manifest
      manifestChanged = true
    } catch (cause) {
      const item = diagnostic('DSHX6107', `Cannot update project manifest: ${cause instanceof Error ? cause.message : String(cause)}`, packageFile, 'Fix package.json exports and DSH metadata before generating a Client.')
      return result(project, slot, provider, [item], [], false)
    }
  } else {
    const modified = modifyClientSource(clientBefore, clientFile, targetFile, slot.name)
    if (modified.duplicate) {
      const item = diagnostic('DSHX6109', `Slot ${JSON.stringify(slot.name)} is already registered in ${clientFile}.`, clientFile, 'Keep the existing contribution; no new files were written.', 'warning')
      return result(project, slot, provider, [item], [], false)
    }
    if (modified.source === undefined) {
      const item = diagnostic('DSHX6105', `Client ${clientFile} is not a DSHX defineClient default export.`, clientFile, 'Export defineClient({ slots: [...] }) or attach the Slot manually in native Client code.')
      return result(project, slot, provider, [item], [], false)
    }
    clientAfter = modified.source
  }
  const plan: PlannedFile[] = [
    { file: targetFile, after: generatedSource(slot, provider, options.id ?? defaultId(project, slot.name), options.order ?? 0) },
    ...(clientBefore === undefined ? [{ file: clientFile, after: clientAfter }] : [{ file: clientFile, before: clientBefore, after: clientAfter }]),
    ...(manifestAfter === undefined ? [] : [{ file: packageFile, before: packageBefore, after: manifestAfter }]),
  ]
  if (options.dryRun) return result(project, slot, provider, [], plan, manifestChanged, diffFor(plan))
  try {
    await applyPlan(plan, fs)
  } catch (cause) {
    const item = diagnostic('DSHX6107', `Failed to write Slot scaffold: ${cause instanceof Error ? cause.message : String(cause)}`, targetFile, 'Fix filesystem permissions and retry; no partial changes were kept.')
    return result(project, slot, provider, [item], [], manifestChanged)
  }
  const postProject: ResolvedDshxConfig = {
    ...project,
    ...(clientBefore === undefined ? { clientEntry: clientFile } : {}),
    manifest,
  }
  const compatibility = dependencies.compatibility ?? inspect.dsh?.compatibility ?? DEFAULT_COMPATIBILITY
  let postDiagnostics: readonly DshxDiagnostic[]
  try {
    postDiagnostics = await (dependencies.checkManifest ?? checkProjectManifest)(postProject, { compatibility })
  } catch (cause) {
    await rollbackPlan(plan, fs)
    const item = diagnostic('DSHX6108', `Generated Slot scaffold could not be validated: ${cause instanceof Error ? cause.message : String(cause)}`, packageFile, 'Fix the project manifest or compatibility adapter before generating a Slot.')
    return result(project, slot, provider, [item], [], manifestChanged)
  }
  if (postDiagnostics.some(item => item.severity === 'error')) {
    await rollbackPlan(plan, fs)
    const item = diagnostic('DSHX6108', 'Generated Slot scaffold failed Manifest Checker validation and was rolled back.', packageFile, 'Fix the project manifest or compatibility adapter before generating a Slot.')
    return result(project, slot, provider, [item, ...postDiagnostics], [], manifestChanged)
  }
  return result(project, slot, provider, postDiagnostics, plan, manifestChanged)
}
