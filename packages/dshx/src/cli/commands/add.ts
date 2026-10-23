import { isCancel, select, text } from '@clack/prompts'
import type { ResolvedDshxConfig } from '../../config/types.js'
import type { DshxDiagnostic } from '../../diagnostics.js'
import type { checkProjectManifest } from '../../project/index.js'
import { createCommandScaffold, createHookScaffold, createToolScaffold, createUiScaffold } from '../../scaffold/index.js'
import type { AddCommandOptions, AddHookOptions, AddToolOptions, AddUiOptions, AddUiResult } from '../../scaffold/index.js'
import type { CliArgs } from '../args.js'
import type { CliIO, CliRunOptions, CliRuntime } from '../context.js'
import { defaultIO, diagnosticFromError, printVerboseCause, write } from '../presentation.js'
import { projectSummary, renderReport } from '../report.js'

/** What every contribution command reports, whatever it generated. */
interface ContributionRun {
  readonly changedFiles: readonly string[]
  readonly generatedFiles: readonly string[]
  readonly diagnostics: readonly DshxDiagnostic[]
  readonly dryRun: boolean
  readonly diff?: string
}

interface ContributionRequest {
  readonly project: ResolvedDshxConfig
  readonly value: string
  readonly args: CliArgs
  readonly runtime: CliRuntime
}

/**
 * The one thing `add tool`, `add command` and `add hook` each supply: what to
 * ask for, what to print when it is missing, and how to generate it.
 */
interface ContributionKind {
  readonly label: string
  readonly prompt: string
  readonly key: 'name' | 'event'
  readonly value: (args: CliArgs) => string | undefined
  readonly missing: { readonly code: string; readonly message: string; readonly hint: string }
  readonly generate: (request: ContributionRequest) => Promise<ContributionRun>
}

function addSummary(project: ResolvedDshxConfig, result: AddUiResult): Record<string, unknown> {
  return {
    project: projectSummary(project),
    slot: result.slot,
    provider: result.provider,
    changedFiles: result.changedFiles,
    generatedFiles: result.generatedFiles,
    manifestChanged: result.manifestChanged,
    diagnostics: result.diagnostics,
    ...(result.diff === undefined ? {} : { diff: result.diff }),
  }
}

async function selectSlotInteractively(io: CliIO, items: readonly { readonly name: string }[]): Promise<string | undefined> {
  if (items.length === 0) return undefined
  const answer = await select({
    message: 'Select a Slot',
    options: items.map(item => ({ value: item.name, label: item.name })),
    input: io.stdin,
    output: io.stdout,
  })
  return isCancel(answer) ? undefined : answer
}

async function runAddUi(args: CliArgs, options: CliRunOptions, project: ResolvedDshxConfig): Promise<number> {
  const io = options.io ?? defaultIO()
  const runtime = options.runtime ?? {}
  if (args.slot === undefined && (args.json || !io.stdin.isTTY)) {
    const item = {
      code: 'DSHX6101',
      severity: 'error' as const,
      message: 'A Slot name is required in non-interactive mode.',
      file: project.packageFile,
      hint: 'Pass --slot <slot-name>, or run in a TTY to choose a Slot interactively.',
    }
    return renderReport(io, args.json, { code: 2, diagnostics: [item], json: { project: projectSummary(project), diagnostics: [item] } })
  }
  const addOptions: AddUiOptions = {
    project,
    ...(args.slot === undefined ? {} : { slot: args.slot }),
    ...(args.provider === undefined ? {} : { provider: args.provider }),
    ...(args.file === undefined ? {} : { file: args.file }),
    ...(args.id === undefined ? {} : { id: args.id }),
    ...(args.order === undefined ? {} : { order: args.order }),
    dryRun: args.dryRun,
  }
  const add =
    runtime.addUi ??
    (async (value: AddUiOptions) =>
      createUiScaffold(value, {
        ...(runtime.inspectComposition === undefined ? {} : { inspectComposition: runtime.inspectComposition }),
        ...(runtime.checkManifest === undefined ? {} : { checkManifest: runtime.checkManifest }),
        ...(args.slot === undefined ? { selectSlot: (items: readonly { readonly name: string }[]) => selectSlotInteractively(io, items) } : {}),
      }))
  let result: AddUiResult
  try {
    result = await add(addOptions)
  } catch (error) {
    const item = diagnosticFromError(error, project.packageFile)
    const code = renderReport(io, args.json, { code: 1, diagnostics: [item], json: { project: projectSummary(project), diagnostics: [item] } })
    if (args.verbose) printVerboseCause(io, error)
    return code
  }
  const failed = result.diagnostics.some(item => item.severity === 'error')
  return renderReport(io, args.json, {
    code: failed ? 1 : 0,
    diagnostics: result.diagnostics,
    json: addSummary(project, result),
    text: () => {
      if (failed) return
      write(io.stdout, `${args.dryRun ? 'Planned' : 'Generated'} UI Slot ${result.slot.name} using ${result.provider}\n`)
      for (const file of result.changedFiles) write(io.stdout, `  ${file}\n`)
      if (result.diff !== undefined) write(io.stdout, result.diff)
    },
  })
}

async function promptLine(io: CliIO, question: string): Promise<string> {
  const answer = await text({ message: question.replace(/:\s*$/, ''), input: io.stdin, output: io.stdout })
  return isCancel(answer) ? '' : answer
}

function contributionSummary(project: ResolvedDshxConfig, key: 'name' | 'event', value: string, result: ContributionRun): Record<string, unknown> {
  return {
    project: projectSummary(project),
    [key]: value,
    changedFiles: result.changedFiles,
    generatedFiles: result.generatedFiles,
    diagnostics: result.diagnostics,
    dryRun: result.dryRun,
    ...(result.diff === undefined ? {} : { diff: result.diff }),
  }
}

function generatorDependencies(runtime: CliRuntime): { checkManifest?: typeof checkProjectManifest } {
  return runtime.checkManifest === undefined ? {} : { checkManifest: runtime.checkManifest }
}

const contributionKinds: Record<'tool' | 'command' | 'hook', ContributionKind> = {
  tool: {
    label: 'Tool',
    prompt: 'Tool name: ',
    key: 'name',
    value: args => args.name,
    missing: {
      code: 'DSHX6201',
      message: 'A Tool name is required.',
      hint: 'Pass --name <name>, or run in a TTY and enter a Tool name.',
    },
    async generate({ project, value, args, runtime }) {
      const options: AddToolOptions = {
        project,
        name: value,
        ...(args.description === undefined ? {} : { description: args.description }),
        ...(args.file === undefined ? {} : { file: args.file }),
        dryRun: args.dryRun,
      }
      return runtime.addTool === undefined ? await createToolScaffold(options, generatorDependencies(runtime)) : await runtime.addTool(options)
    },
  },
  command: {
    label: 'Command',
    prompt: 'Command name: ',
    key: 'name',
    value: args => args.name,
    missing: {
      code: 'DSHX6501',
      message: 'A Command name is required.',
      hint: 'Pass --name <name>, or run in a TTY and enter a Command name.',
    },
    async generate({ project, value, args, runtime }) {
      const options: AddCommandOptions = {
        project,
        name: value,
        ...(args.description === undefined ? {} : { description: args.description }),
        ...(args.file === undefined ? {} : { file: args.file }),
        dryRun: args.dryRun,
      }
      return runtime.addCommand === undefined ? await createCommandScaffold(options, generatorDependencies(runtime)) : await runtime.addCommand(options)
    },
  },
  hook: {
    label: 'Hook',
    prompt: 'Hook event: ',
    key: 'event',
    value: args => args.event,
    missing: {
      code: 'DSHX6301',
      message: 'A Hook event is required.',
      hint: 'Pass --event <event.name>, or run in a TTY and enter a Hook event.',
    },
    async generate({ project, value, args, runtime }) {
      const options: AddHookOptions = {
        project,
        event: value,
        ...(args.file === undefined ? {} : { file: args.file }),
        dryRun: args.dryRun,
      }
      return runtime.addHook === undefined ? await createHookScaffold(options, generatorDependencies(runtime)) : await runtime.addHook(options)
    },
  },
}

async function runAddContribution(args: CliArgs, options: CliRunOptions, project: ResolvedDshxConfig, kind: ContributionKind): Promise<number> {
  const io = options.io ?? defaultIO()
  const runtime = options.runtime ?? {}
  let value = kind.value(args)
  if (value === undefined && io.stdin.isTTY && !args.json) value = (await promptLine(io, kind.prompt)).trim()
  if (value === undefined || value === '') {
    const item = {
      code: kind.missing.code,
      severity: 'error' as const,
      message: kind.missing.message,
      file: project.packageFile,
      hint: kind.missing.hint,
    }
    return renderReport(io, args.json, {
      code: 2,
      diagnostics: [item],
      json: { project: projectSummary(project), [kind.key]: null, changedFiles: [], generatedFiles: [], diagnostics: [item], dryRun: args.dryRun },
    })
  }
  let result: ContributionRun
  try {
    result = await kind.generate({ project, value, args, runtime })
  } catch (error) {
    const item = diagnosticFromError(error, project.packageFile)
    const code = renderReport(io, args.json, {
      code: 1,
      diagnostics: [item],
      json: { project: projectSummary(project), [kind.key]: value, changedFiles: [], generatedFiles: [], diagnostics: [item], dryRun: args.dryRun },
    })
    if (args.verbose) printVerboseCause(io, error)
    return code
  }
  const failed = result.diagnostics.some(item => item.severity === 'error')
  return renderReport(io, args.json, {
    code: failed ? 1 : 0,
    diagnostics: result.diagnostics,
    json: contributionSummary(project, kind.key, value, result),
    text: () => {
      if (failed) return
      write(io.stdout, `${result.dryRun ? 'Planned' : 'Generated'} ${kind.label} ${value}\n`)
      for (const file of result.changedFiles) write(io.stdout, `  ${file}\n`)
      if (result.diff !== undefined) write(io.stdout, result.diff)
    },
  })
}

export async function runAdd(args: CliArgs, options: CliRunOptions, project: ResolvedDshxConfig): Promise<number> {
  if (args.addTarget === undefined || args.addTarget === 'ui') return await runAddUi(args, options, project)
  return await runAddContribution(args, options, project, contributionKinds[args.addTarget])
}

/** The document `--json` reports when `add` itself fails, before it can generate anything. */
export function addFailureEnvelope(args: CliArgs, item: DshxDiagnostic): Record<string, unknown> {
  if (args.addTarget === 'tool' || args.addTarget === 'command')
    return { project: null, name: args.name ?? null, changedFiles: [], generatedFiles: [], diagnostics: [item], dryRun: args.dryRun }
  if (args.addTarget === 'hook')
    return { project: null, event: args.event ?? null, changedFiles: [], generatedFiles: [], diagnostics: [item], dryRun: args.dryRun }
  return { project: null, slot: null, provider: null, changedFiles: [], generatedFiles: [], manifestChanged: false, diagnostics: [item] }
}
