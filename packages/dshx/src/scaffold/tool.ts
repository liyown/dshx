import { resolve } from 'node:path'
import type { ResolvedDshxConfig } from '../config/types.js'
import type { DshxDiagnostic } from '../diagnostics.js'
import { checkProjectManifest } from '../project/index.js'
import type { FilePlan } from './common.js'
import { declaresCall, fileStem, identifierName, importPath, scaffoldContribution } from './generator.js'
import type { ContributionMessages } from './generator.js'

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

const messages: ContributionMessages = {
  invalidPath: { code: 'DSHX6202', hint: 'Use --file with a path such as src/tools/status.ts.' },
  entryPath: { code: 'DSHX6202', hint: 'Move the Host entry under the project root.' },
  entryDisabled: { code: 'DSHX6203', hint: 'Remove host: false or create the Tool through a project with an enabled Host face.' },
  targetExists: { code: 'DSHX6202', hint: 'Choose another --file path or remove the existing file after reviewing it.' },
  duplicateInTarget: { code: 'DSHX6206', hint: 'Keep the existing Tool; no files were changed.' },
  duplicateInEntry: { code: 'DSHX6206', hint: 'Keep the existing Tool; no files were changed.' },
  invalidEntry: { code: 'DSHX6204', hint: 'Export default defineHost({ tools: [...] }) or register the Tool manually in native Host code.' },
  invalidRegistration: { code: 'DSHX6205', hint: 'Change tools to an array of official ToolDefinition values.' },
  writeFailed: { code: 'DSHX6207', hint: 'Fix filesystem permissions and retry; no partial changes were kept.' },
  validation: { code: 'DSHX6208', hint: 'Fix the project manifest before generating a Tool.' },
}

function toolIdentifier(name: string): string {
  return `${identifierName(name, 'Tool')}Tool`
}

function sourceForTool(name: string, description: string): string {
  const identifier = toolIdentifier(name)
  return `import { defineTool } from '@becomeopc/dshx/host'\n\nexport const ${identifier} = defineTool({\n  name: ${JSON.stringify(name)},\n  description: ${JSON.stringify(description)},\n  parameters: {},\n  output: {\n    schema: { type: 'string' },\n    render: (_args, value) => [{ type: 'text', text: value }],\n  },\n  async execute() {\n    return ${JSON.stringify(`Implement ${name}`)}\n  },\n})\n`
}

function newHostSource(toolFile: string, hostFile: string, name: string): string {
  const identifier = toolIdentifier(name)
  const from = importPath(hostFile, toolFile)
  return `import { defineHost } from '@becomeopc/dshx/host'\nimport { ${identifier} } from ${JSON.stringify(from)}\n\nexport default defineHost({\n  tools: [${identifier}],\n})\n`
}

function result(
  project: ResolvedDshxConfig,
  options: AddToolOptions,
  diagnostics: readonly DshxDiagnostic[],
  plan: readonly FilePlan[],
  diff?: string,
): AddToolResult {
  return {
    root: project.root,
    name: options.name,
    changedFiles: plan.map(item => item.file),
    generatedFiles: plan.filter(item => item.before === undefined).map(item => item.file),
    diagnostics,
    dryRun: options.dryRun ?? false,
    ...(diff === undefined ? {} : { diff }),
  }
}

/** Generate an official defineTool skeleton and attach it to a DSHX Host. */
export async function createToolScaffold(options: AddToolOptions, dependencies: AddToolDependencies = {}): Promise<AddToolResult> {
  const { project } = options
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(options.name) || options.name.trim() !== options.name) {
    return result(
      project,
      options,
      [
        {
          code: 'DSHX6201',
          severity: 'error',
          message: `Invalid Tool name ${JSON.stringify(options.name)}.`,
          file: project.packageFile,
          hint: 'Use a non-empty name containing letters, numbers, dots, hyphens, or underscores.',
        },
      ],
      [],
    )
  }
  const targetFile = resolve(project.root, options.file ?? `src/tools/${fileStem(options.name, 'tool')}.ts`)
  const hostFile = project.hostEntry ?? resolve(project.root, 'src/host.ts')
  const identifier = toolIdentifier(options.name)
  const outcome = await scaffoldContribution({
    project,
    label: 'Tool',
    name: options.name,
    target: { file: targetFile, extension: '.ts', source: sourceForTool(options.name, options.description ?? 'Generated DSHX tool.') },
    entry: {
      file: hostFile,
      factory: 'defineHost',
      importSpecifier: identifier,
      identifier,
      registration: { kind: 'collection', property: 'tools' },
      isRegistered: ast => declaresCall(ast, 'defineTool', 'name', options.name),
      create: newHostSource(targetFile, hostFile, options.name),
      field: 'hostEntry',
    },
    messages,
    ...(options.dryRun === undefined ? {} : { dryRun: options.dryRun }),
    ...(dependencies.checkManifest === undefined ? {} : { checkManifest: dependencies.checkManifest }),
  })
  return result(project, options, outcome.diagnostics, outcome.plan, outcome.diff)
}
