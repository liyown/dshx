import { mkdir, rm, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import type { InlineConfig, Plugin, PluginOption, ResolvedConfig } from 'vite'
import { DshxError } from '../diagnostics.js'
import { resolveVitePlugins } from '../config/vite-plugins.js'
import type { BuildArtifact, BuildReport, BuildWatcher } from './types.js'

interface KernelBoundary {
  readonly face: 'host' | 'client'
  readonly root: string
  readonly input: string
  readonly target: string
  readonly assetsInlineLimit: NonNullable<NonNullable<InlineConfig['build']>['assetsInlineLimit']>
  readonly external: NonNullable<NonNullable<NonNullable<InlineConfig['build']>['rollupOptions']>['external']>
  readonly output: Record<string, unknown>
  readonly cssCodeSplit?: boolean
}

/** Resolve native Vite PluginOption nesting while retaining its declared order. */
export async function resolveUserPlugins(options: readonly PluginOption[] | undefined, watch: boolean): Promise<Plugin[]> {
  return resolveVitePlugins(options, watch)
}

function sameOutputValue(actual: unknown, expected: unknown): boolean {
  if (typeof expected === 'function') return actual === expected
  return actual === expected
}

function outputRecord(config: ResolvedConfig): Record<string, unknown> {
  const output = config.build.rollupOptions.output
  if (Array.isArray(output)) {
    throw new DshxError('DSHX1403', 'A Vite plugin replaced the single DSHX output with multiple outputs.')
  }
  return (output ?? {}) as Record<string, unknown>
}

/** Assert that user config hooks did not escape the bounded extension surface. */
export function kernelBoundaryPlugin(boundary: KernelBoundary): Plugin {
  const fail = (field: string): never => {
    throw new DshxError('DSHX1403', `A Vite plugin attempted to override protected ${boundary.face} build field ${field}.`, {
      hint: 'DSHX plugins may transform modules, but cannot replace root, entries, protocol output, target, chunking, externals, or asset policy.',
    })
  }
  const assertOutput = (output: Record<string, unknown>): void => {
    for (const [field, expected] of Object.entries(boundary.output)) {
      if (!sameOutputValue(output[field], expected)) fail(`build.rollupOptions.output.${field}`)
    }
    if (output.manualChunks !== undefined) fail('build.rollupOptions.output.manualChunks')
  }
  return {
    name: `dshx-${boundary.face}-kernel-boundary`,
    enforce: 'post',
    configResolved(config) {
      if (config.command !== 'build') fail('command')
      if (config.root !== boundary.root) fail('root')
      if (config.configFile !== undefined) fail('configFile')
      if (config.publicDir !== '') fail('publicDir')
      if (config.build.target !== boundary.target) fail('build.target')
      if (config.build.assetsInlineLimit !== boundary.assetsInlineLimit) fail('build.assetsInlineLimit')
      if (boundary.cssCodeSplit !== undefined && config.build.cssCodeSplit !== boundary.cssCodeSplit) fail('build.cssCodeSplit')
      if (config.build.rollupOptions.input !== boundary.input) fail('build.rollupOptions.input')
      if (config.build.rollupOptions.external !== boundary.external) fail('build.rollupOptions.external')
      assertOutput(outputRecord(config))
    },
    outputOptions(output) {
      assertOutput(output as unknown as Record<string, unknown>)
      return null
    },
  }
}

function declarationSource(): string {
  return [
    "import type { Context } from '@deepseek-ai/cordis'",
    '',
    'export declare const name: string',
    'export declare const inject: readonly string[] | Readonly<Record<string, unknown>> | undefined',
    'export declare const Config: unknown',
    'export declare function apply(ctx: Context, config?: unknown): unknown',
    '',
  ].join('\n')
}

/** Materialize declarations for the actual module shape loaded by DSH/Cordis. */
export function artifactDeclarationPlugin(face: 'host' | 'client', outDir: string, enabled: boolean): Plugin {
  const fileName = face === 'host' ? 'index.d.ts' : 'client.d.ts'
  return {
    name: `dshx-${face}-artifact-declaration`,
    enforce: 'post',
    async writeBundle() {
      if (!enabled) {
        await rm(resolve(outDir, fileName), { force: true })
        return
      }
      await mkdir(outDir, { recursive: true })
      await writeFile(resolve(outDir, fileName), declarationSource(), 'utf8')
    },
  }
}

interface CompletedOutput {
  readonly output: ReadonlyArray<{ readonly fileName: string; readonly type: 'asset' | 'chunk' }>
}

function rollupOutput(result: unknown, code: string): CompletedOutput {
  if (Array.isArray(result)) {
    if (result.length === 1 && result[0] !== undefined) return result[0] as CompletedOutput
    throw new DshxError(code, `Expected one build output, received ${result.length}.`)
  }
  if (typeof result !== 'object' || result === null || !Array.isArray((result as CompletedOutput).output)) {
    throw new DshxError(code, 'Expected one completed build output.')
  }
  return result as CompletedOutput
}

/** Convert Vite/Rolldown output to the stable DSHX report surface. */
export function buildReport(
  result: unknown,
  face: 'host' | 'client',
  entryFile: string,
  outDir: string,
  declarations: boolean,
  errorCode: string,
): BuildReport {
  const built = rollupOutput(result, errorCode)
  const output: BuildArtifact[] = built.output.map(item => ({
    fileName: item.fileName,
    type: item.type,
  }))
  if (declarations) output.push({ fileName: face === 'host' ? 'index.d.ts' : 'client.d.ts', type: 'declaration' })
  return { face, entryFile, outDir, output }
}

/** Validate the structural Vite watcher once at the compiler boundary. */
export function buildWatcher(result: unknown, face: 'host' | 'client', errorCode: string): BuildWatcher {
  const candidate = result as { on?: unknown; close?: unknown }
  if (Array.isArray(result) || typeof result !== 'object' || result === null || typeof candidate.on !== 'function' || typeof candidate.close !== 'function') {
    throw new DshxError(errorCode, `Expected one ${face} watcher result.`, {
      hint: 'Restart the dev session after updating the DSHX compiler.',
    })
  }
  return result as BuildWatcher
}
