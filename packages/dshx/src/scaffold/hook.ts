import { resolve } from 'node:path'
import ts from 'typescript'
import type { ResolvedDshxConfig } from '../config/types.js'
import type { DshxDiagnostic } from '../diagnostics.js'
import { checkProjectManifest } from '../project/index.js'
import type { FilePlan } from './common.js'
import { containsCall, fileStem, importPath, scaffoldContribution } from './generator.js'
import type { ContributionMessages } from './generator.js'

export interface AddHookOptions {
  readonly project: ResolvedDshxConfig
  readonly event: string
  readonly file?: string
  readonly dryRun?: boolean
}

export interface AddHookResult {
  readonly root: string
  readonly event: string
  readonly changedFiles: readonly string[]
  readonly generatedFiles: readonly string[]
  readonly diagnostics: readonly DshxDiagnostic[]
  readonly dryRun: boolean
  readonly diff?: string
}

export interface AddHookDependencies {
  readonly checkManifest?: typeof checkProjectManifest
}

const messages: ContributionMessages = {
  invalidPath: { code: 'DSHX6302', hint: 'Use --file with a path such as src/hooks/before-request.ts.' },
  entryPath: { code: 'DSHX6302', hint: 'Move the Host entry under the project root.' },
  entryDisabled: { code: 'DSHX6303', hint: 'Remove host: false or register hooks through a project with an enabled Host face.' },
  targetExists: { code: 'DSHX6302', hint: 'Choose another --file path or remove the existing file after reviewing it.' },
  duplicateInTarget: { code: 'DSHX6306', hint: 'Keep the existing Hook; no files were changed.' },
  duplicateInEntry: { code: 'DSHX6306', hint: 'Keep the existing Hook; no files were changed.' },
  invalidEntry: { code: 'DSHX6304', hint: 'Export default defineHost({ setup(ctx) { ... } }) or register the Hook manually in native Host code.' },
  invalidRegistration: { code: 'DSHX6305', hint: 'Convert setup to setup(ctx) { ... } and run add hook again.' },
  writeFailed: { code: 'DSHX6307', hint: 'Fix filesystem permissions and retry; no partial changes were kept.' },
  validation: { code: 'DSHX6308', hint: 'Fix the project manifest before generating a Hook.' },
}

function registerName(event: string): string {
  const value = event.replace(/[^a-zA-Z0-9_$]+/g, ' ').trim()
  const identifier =
    value === ''
      ? 'Hook'
      : value
          .split(/\s+/)
          .map(part => part.replace(/^([a-z])/, (_, first: string) => first.toUpperCase()))
          .join('')
  return `register${identifier}Hook`
}

function sourceForHook(event: string): string {
  return `import type { Context } from '@becomeopc/dshx/host'\n\nexport function ${registerName(event)}(ctx: Context) {\n  return ctx.on(${JSON.stringify(event)}, (...args: unknown[]) => {\n    void args\n    // Add hook behavior here.\n  })\n}\n`
}

function newHostSource(hostFile: string, hookFile: string, event: string): string {
  const name = registerName(event)
  return `import { defineHost } from '@becomeopc/dshx/host'\nimport { ${name} } from ${JSON.stringify(importPath(hostFile, hookFile))}\n\nexport default defineHost({\n  setup(ctx) {\n    ${name}(ctx)\n  },\n})\n`
}

/** Whether the source already listens for `event` through `ctx.on`. */
function listensFor(event: string): (call: ts.CallExpression) => boolean {
  return call =>
    ts.isPropertyAccessExpression(call.expression) &&
    call.expression.name.text === 'on' &&
    call.arguments[0] !== undefined &&
    ts.isStringLiteral(call.arguments[0]) &&
    call.arguments[0].text === event
}

function result(
  project: ResolvedDshxConfig,
  options: AddHookOptions,
  diagnostics: readonly DshxDiagnostic[],
  plan: readonly FilePlan[],
  diff?: string,
): AddHookResult {
  return {
    root: project.root,
    event: options.event,
    changedFiles: plan.map(item => item.file),
    generatedFiles: plan.filter(item => item.before === undefined).map(item => item.file),
    diagnostics,
    dryRun: options.dryRun ?? false,
    ...(diff === undefined ? {} : { diff }),
  }
}

/** Generate a native Cordis ctx.on hook and attach it to a DSHX Host setup. */
export async function createHookScaffold(options: AddHookOptions, dependencies: AddHookDependencies = {}): Promise<AddHookResult> {
  const { project } = options
  if (options.event.trim() === '' || /\s/.test(options.event) || options.event.includes('/') || options.event.includes('\\')) {
    return result(
      project,
      options,
      [
        {
          code: 'DSHX6301',
          severity: 'error',
          message: 'Hook event must be a non-empty event name without whitespace or path separators.',
          file: project.packageFile,
          hint: 'Pass --event <event.name> using the official Cordis event name.',
        },
      ],
      [],
    )
  }
  const targetFile = resolve(project.root, options.file ?? `src/hooks/${fileStem(options.event, 'hook')}.ts`)
  const hostFile = project.hostEntry ?? resolve(project.root, 'src/host.ts')
  const name = registerName(options.event)
  const outcome = await scaffoldContribution({
    project,
    label: 'Hook',
    name: options.event,
    target: { file: targetFile, extension: '.ts', source: sourceForHook(options.event) },
    entry: {
      file: hostFile,
      factory: 'defineHost',
      importSpecifier: name,
      identifier: name,
      registration: { kind: 'setup' },
      isRegistered: ast => containsCall(ast, listensFor(options.event)),
      create: newHostSource(hostFile, targetFile, options.event),
      field: 'hostEntry',
    },
    messages,
    ...(options.dryRun === undefined ? {} : { dryRun: options.dryRun }),
    ...(dependencies.checkManifest === undefined ? {} : { checkManifest: dependencies.checkManifest }),
  })
  return result(project, options, outcome.diagnostics, outcome.plan, outcome.diff)
}
