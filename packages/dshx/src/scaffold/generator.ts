import { access, mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import { dirname, relative } from 'node:path'
import ts from 'typescript'
import writeFileAtomic from 'write-file-atomic'
import type { ResolvedDshxConfig } from '../config/types.js'
import type { DshxDiagnostic } from '../diagnostics.js'
import { checkProjectManifest } from '../project/index.js'
import { applyFilePlanWithFileSystem, insideProject, renderFileDiff, rollbackFilePlanWithFileSystem } from './common.js'
import type { FilePlan, FilePlanFileSystem } from './common.js'

/**
 * The contribution generator.
 *
 * Tool, Command, Hook and Slot differ in two things only: the module they
 * generate, and the field of the entry that registers it. Everything else — the
 * path and extension checks, duplicate detection, the AST edit that attaches the
 * contribution, the plan/diff/apply/rollback cycle, and the manifest check that
 * decides whether the result stays — happens here once.
 *
 * A new contribution kind is a descriptor: one generated source, one entry
 * shape, one message table.
 */

export interface ContributionFileSystem extends FilePlanFileSystem {
  readonly readFile: (file: string, encoding: 'utf8') => Promise<string>
  readonly access: (file: string) => Promise<void>
  readonly writeFileAtomic?: (file: string, data: string) => Promise<void>
}

const defaultFileSystem: ContributionFileSystem = {
  readFile,
  writeFile,
  mkdir,
  rename,
  unlink,
  access,
  writeFileAtomic: async (file, data) => writeFileAtomic(file, data, { encoding: 'utf8' }),
}

/** How a contribution is attached to the entry's default call. */
export type Registration =
  /** Appended to the array at `property`, e.g. `tools: [...]`. */
  | { readonly kind: 'collection'; readonly property: string }
  /** Called from the body of `setup(ctx)`, creating that method when absent. */
  | { readonly kind: 'setup' }

export interface ContributionEntry {
  /** The module that imports and registers the contribution. */
  readonly file: string
  /** The default-exported call that marks a DSHX-managed entry, e.g. `defineHost`. */
  readonly factory: string
  /** The binding imported into the entry, e.g. `statusTool` or `generatedSlot as statusSlot`. */
  readonly importSpecifier: string
  /** The local name the entry uses, e.g. `statusTool`. */
  readonly identifier: string
  readonly registration: Registration
  /** Whether a source file already registers this contribution. */
  readonly isRegistered: (sourceFile: ts.SourceFile) => boolean
  /** The entry module written when the project has none. */
  readonly create: string
  /** The project field that points at the entry once it exists. */
  readonly field: 'hostEntry' | 'clientEntry'
}

export interface ContributionTarget {
  readonly file: string
  readonly source: string
  readonly extension: '.ts' | '.tsx'
}

export interface ScaffoldMessage {
  readonly code: string
  readonly hint: string
}

/**
 * The diagnostics a kind can emit. Wording is the generator's; the code and the
 * hint — which names the kind's own alternative — belong to the kind.
 */
export interface ContributionMessages {
  /** The generated path is outside the project or has the wrong extension. */
  readonly invalidPath: ScaffoldMessage
  /** The entry lives outside the project root. */
  readonly entryPath: ScaffoldMessage
  /** The entry may be switched off in configuration (Host kinds only). */
  readonly entryDisabled?: ScaffoldMessage
  readonly targetExists: ScaffoldMessage
  readonly duplicateInTarget: ScaffoldMessage
  readonly duplicateInEntry: ScaffoldMessage
  /** The entry is not a DSHX default export, or has no `setup` to extend. */
  readonly invalidEntry: ScaffoldMessage
  /** The registration field has the wrong shape. Omitted kinds report invalidEntry instead. */
  readonly invalidRegistration?: ScaffoldMessage
  readonly writeFailed: ScaffoldMessage
  readonly validation: ScaffoldMessage
}

export interface ContributionRequest {
  readonly project: ResolvedDshxConfig
  /** The noun the messages use, e.g. "Tool". */
  readonly label: string
  /** The name the contributor asked for, used in duplicate messages. */
  readonly name: string
  readonly target: ContributionTarget
  readonly entry: ContributionEntry
  readonly messages: ContributionMessages
  readonly dryRun?: boolean
  /** Files planned after the contribution and its entry, e.g. package.json. */
  readonly extraFiles?: readonly FilePlan[]
  /** The manifest the entry edit implies, for the post-generation check. */
  readonly manifest?: Record<string, unknown>
  readonly checkManifest?: typeof checkProjectManifest
  readonly checkManifestOptions?: Parameters<typeof checkProjectManifest>[1]
  readonly fs?: Partial<ContributionFileSystem>
}

export interface ContributionOutcome {
  readonly plan: readonly FilePlan[]
  readonly diagnostics: readonly DshxDiagnostic[]
  readonly dryRun: boolean
  readonly diff?: string
}

/** The identifier a generated binding may use, e.g. `GeneratedTool` or `Tool_1status`. */
export function identifierName(value: string, prefix: string): string {
  const name = value.replace(/[^a-zA-Z0-9_$]+/g, '_').replace(/^_+|_+$/g, '')
  if (name === '') return `Generated${prefix}`
  return /^[0-9]/.test(name) ? `${prefix}_${name}` : name
}

/** A name safe to use as a file stem. */
export function fileStem(value: string, fallback: string): string {
  const name = value.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '')
  return name === '' ? fallback : name
}

/** The module specifier an entry uses to import the generated file. */
export function importPath(from: string, to: string): string {
  let path = relative(dirname(from), to).replaceAll('\\', '/')
  if (!path.startsWith('.')) path = `./${path}`
  return path.replace(/\.(?:tsx?|jsx?)$/, '.js')
}

/** Whether the configuration switches the Host face off, so no Host may be created. */
export function entryDisabled(project: ResolvedDshxConfig, configSource: string | undefined): boolean {
  return project.hostEntry === undefined && configSource !== undefined && /(?:^|[,{\n])\s*host\s*:\s*false\b/.test(configSource)
}

/** Whether any call in the file satisfies `matches`. */
export function containsCall(sourceFile: ts.SourceFile, matches: (call: ts.CallExpression) => boolean): boolean {
  let found = false
  const visit = (node: ts.Node): void => {
    if (found) return
    if (ts.isCallExpression(node) && matches(node)) found = true
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
  return found
}

/** The string initializer of a property of an object literal, when it is one. */
export function stringProperty(object: ts.ObjectLiteralExpression, name: string): string | undefined {
  const property = object.properties.find(item => ts.isPropertyAssignment(item) && ts.isIdentifier(item.name) && item.name.text === name) as
    ts.PropertyAssignment | undefined
  return property !== undefined && ts.isStringLiteral(property.initializer) ? property.initializer.text : undefined
}

/** Whether the file declares a call of `factory` whose first argument is an object with `property: value`. */
export function declaresCall(sourceFile: ts.SourceFile, factory: string, property: string, value: string): boolean {
  return containsCall(
    sourceFile,
    call =>
      ts.isIdentifier(call.expression) &&
      call.expression.text === factory &&
      call.arguments[0] !== undefined &&
      ts.isObjectLiteralExpression(call.arguments[0]) &&
      stringProperty(call.arguments[0], property) === value,
  )
}

function mergeFileSystem(input: Partial<ContributionFileSystem> | undefined): ContributionFileSystem {
  const merged = { ...defaultFileSystem, ...(input ?? {}) }
  if (input?.writeFileAtomic === undefined && (input?.writeFile !== undefined || input?.rename !== undefined)) delete merged.writeFileAtomic
  return merged
}

async function readExisting(fs: ContributionFileSystem, file: string): Promise<string | undefined> {
  try {
    return await fs.readFile(file, 'utf8')
  } catch {
    return undefined
  }
}

function scriptKind(file: string): ts.ScriptKind {
  return file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
}

function parse(file: string, source: string): ts.SourceFile {
  return ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, scriptKind(file))
}

function findDefaultCall(sourceFile: ts.SourceFile, factory: string): ts.CallExpression | undefined {
  for (const statement of sourceFile.statements) {
    if (!ts.isExportAssignment(statement)) continue
    const expression = statement.expression
    if (ts.isCallExpression(expression) && ts.isIdentifier(expression.expression) && expression.expression.text === factory) return expression
  }
  return undefined
}

function elementNamed(object: ts.ObjectLiteralExpression, name: string): ts.ObjectLiteralElementLike | undefined {
  return object.properties.find(item => {
    if (ts.isPropertyAssignment(item) || ts.isMethodDeclaration(item) || ts.isGetAccessorDeclaration(item) || ts.isSetAccessorDeclaration(item))
      return item.name !== undefined && ts.isIdentifier(item.name) && item.name.text === name
    return false
  })
}

function arrayProperty(object: ts.ObjectLiteralExpression, name: string): { value?: ts.ArrayLiteralExpression; invalid: boolean } {
  const element = object.properties.find(item => ts.isPropertyAssignment(item) && ts.isIdentifier(item.name) && item.name.text === name)
  if (element === undefined || !ts.isPropertyAssignment(element)) return { invalid: false }
  return ts.isArrayLiteralExpression(element.initializer) ? { value: element.initializer, invalid: false } : { invalid: true }
}

function setupBody(setup: ts.ObjectLiteralElementLike): { body: ts.Block; parameter?: ts.ParameterDeclaration } | undefined {
  if (ts.isMethodDeclaration(setup)) {
    if (setup.body === undefined) return undefined
    return setup.parameters[0] === undefined ? { body: setup.body } : { body: setup.body, parameter: setup.parameters[0] }
  }
  if (ts.isPropertyAssignment(setup)) {
    const initializer = setup.initializer
    if (ts.isFunctionExpression(initializer) || ts.isArrowFunction(initializer)) {
      if (!ts.isBlock(initializer.body)) return undefined
      return initializer.parameters[0] === undefined ? { body: initializer.body } : { body: initializer.body, parameter: initializer.parameters[0] }
    }
  }
  return undefined
}

function objectOpenBrace(object: ts.ObjectLiteralExpression, source: string, sourceFile: ts.SourceFile): number {
  const start = object.getStart(sourceFile)
  return start + source.slice(start, object.getEnd()).indexOf('{') + 1
}

function importEnd(sourceFile: ts.SourceFile): number {
  const imports = sourceFile.statements.filter(ts.isImportDeclaration)
  return imports.length === 0 ? 0 : imports[imports.length - 1]!.end
}

type Edit = { readonly start: number; readonly end: number; readonly text: string }

function applyEdits(source: string, edits: readonly Edit[]): string {
  let result = source
  for (const edit of [...edits].sort((a, b) => b.start - a.start)) result = `${result.slice(0, edit.start)}${edit.text}${result.slice(edit.end)}`
  return result
}

type Modification =
  { readonly kind: 'ok'; readonly source: string } | { readonly kind: 'duplicate' } | { readonly kind: 'unmanaged' } | { readonly kind: 'invalid' }

/** Attach `entry` to an existing entry module, or say why that is not possible. */
function modifyEntry(source: string, entry: ContributionEntry, targetFile: string): Modification {
  const sourceFile = parse(entry.file, source)
  if (entry.isRegistered(sourceFile)) return { kind: 'duplicate' }
  const call = findDefaultCall(sourceFile, entry.factory)
  const argument = call?.arguments[0]
  if (call === undefined || call.arguments.length !== 1 || argument === undefined || !ts.isObjectLiteralExpression(argument)) return { kind: 'unmanaged' }

  const edits: Edit[] = []
  if (entry.registration.kind === 'collection') {
    const property = entry.registration.property
    const collection = arrayProperty(argument, property)
    if (collection.invalid) return { kind: 'invalid' }
    if (collection.value !== undefined) {
      const list = collection.value
      edits.push({ start: list.end - 1, end: list.end - 1, text: `${list.elements.length > 0 ? ', ' : ''}${entry.identifier}` })
    } else {
      const open = objectOpenBrace(argument, source, sourceFile)
      const prefix = argument.properties.length > 0 ? '\n' : ''
      const suffix = argument.properties.length > 0 ? '' : '\n'
      edits.push({ start: open, end: open, text: `${prefix}  ${property}: [${entry.identifier}],${suffix}` })
    }
  } else {
    const setup = elementNamed(argument, 'setup')
    if (setup === undefined) {
      const close = argument.getEnd() - 1
      const prefix = argument.properties.length === 0 ? '' : '\n'
      const suffix = argument.properties.length === 0 ? '\n' : ''
      edits.push({ start: close, end: close, text: `${prefix}  setup(ctx) {\n    ${entry.identifier}(ctx)\n  },${suffix}` })
    } else {
      const body = setupBody(setup)
      if (body === undefined) return { kind: 'invalid' }
      const contextName = body.parameter === undefined ? 'ctx' : ts.isIdentifier(body.parameter.name) ? body.parameter.name.text : undefined
      if (contextName === undefined) return { kind: 'invalid' }
      if (body.parameter === undefined) {
        const open = setup.getStart(sourceFile)
        const signature = source.slice(open, body.body.getStart(sourceFile))
        const paren = signature.indexOf('(')
        if (paren < 0) return { kind: 'invalid' }
        edits.push({ start: open + paren + 1, end: open + paren + 1, text: 'ctx' })
      }
      const start = body.body.getStart(sourceFile) + 1
      const indent = /\n([ \t]*)[^\s]/.exec(source.slice(start, body.body.getEnd()))?.[1] ?? '  '
      edits.push({ start, end: start, text: `\n${indent}${entry.identifier}(${contextName})\n` })
    }
  }
  const end = importEnd(sourceFile)
  edits.push({
    start: end,
    end,
    text: `${end === 0 ? '' : '\n'}import { ${entry.importSpecifier} } from ${JSON.stringify(importPath(entry.file, targetFile))}\n`,
  })
  return { kind: 'ok', source: applyEdits(source, edits) }
}

function message(
  request: ContributionRequest,
  key: keyof ContributionMessages,
  file: string,
  text: string,
  severity: 'error' | 'warning' = 'error',
): DshxDiagnostic {
  const value = request.messages[key] as ScaffoldMessage
  return { code: value.code, severity, message: text, file, hint: value.hint }
}

function failed(
  request: ContributionRequest,
  key: keyof ContributionMessages,
  file: string,
  text: string,
  severity?: 'error' | 'warning',
): ContributionOutcome {
  return { plan: [], diagnostics: [message(request, key, file, text, severity)], dryRun: request.dryRun ?? false }
}

function describe(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause)
}

function withEntry(project: ResolvedDshxConfig, field: ContributionEntry['field'], file: string): ResolvedDshxConfig {
  return field === 'hostEntry' ? { ...project, hostEntry: file } : { ...project, clientEntry: file }
}

/**
 * Generate one contribution and register it on its entry.
 *
 * The outcome is the plan that was applied (empty when nothing was written),
 * the diagnostics the caller should print, and, for a dry run, the diff.
 */
export async function scaffoldContribution(request: ContributionRequest): Promise<ContributionOutcome> {
  const { project, target, entry, label } = request
  const fs = mergeFileSystem(request.fs)
  if (!insideProject(project.root, target.file) || !target.file.endsWith(target.extension))
    return failed(request, 'invalidPath', target.file, `${label} file must be a ${target.extension} path inside the project root: ${target.file}.`)

  const existing = await readExisting(fs, target.file)
  if (existing !== undefined) {
    if (entry.isRegistered(parse(target.file, existing)))
      return failed(request, 'duplicateInTarget', target.file, `${label} ${JSON.stringify(request.name)} is already defined in ${target.file}.`, 'warning')
    return failed(request, 'targetExists', target.file, `${label} file already exists: ${target.file}.`)
  }

  if (!insideProject(project.root, entry.file)) return failed(request, 'entryPath', entry.file, `Entry file must stay inside the project root: ${entry.file}.`)

  if (request.messages.entryDisabled !== undefined) {
    const configSource = project.configFile === undefined ? undefined : await readExisting(fs, project.configFile)
    if (entryDisabled(project, configSource))
      return failed(request, 'entryDisabled', project.configFile ?? project.packageFile, 'Host is explicitly disabled for this project.')
  }

  const entryBefore = await readExisting(fs, entry.file)
  let entryAfter: string
  if (entryBefore === undefined) {
    entryAfter = entry.create
  } else {
    const modified = modifyEntry(entryBefore, entry, target.file)
    if (modified.kind === 'duplicate')
      return failed(request, 'duplicateInEntry', entry.file, `${label} ${JSON.stringify(request.name)} is already registered in ${entry.file}.`, 'warning')
    if (modified.kind === 'unmanaged') return failed(request, 'invalidEntry', entry.file, `Entry ${entry.file} is not a DSHX ${entry.factory} default export.`)
    if (modified.kind === 'invalid')
      return request.messages.invalidRegistration === undefined
        ? failed(request, 'invalidEntry', entry.file, `Entry ${entry.file} is not a DSHX ${entry.factory} default export.`)
        : failed(request, 'invalidRegistration', entry.file, `Entry ${entry.file} does not declare a registration this generator can extend.`)
    entryAfter = modified.source
  }

  const plan: FilePlan[] = [
    { file: target.file, after: target.source },
    entryBefore === undefined ? { file: entry.file, after: entryAfter } : { file: entry.file, before: entryBefore, after: entryAfter },
    ...(request.extraFiles ?? []),
  ]
  if (request.dryRun) return { plan, diagnostics: [], dryRun: true, diff: renderFileDiff(plan) }

  try {
    await applyFilePlanWithFileSystem(plan, fs)
  } catch (cause) {
    return failed(request, 'writeFailed', target.file, `Failed to write ${label} scaffold: ${describe(cause)}`)
  }

  const postProject: ResolvedDshxConfig = {
    ...(entryBefore === undefined ? withEntry(project, entry.field, entry.file) : project),
    ...(request.manifest === undefined ? {} : { manifest: request.manifest }),
  }
  let postDiagnostics: readonly DshxDiagnostic[]
  try {
    postDiagnostics = await (request.checkManifest ?? checkProjectManifest)(postProject, request.checkManifestOptions)
  } catch (cause) {
    await rollbackFilePlanWithFileSystem(plan, fs)
    return failed(request, 'validation', project.packageFile, `Generated ${label} scaffold could not be validated: ${describe(cause)}`)
  }
  if (postDiagnostics.some(item => item.severity === 'error')) {
    await rollbackFilePlanWithFileSystem(plan, fs)
    return {
      plan: [],
      diagnostics: [
        message(request, 'validation', project.packageFile, `Generated ${label} scaffold failed Manifest Checker validation and was rolled back.`),
        ...postDiagnostics,
      ],
      dryRun: false,
    }
  }
  return { plan, diagnostics: postDiagnostics, dryRun: false }
}
