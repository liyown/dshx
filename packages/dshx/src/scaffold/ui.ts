import { createRequire } from 'node:module'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import ts from 'typescript'
import { DEFAULT_COMPATIBILITY } from '../compat/index.js'
import type { DshCompatibility } from '../compat/types.js'
import type { ResolvedDshxConfig } from '../config/types.js'
import type { DshxDiagnostic } from '../diagnostics.js'
import { inspectProjectComposition } from '../inspect/index.js'
import type { InspectOptions, InspectResult, SlotSummary } from '../inspect/index.js'
import { checkProjectManifest } from '../project/index.js'
import type { FilePlan } from './common.js'
import { containsCall, fileStem, identifierName, importPath, scaffoldContribution } from './generator.js'
import type { ContributionFileSystem, ContributionMessages } from './generator.js'

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

export type { ContributionFileSystem as ScaffoldFileSystem }

export interface AddUiDependencies {
  readonly fs?: Partial<ContributionFileSystem>
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

const messages: ContributionMessages = {
  invalidPath: { code: 'DSHX6106', hint: 'Use --file with a path under the project root that ends in .tsx.' },
  entryPath: { code: 'DSHX6106', hint: 'Choose a Client entry under the project root.' },
  targetExists: { code: 'DSHX6106', hint: 'Choose another --file path or remove the existing file after reviewing it.' },
  duplicateInTarget: { code: 'DSHX6109', hint: 'Keep the existing contribution; no new files were written.' },
  duplicateInEntry: { code: 'DSHX6109', hint: 'Keep the existing contribution; no new files were written.' },
  invalidEntry: { code: 'DSHX6105', hint: 'Export defineClient({ slots: [...] }) or attach the Slot manually in native Client code.' },
  writeFailed: { code: 'DSHX6107', hint: 'Fix filesystem permissions and retry; no partial changes were kept.' },
  validation: { code: 'DSHX6108', hint: 'Fix the project manifest or compatibility adapter before generating a Slot.' },
}

function diagnostic(code: string, message: string, file: string, hint: string, severity: 'error' | 'warning' = 'error'): DshxDiagnostic {
  return { code, severity, message, file, hint }
}

function defaultId(project: ResolvedDshxConfig, slot: string): string {
  return `${project.packageId}.${slot}`
}

function defaultComponentName(slot: string): string {
  return `${identifierName(slot, 'Slot')}Slot`
}

function contributionIdentifier(slot: string): string {
  return `${identifierName(slot, 'Slot')}Contribution`
}

function providerClient(provider: string): string {
  return `${provider}/client`
}

interface SlotScaffoldContract {
  readonly kind: 'list' | 'single'
  readonly registration: readonly string[]
}

/**
 * DSH 0.2 removed the first-party runtime Slots catalog, so an explicit
 * `--slot`/`--provider` pair is the only way to scaffold a Slot there. The
 * registration fields come from the caller instead of the provider catalog;
 * TypeScript checks the result against the provider's SlotRegistry.
 */
function explicitScaffoldContract(options: AddUiOptions): SlotScaffoldContract {
  const registration = [...(options.id === undefined ? [] : ['id']), ...(options.order === undefined ? [] : ['order'])]
  return { kind: registration.length === 0 ? 'single' : 'list', registration }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function scaffoldContract(slot: SlotSummary, file: string, options: AddUiOptions): { contract?: SlotScaffoldContract; diagnostic?: DshxDiagnostic } {
  if (slot.kind !== 'list' && slot.kind !== 'single') {
    return {
      diagnostic: diagnostic(
        'DSHX6110',
        `Slot ${JSON.stringify(slot.name)} uses unsupported ${JSON.stringify(slot.kind ?? 'unknown')} registration semantics.`,
        file,
        'Choose a list or single Slot, or register keyed/chain/select fields manually.',
      ),
    }
  }
  if (!isRecord(slot.metadata) || !isRecord(slot.metadata.catalog)) {
    return {
      diagnostic: diagnostic(
        'DSHX6111',
        `Slot ${JSON.stringify(slot.name)} has no stable exact contract metadata.`,
        file,
        'Run dshx inspect slots --root <slot-name> with a Client Inspect provider that exposes the full catalog.',
      ),
    }
  }
  const catalog = slot.metadata.catalog
  if (typeof catalog.replaceRisk !== 'string' || !Array.isArray(catalog.registration)) {
    return {
      diagnostic: diagnostic(
        'DSHX6111',
        `Slot ${JSON.stringify(slot.name)} has incomplete provider registration metadata.`,
        file,
        'Use an official Client Slot provider with catalog.registration and replaceRisk fields.',
      ),
    }
  }
  const registration: string[] = []
  for (const entry of catalog.registration) {
    if (
      !isRecord(entry) ||
      typeof entry.name !== 'string' ||
      entry.name.trim() === '' ||
      typeof entry.required !== 'boolean' ||
      (entry.type !== undefined && typeof entry.type !== 'string')
    ) {
      return {
        diagnostic: diagnostic(
          'DSHX6111',
          `Slot ${JSON.stringify(slot.name)} has an invalid registration field descriptor.`,
          file,
          'Use the exact contract returned by the official Client Slot Inspect provider.',
        ),
      }
    }
    registration.push(entry.name)
    if (entry.required && !['id', 'order'].includes(entry.name)) {
      return {
        diagnostic: diagnostic(
          'DSHX6110',
          `Slot ${JSON.stringify(slot.name)} requires unsupported registration field ${JSON.stringify(entry.name)}.`,
          file,
          'Register this Slot manually using its official provider contract.',
        ),
      }
    }
  }
  if (slot.kind === 'list' && !registration.includes('id')) {
    return {
      diagnostic: diagnostic(
        'DSHX6111',
        `Slot ${JSON.stringify(slot.name)} does not declare a stable list id field.`,
        file,
        'Use an exact Slot contract that exposes the required id registration field.',
      ),
    }
  }
  if (options.order !== undefined && !registration.includes('order')) {
    return {
      diagnostic: diagnostic(
        'DSHX6110',
        `Slot ${JSON.stringify(slot.name)} does not accept an order registration field.`,
        file,
        'Omit --order or register this Slot manually with the official contract.',
      ),
    }
  }
  if (slot.kind === 'single' && (options.id !== undefined || options.order !== undefined)) {
    return {
      diagnostic: diagnostic(
        'DSHX6110',
        `Slot ${JSON.stringify(slot.name)} is single-valued and does not accept id/order options.`,
        file,
        'Omit --id and --order for a single Slot, or register it manually with the official contract.',
      ),
    }
  }
  return { contract: { kind: slot.kind, registration } }
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

function generatedSource(slot: SlotSummary, provider: string, id: string, order: number, registration: readonly string[]): string {
  const component = defaultComponentName(slot.name)
  const options = [
    ...(registration.includes('id') ? [`  id: ${JSON.stringify(id)},`] : []),
    ...(registration.includes('order') ? [`  order: ${order},`] : []),
  ].join('\n')
  return `import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'\nimport type {} from ${JSON.stringify(providerClient(provider))}\nimport { defineSlot } from '@becomeopc/dshx/client'\n\nexport function ${component}(_props: PropsRuntime<${JSON.stringify(slot.name)}>) {\n  return <button type="button">{${JSON.stringify(slot.name)}}</button>\n}\n\nexport const generatedSlot = defineSlot(${JSON.stringify(slot.name)}, {\n${options}${options === '' ? '' : '\n'}  component: ${component},\n})\n`
}

function newClientSource(clientFile: string, contributionFile: string, slotName: string): string {
  const identifier = contributionIdentifier(slotName)
  return `import { defineClient } from '@becomeopc/dshx/client'\nimport { generatedSlot as ${identifier} } from ${JSON.stringify(importPath(clientFile, contributionFile))}\n\nexport default defineClient({\n  slots: [${identifier}],\n})\n`
}

/** Whether the source already declares a Slot contribution for `slotName`. */
function hasSlotRegistration(slotName: string): (call: ts.CallExpression) => boolean {
  return call =>
    ts.isIdentifier(call.expression) &&
    call.expression.text === 'defineSlot' &&
    call.arguments[0] !== undefined &&
    ts.isStringLiteral(call.arguments[0]) &&
    call.arguments[0].text === slotName
}

function updateManifest(source: string, provider: string, compatibility: DshCompatibility): { source: string; manifest: Record<string, unknown> } {
  const value = JSON.parse(source) as Record<string, unknown>
  const exports = value.exports
  if (exports !== undefined && (typeof exports !== 'object' || exports === null || Array.isArray(exports)))
    throw new Error('package.json exports must be an object when adding a Client entry.')
  const nextExports = (exports ?? {}) as Record<string, unknown>
  const existingClient = nextExports['./client']
  if (
    existingClient !== undefined &&
    existingClient !== './dist/client.js' &&
    !(
      typeof existingClient === 'object' &&
      existingClient !== null &&
      !Array.isArray(existingClient) &&
      (existingClient as Record<string, unknown>).default === './dist/client.js'
    )
  )
    throw new Error('package.json already declares an incompatible ./client export.')
  nextExports['./client'] = existingClient ?? './dist/client.js'
  value.exports = nextExports
  const dsh = typeof value.dsh === 'object' && value.dsh !== null && !Array.isArray(value.dsh) ? (value.dsh as Record<string, unknown>) : {}
  const client = typeof dsh.client === 'object' && dsh.client !== null && !Array.isArray(dsh.client) ? (dsh.client as Record<string, unknown>) : {}
  const inject = Array.isArray(client.inject) && client.inject.every(item => typeof item === 'string') ? [...(client.inject as string[])] : []
  if (!inject.includes(provider)) inject.push(provider)
  dsh.client = {
    ...client,
    platform: compatibility.client.manifest.platform,
    inject,
    external: Array.isArray(client.external) ? client.external : [],
    immediately: typeof client.immediately === 'boolean' ? client.immediately : false,
  }
  value.dsh = { ...dsh, client: dsh.client }
  return { source: `${JSON.stringify(value, null, 2)}\n`, manifest: value }
}

function result(
  project: ResolvedDshxConfig,
  slot: SlotSummary,
  provider: string,
  diagnostics: readonly DshxDiagnostic[],
  plan: readonly FilePlan[],
  manifestChanged: boolean,
  diff?: string,
): AddUiResult {
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
  const packageFile = project.packageFile
  const readSource = dependencies.fs?.readFile ?? readFile
  let inspect: InspectResult
  try {
    inspect = await (dependencies.inspectComposition ?? inspectProjectComposition)(project, 'slots', options.inspect)
  } catch {
    const item = diagnostic(
      'DSHX6102',
      'Unable to inspect the running DSH composition.',
      packageFile,
      'Start a supported DSH Runtime Inspect Provider and retry.',
      'error',
    )
    return result(project, { name: options.slot ?? '' }, options.provider ?? '', [item], [], false)
  }
  let explicitContract: SlotScaffoldContract | undefined
  if (inspect.diagnostics.some(item => item.severity === 'error')) {
    const errors = inspect.diagnostics.filter(item => item.severity === 'error')
    const explicitSlot = options.slot?.trim()
    const explicitProvider = options.provider?.trim()
    if (
      errors.every(item => item.code === 'DSHX3204') &&
      explicitSlot !== undefined &&
      explicitSlot !== '' &&
      explicitProvider !== undefined &&
      explicitProvider !== ''
    ) {
      explicitContract = explicitScaffoldContract(options)
      inspect = { ...inspect, diagnostics: [], items: [{ name: explicitSlot, provider: explicitProvider, kind: explicitContract.kind }] }
    } else {
      const mapped = inspect.diagnostics.map(item => (item.code === 'DSHX3201' ? diagnostic('DSHX6102', item.message, item.file, item.hint) : item))
      return result(project, { name: options.slot ?? '' }, options.provider ?? '', mapped, [], false)
    }
  }
  const warnings =
    explicitContract === undefined
      ? []
      : [
          diagnostic(
            'DSHX6112',
            'DSH 0.2 exposes no runtime Slot catalog; the generated registration was not checked against the provider contract.',
            packageFile,
            'Verify the generated Slot against the provider types with dshx check; adjust --id/--order if the provider declares a different registration.',
            'warning',
          ),
        ]
  const slots = inspect.items as readonly SlotSummary[]
  let slotName = options.slot
  if (slotName === undefined) slotName = await dependencies.selectSlot?.(slots)
  if (slotName === undefined || slotName.trim() === '') {
    const item = diagnostic(
      'DSHX6101',
      'A Slot name is required in non-interactive mode.',
      packageFile,
      'Pass --slot <slot-name>, or run in a TTY to choose a Slot interactively.',
    )
    return result(project, { name: '' }, options.provider ?? '', [item], [], false)
  }
  const treeSlot = slots.find(item => item.name === slotName)
  if (treeSlot === undefined) {
    const item = diagnostic(
      'DSHX6103',
      `Slot ${JSON.stringify(slotName)} was not returned by the Runtime Inspect Provider.`,
      packageFile,
      'Run dshx inspect slots and choose an available Slot name.',
    )
    return result(project, { name: slotName }, options.provider ?? '', [item], [], false)
  }
  let exact: InspectResult = inspect
  if (explicitContract === undefined) {
    try {
      exact = await (dependencies.inspectComposition ?? inspectProjectComposition)(project, 'slots', { ...(options.inspect ?? {}), slotRoot: treeSlot.name })
    } catch {
      const item = diagnostic(
        'DSHX6102',
        'Unable to inspect the exact Slot contract from the running DSH composition.',
        packageFile,
        'Start a supported Client Slot Inspect Provider and retry.',
        'error',
      )
      return result(project, treeSlot, options.provider ?? treeSlot.provider ?? '', [item], [], false)
    }
    if (exact.diagnostics.some(item => item.severity === 'error')) {
      const mapped = exact.diagnostics.map(item =>
        item.code === 'DSHX3201' || item.code === 'DSHX3202' || item.code === 'DSHX3205'
          ? diagnostic('DSHX6102', item.message, item.file, item.hint)
          : item.code === 'DSHX3203'
            ? diagnostic('DSHX6111', item.message, item.file, item.hint)
            : item,
      )
      return result(project, treeSlot, options.provider ?? treeSlot.provider ?? '', mapped, [], false)
    }
  }
  const exactSlot = (exact.items as readonly SlotSummary[]).find(item => item.name === treeSlot.name)
  if (exactSlot === undefined) {
    const item = diagnostic(
      'DSHX6111',
      `Exact contract for Slot ${JSON.stringify(treeSlot.name)} was not returned by the Client Inspect Provider.`,
      packageFile,
      'Run dshx inspect slots --root <slot-name> and retry after the Client provider is synchronized.',
    )
    return result(project, treeSlot, options.provider ?? treeSlot.provider ?? '', [item], [], false)
  }
  const exactContract = explicitContract === undefined ? scaffoldContract(exactSlot, packageFile, options) : { contract: explicitContract }
  if (exactContract.diagnostic !== undefined)
    return result(project, exactSlot, options.provider ?? exactSlot.provider ?? treeSlot.provider ?? '', [exactContract.diagnostic], [], false)
  const contract = exactContract.contract!
  const slot: SlotSummary = { ...treeSlot, ...exactSlot, ...(exactSlot.metadata === undefined ? {} : { metadata: exactSlot.metadata }) }
  const provider = options.provider ?? slot.provider
  if (provider === undefined || provider.trim() === '') {
    const item = diagnostic(
      'DSHX6103',
      `Slot ${JSON.stringify(slot.name)} has no provider package metadata.`,
      packageFile,
      'Pass --provider <package> explicitly or use a provider that exposes package metadata.',
    )
    return result(project, slot, '', [item], [], false)
  }
  if (options.provider !== undefined && slot.provider !== undefined && options.provider !== slot.provider) {
    const item = diagnostic(
      'DSHX6103',
      `Provider ${JSON.stringify(options.provider)} does not match the inspected provider ${JSON.stringify(slot.provider)}.`,
      packageFile,
      'Use the provider reported by dshx inspect slots or inspect the desired Slot again.',
    )
    return result(project, slot, provider, [item], [], false)
  }
  if (options.id !== undefined && options.id.trim() === '') {
    const item = diagnostic(
      'DSHX6101',
      'The Slot registration id must be a non-empty string.',
      packageFile,
      'Pass a non-empty value to --id or omit it to use the deterministic default.',
    )
    return result(project, slot, provider, [item], [], false)
  }
  if (options.order !== undefined && !Number.isInteger(options.order)) {
    const item = diagnostic('DSHX6101', 'The Slot order must be an integer.', packageFile, 'Pass an integer value to --order or omit it to use 0.')
    return result(project, slot, provider, [item], [], false)
  }
  const providerExists = await (dependencies.resolveProvider ?? defaultResolveProvider)(project.root, provider)
  if (!providerExists) {
    const item = diagnostic(
      'DSHX6104',
      `Provider type entry ${JSON.stringify(providerClient(provider))} is not installed.`,
      packageFile,
      `Install ${provider} as a project devDependency, then run dshx add ui again.`,
    )
    return result(project, slot, provider, [item], [], false)
  }
  const clientFile = project.clientEntry ?? resolve(project.root, 'src/client.tsx')
  const targetFile = resolve(project.root, options.file ?? `src/slots/${fileStem(slot.name, 'slot')}.tsx`)
  const clientBefore = await readExisting(readSource, clientFile)
  const packageBefore = await readExisting(readSource, packageFile)
  if (packageBefore === undefined) {
    const item = diagnostic('DSHX6107', `Cannot read project manifest: ${packageFile}.`, packageFile, 'Fix the project manifest permissions and retry.')
    return result(project, slot, provider, [item], [], false)
  }
  let manifestAfter: string | undefined
  let manifest: Record<string, unknown> | undefined
  if (clientBefore === undefined) {
    try {
      const updated = updateManifest(packageBefore, provider, dependencies.compatibility ?? DEFAULT_COMPATIBILITY)
      manifestAfter = updated.source
      manifest = updated.manifest
    } catch (cause) {
      const item = diagnostic(
        'DSHX6107',
        `Cannot update project manifest: ${cause instanceof Error ? cause.message : String(cause)}`,
        packageFile,
        'Fix package.json exports and DSH metadata before generating a Client.',
      )
      return result(project, slot, provider, [item], [], false)
    }
  }
  const identifier = contributionIdentifier(slot.name)
  const outcome = await scaffoldContribution({
    project,
    label: 'Slot',
    name: slot.name,
    target: {
      file: targetFile,
      extension: '.tsx',
      source: generatedSource(slot, provider, options.id ?? defaultId(project, slot.name), options.order ?? 0, contract.registration),
    },
    entry: {
      file: clientFile,
      factory: 'defineClient',
      importSpecifier: `generatedSlot as ${identifier}`,
      identifier,
      registration: { kind: 'collection', property: 'slots' },
      isRegistered: ast => containsCall(ast, hasSlotRegistration(slot.name)),
      create: newClientSource(clientFile, targetFile, slot.name),
      field: 'clientEntry',
    },
    messages,
    ...(options.dryRun === undefined ? {} : { dryRun: options.dryRun }),
    ...(manifestAfter === undefined ? {} : { extraFiles: [{ file: packageFile, before: packageBefore, after: manifestAfter }] }),
    ...(manifest === undefined ? {} : { manifest }),
    ...(dependencies.checkManifest === undefined ? {} : { checkManifest: dependencies.checkManifest }),
    checkManifestOptions: { compatibility: dependencies.compatibility ?? inspect.dsh?.compatibility ?? DEFAULT_COMPATIBILITY },
    ...(dependencies.fs === undefined ? {} : { fs: dependencies.fs }),
  })
  return result(project, slot, provider, [...warnings, ...outcome.diagnostics], outcome.plan, manifest !== undefined, outcome.diff)
}

async function readExisting(readSource: (file: string, encoding: 'utf8') => Promise<string>, file: string): Promise<string | undefined> {
  try {
    return await readSource(file, 'utf8')
  } catch {
    return undefined
  }
}
