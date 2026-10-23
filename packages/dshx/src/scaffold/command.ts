import { resolve } from 'node:path'
import type { ResolvedDshxConfig } from '../config/types.js'
import type { DshxDiagnostic } from '../diagnostics.js'
import { checkProjectManifest } from '../project/index.js'
import type { FilePlan } from './common.js'
import { declaresCall, identifierName, importPath, scaffoldContribution } from './generator.js'
import type { ContributionMessages } from './generator.js'

export interface AddCommandOptions {
  readonly project: ResolvedDshxConfig
  readonly name: string
  readonly description?: string
  readonly file?: string
  readonly dryRun?: boolean
}

export interface AddCommandResult {
  readonly root: string
  readonly name: string
  readonly changedFiles: readonly string[]
  readonly generatedFiles: readonly string[]
  readonly diagnostics: readonly DshxDiagnostic[]
  readonly dryRun: boolean
  readonly diff?: string
}

export interface AddCommandDependencies {
  readonly checkManifest?: typeof checkProjectManifest
}

const messages: ContributionMessages = {
  invalidPath: { code: 'DSHX6502', hint: 'Use --file with a path such as src/commands/status.ts.' },
  entryPath: { code: 'DSHX6502', hint: 'Move the Host entry under the project root.' },
  entryDisabled: { code: 'DSHX6503', hint: 'Remove host: false or use a project with an enabled Host face.' },
  targetExists: { code: 'DSHX6502', hint: 'Choose another --file path or remove the existing file after reviewing it.' },
  duplicateInTarget: { code: 'DSHX6506', hint: 'Keep the existing Command; no files were changed.' },
  duplicateInEntry: { code: 'DSHX6506', hint: 'Keep the existing Command; no files were changed.' },
  invalidEntry: { code: 'DSHX6504', hint: 'Export default defineHost({ commands: [...] }) or register the Command manually in native Host code.' },
  invalidRegistration: { code: 'DSHX6505', hint: 'Change commands to an array of official CommandDefinition values.' },
  writeFailed: { code: 'DSHX6507', hint: 'Fix filesystem permissions and retry; no partial changes were kept.' },
  validation: { code: 'DSHX6508', hint: 'Fix the project manifest before generating a Command.' },
}

function commandIdentifier(name: string): string {
  return `${identifierName(name, 'Command')}Command`
}

function sourceForCommand(name: string, description: string): string {
  const identifier = commandIdentifier(name)
  return `import { defineCommand } from '@becomeopc/dshx/host'\n\nexport const ${identifier} = defineCommand({\n  name: ${JSON.stringify(name)},\n  description: ${JSON.stringify(description)},\n  handler() {\n    return { kind: 'success', text: ${JSON.stringify(`Implement /${name}`)} }\n  },\n})\n`
}

function newHostSource(commandFile: string, hostFile: string, name: string): string {
  const identifier = commandIdentifier(name)
  return `import { defineHost } from '@becomeopc/dshx/host'\nimport { ${identifier} } from ${JSON.stringify(importPath(hostFile, commandFile))}\n\nexport default defineHost({\n  commands: [${identifier}],\n})\n`
}

function result(
  project: ResolvedDshxConfig,
  options: AddCommandOptions,
  diagnostics: readonly DshxDiagnostic[],
  plan: readonly FilePlan[],
  diff?: string,
): AddCommandResult {
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

/** Generate the smallest official Command definition and attach it to a DSHX Host. */
export async function createCommandScaffold(options: AddCommandOptions, dependencies: AddCommandDependencies = {}): Promise<AddCommandResult> {
  const { project } = options
  const description = options.description ?? 'Generated DSHX command.'
  const invalid = !/^[a-z][a-z0-9_-]*$/.test(options.name)
    ? {
        code: 'DSHX6501',
        severity: 'error' as const,
        message: `Invalid Command name ${JSON.stringify(options.name)}.`,
        file: project.packageFile,
        hint: 'Use a lowercase command name beginning with a letter and containing only letters, numbers, hyphens, or underscores.',
      }
    : description.trim() === ''
      ? {
          code: 'DSHX6501',
          severity: 'error' as const,
          message: 'Command description must not be empty.',
          file: project.packageFile,
          hint: 'Pass a non-empty --description value.',
        }
      : undefined
  if (invalid !== undefined) return result(project, options, [invalid], [])
  const targetFile = resolve(project.root, options.file ?? `src/commands/${options.name}.ts`)
  const hostFile = project.hostEntry ?? resolve(project.root, 'src/host.ts')
  const identifier = commandIdentifier(options.name)
  const outcome = await scaffoldContribution({
    project,
    label: 'Command',
    name: options.name,
    target: { file: targetFile, extension: '.ts', source: sourceForCommand(options.name, description) },
    entry: {
      file: hostFile,
      factory: 'defineHost',
      importSpecifier: identifier,
      identifier,
      registration: { kind: 'collection', property: 'commands' },
      isRegistered: ast => declaresCall(ast, 'defineCommand', 'name', options.name),
      create: newHostSource(targetFile, hostFile, options.name),
      field: 'hostEntry',
    },
    messages,
    ...(options.dryRun === undefined ? {} : { dryRun: options.dryRun }),
    ...(dependencies.checkManifest === undefined ? {} : { checkManifest: dependencies.checkManifest }),
  })
  return result(project, options, outcome.diagnostics, outcome.plan, outcome.diff)
}
