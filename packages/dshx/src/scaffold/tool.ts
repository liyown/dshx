import { dirname, relative, resolve } from 'node:path'
import ts from 'typescript'
import type { ResolvedDshxConfig } from '../config/types.js'
import type { DshxDiagnostic } from '../diagnostics.js'
import { checkProjectManifest } from '../project/index.js'
import { applyFilePlan, insideProject, readOptionalFile, renderFileDiff, rollbackFilePlan } from './common.js'
import type { FilePlan } from './common.js'

export interface AddToolOptions {
  readonly project: ResolvedDshxConfig
  readonly name: string
  readonly description?: string
  readonly file?: string
  readonly dryRun?: boolean
}

export interface AddToolResult {
  readonly root: string
  readonly name: string
  readonly changedFiles: readonly string[]
  readonly generatedFiles: readonly string[]
  readonly diagnostics: readonly DshxDiagnostic[]
  readonly dryRun: boolean
  readonly diff?: string
}

export interface AddToolDependencies {
  readonly checkManifest?: typeof checkProjectManifest
}

function diagnostic(code: string, message: string, file: string, hint: string, severity: 'error' | 'warning' = 'error'): DshxDiagnostic {
  return { code, severity, message, file, hint }
}

function safeName(value: string): string {
  const name = value.replace(/[^a-zA-Z0-9_$]+/g, '_').replace(/^_+|_+$/g, '')
  if (name === '') return 'GeneratedTool'
  return /^[0-9]/.test(name) ? `Tool_${name}` : name
}

function safeFileName(value: string): string {
  const name = value.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '')
  return name === '' ? 'tool' : name
}

function toolIdentifier(name: string): string {
  return `${safeName(name)}Tool`
}

function sourceForTool(name: string, description: string): string {
  const identifier = toolIdentifier(name)
  return `import { defineTool } from '@becomeopc/dshx/host'\n\nexport const ${identifier} = defineTool({\n  name: ${JSON.stringify(name)},\n  description: ${JSON.stringify(description)},\n  parameters: {},\n  output: {\n    schema: { type: 'string' },\n    render: (_args, value) => [{ type: 'text', text: value }],\n  },\n  async execute() {\n    return ${JSON.stringify(`Implement ${name}`)}\n  },\n})\n`
}

function findDefineHost(sourceFile: ts.SourceFile): ts.CallExpression | undefined {
  for (const statement of sourceFile.statements) {
    if (!ts.isExportAssignment(statement)) continue
    const expression = statement.expression
    if (ts.isCallExpression(expression) && ts.isIdentifier(expression.expression) && expression.expression.text === 'defineHost') return expression
  }
  return undefined
}

function property(object: ts.ObjectLiteralExpression, name: string): ts.PropertyAssignment | undefined {
  return object.properties.find(item => ts.isPropertyAssignment(item) && item.name !== undefined && ts.isIdentifier(item.name) && item.name.text === name) as
    ts.PropertyAssignment | undefined
}

function hasTool(sourceFile: ts.SourceFile, name: string): boolean {
  let found = false
  const visit = (node: ts.Node): void => {
    if (found) return
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'defineTool') {
      const first = node.arguments[0]
      if (first !== undefined && ts.isObjectLiteralExpression(first)) {
        const nameProperty = property(first, 'name')
        if (nameProperty !== undefined && ts.isStringLiteral(nameProperty.initializer) && nameProperty.initializer.text === name) found = true
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
  return found
}

function modifyHost(source: string, hostFile: string, toolFile: string, name: string): { source?: string; duplicate: boolean; invalidTools: boolean } {
  const sourceFile = ts.createSourceFile(hostFile, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
  if (hasTool(sourceFile, name)) return { duplicate: true, invalidTools: false }
  const call = findDefineHost(sourceFile)
  const argument = call?.arguments[0]
  if (call === undefined || call.arguments.length !== 1 || argument === undefined || !ts.isObjectLiteralExpression(argument))
    return { duplicate: false, invalidTools: false }
  const object = argument
  const tools = property(object, 'tools')
  if (tools !== undefined && !ts.isArrayLiteralExpression(tools.initializer)) return { duplicate: false, invalidTools: true }
  const identifier = toolIdentifier(name)
  let importPath = relative(dirname(hostFile), toolFile).replaceAll('\\', '/')
  if (!importPath.startsWith('.')) importPath = `./${importPath}`
  importPath = importPath.replace(/\.ts$/, '.js')
  const imports = sourceFile.statements.filter(ts.isImportDeclaration)
  const importEnd = imports.length === 0 ? 0 : imports[imports.length - 1]!.end
  const edits: Array<{ start: number; end: number; text: string }> = [
    {
      start: importEnd,
      end: importEnd,
      text: `${importEnd === 0 ? '' : '\n'}import { ${identifier} } from ${JSON.stringify(importPath)}\n`,
    },
  ]
  if (tools !== undefined && ts.isArrayLiteralExpression(tools.initializer)) {
    edits.push({ start: tools.initializer.end - 1, end: tools.initializer.end - 1, text: `${tools.initializer.elements.length > 0 ? ', ' : ''}${identifier}` })
  } else {
    const objectText = source.slice(object.getStart(sourceFile), object.getEnd())
    const openBrace = object.getStart(sourceFile) + objectText.indexOf('{') + 1
    edits.push({
      start: openBrace,
      end: openBrace,
      text: `${object.properties.length > 0 ? '\n' : ''}  tools: [${identifier}],${object.properties.length > 0 ? '' : '\n'}`,
    })
  }
  edits.sort((a, b) => b.start - a.start)
  let result = source
  for (const edit of edits) result = `${result.slice(0, edit.start)}${edit.text}${result.slice(edit.end)}`
  return { source: result, duplicate: false, invalidTools: false }
}

function newHostSource(toolFile: string, hostFile: string, name: string): string {
  let importPath = relative(dirname(hostFile), toolFile).replaceAll('\\', '/')
  if (!importPath.startsWith('.')) importPath = `./${importPath}`
  importPath = importPath.replace(/\.ts$/, '.js')
  return `import { defineHost } from '@becomeopc/dshx/host'\nimport { ${toolIdentifier(name)} } from ${JSON.stringify(importPath)}\n\nexport default defineHost({\n  tools: [${toolIdentifier(name)}],\n})\n`
}

function result(
  project: ResolvedDshxConfig,
  options: AddToolOptions,
  diagnostics: readonly DshxDiagnostic[],
  plan: readonly FilePlan[],
  diffText?: string,
): AddToolResult {
  return {
    root: project.root,
    name: options.name,
    changedFiles: plan.map(item => item.file),
    generatedFiles: plan.filter(item => item.before === undefined).map(item => item.file),
    diagnostics,
    dryRun: options.dryRun ?? false,
    ...(diffText === undefined ? {} : { diff: diffText }),
  }
}

function explicitHostDisabled(project: ResolvedDshxConfig, configSource: string | undefined): boolean {
  return project.hostEntry === undefined && configSource !== undefined && /(?:^|[,{\n])\s*host\s*:\s*false\b/.test(configSource)
}

/** Generate an official defineTool skeleton and attach it to a DSHX Host. */
export async function createToolScaffold(options: AddToolOptions, dependencies: AddToolDependencies = {}): Promise<AddToolResult> {
  const { project } = options
  const file = project.packageFile
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(options.name) || options.name.trim() !== options.name) {
    return result(
      project,
      options,
      [
        diagnostic(
          'DSHX6201',
          `Invalid Tool name ${JSON.stringify(options.name)}.`,
          file,
          'Use a non-empty name containing letters, numbers, dots, hyphens, or underscores.',
        ),
      ],
      [],
    )
  }
  const toolFile = resolve(project.root, options.file ?? `src/tools/${safeFileName(options.name)}.ts`)
  if (!insideProject(project.root, toolFile) || !toolFile.endsWith('.ts')) {
    return result(
      project,
      options,
      [
        diagnostic(
          'DSHX6202',
          `Tool file must be a .ts path inside the project root: ${toolFile}.`,
          file,
          'Use --file with a path such as src/tools/status.ts.',
        ),
      ],
      [],
    )
  }
  const existingToolFile = await readOptionalFile(toolFile)
  if (existingToolFile !== undefined) {
    const ast = ts.createSourceFile(toolFile, existingToolFile, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
    if (hasTool(ast, options.name))
      return result(
        project,
        options,
        [
          diagnostic(
            'DSHX6206',
            `Tool ${JSON.stringify(options.name)} is already defined in ${toolFile}.`,
            toolFile,
            'Keep the existing Tool; no files were changed.',
            'warning',
          ),
        ],
        [],
      )
    return result(
      project,
      options,
      [
        diagnostic(
          'DSHX6202',
          `Tool file already exists: ${toolFile}.`,
          toolFile,
          'Choose another --file path or remove the existing file after reviewing it.',
        ),
      ],
      [],
    )
  }
  const hostFile = project.hostEntry ?? resolve(project.root, 'src/host.ts')
  if (!insideProject(project.root, hostFile))
    return result(
      project,
      options,
      [diagnostic('DSHX6202', `Host file must stay inside the project root: ${hostFile}.`, file, 'Move the Host entry under the project root.')],
      [],
    )
  const configSource = project.configFile === undefined ? undefined : await readOptionalFile(project.configFile)
  if (explicitHostDisabled(project, configSource))
    return result(
      project,
      options,
      [
        diagnostic(
          'DSHX6203',
          'Host is explicitly disabled for this project.',
          project.configFile ?? file,
          'Remove host: false or create the Tool through a project with an enabled Host face.',
        ),
      ],
      [],
    )
  const hostBefore = await readOptionalFile(hostFile)
  const toolAfter = sourceForTool(options.name, options.description ?? 'Generated DSHX tool.')
  let hostAfter: string
  if (hostBefore === undefined) {
    hostAfter = newHostSource(toolFile, hostFile, options.name)
  } else {
    const modified = modifyHost(hostBefore, hostFile, toolFile, options.name)
    if (modified.duplicate)
      return result(
        project,
        options,
        [
          diagnostic(
            'DSHX6206',
            `Tool ${JSON.stringify(options.name)} is already registered in ${hostFile}.`,
            hostFile,
            'Keep the existing Tool; no files were changed.',
            'warning',
          ),
        ],
        [],
      )
    if (modified.invalidTools)
      return result(
        project,
        options,
        [diagnostic('DSHX6205', 'Host defineHost tools must be an array.', hostFile, 'Change tools to an array of official ToolDefinition values.')],
        [],
      )
    if (modified.source === undefined)
      return result(
        project,
        options,
        [
          diagnostic(
            'DSHX6204',
            `Host ${hostFile} is not a DSHX defineHost default export.`,
            hostFile,
            'Export default defineHost({ tools: [...] }) or register the Tool manually in native Host code.',
          ),
        ],
        [],
      )
    hostAfter = modified.source
  }
  const plan: FilePlan[] = [
    { file: toolFile, after: toolAfter },
    ...(hostBefore === undefined ? [{ file: hostFile, after: hostAfter }] : [{ file: hostFile, before: hostBefore, after: hostAfter }]),
  ]
  if (options.dryRun) return result(project, options, [], plan, renderFileDiff(plan))
  try {
    await applyFilePlan(plan)
  } catch (cause) {
    return result(
      project,
      options,
      [
        diagnostic(
          'DSHX6207',
          `Failed to write Tool scaffold: ${cause instanceof Error ? cause.message : String(cause)}`,
          toolFile,
          'Fix filesystem permissions and retry; no partial changes were kept.',
        ),
      ],
      [],
    )
  }
  const postProject: ResolvedDshxConfig = { ...project, ...(hostBefore === undefined ? { hostEntry: hostFile } : {}) }
  let postDiagnostics: readonly DshxDiagnostic[]
  try {
    postDiagnostics = await (dependencies.checkManifest ?? checkProjectManifest)(postProject)
  } catch (cause) {
    await rollbackFilePlan(plan)
    return result(
      project,
      options,
      [
        diagnostic(
          'DSHX6208',
          `Generated Tool scaffold could not be validated: ${cause instanceof Error ? cause.message : String(cause)}`,
          file,
          'Fix the project manifest before generating a Tool.',
        ),
      ],
      [],
    )
  }
  if (postDiagnostics.some(item => item.severity === 'error')) {
    await rollbackFilePlan(plan)
    return result(
      project,
      options,
      [
        diagnostic(
          'DSHX6208',
          'Generated Tool scaffold failed Manifest Checker validation and was rolled back.',
          file,
          'Fix the project manifest before generating a Tool.',
        ),
        ...postDiagnostics,
      ],
      [],
    )
  }
  return result(project, options, postDiagnostics, plan)
}
