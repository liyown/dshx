import { relative, resolve as resolvePath } from 'node:path'
import { buildClient, buildHost } from '../../compiler/index.js'
import type { ResolvedDshxConfig } from '../../config/types.js'
import { checkPackageTargets } from '../../project/index.js'
import type { CliArgs } from '../args.js'
import type { CliRunOptions } from '../context.js'
import { defaultIO, diagnosticFromError, hasErrors, paint, printDiagnostic, printDiagnostics, printVerboseCause, statusSymbol, write } from '../presentation.js'
import { installedSupportDiagnostics, preflight } from '../preflight.js'

export async function runBuild(args: CliArgs, options: CliRunOptions, project: ResolvedDshxConfig): Promise<number> {
  const io = options.io ?? defaultIO()
  const runtime = options.runtime ?? {}
  const checked = await preflight({ project, runtime })
  const diagnostics = [
    ...checked.compatibilityDiagnostics,
    ...installedSupportDiagnostics(project, checked.installedVersion, checked.assessment),
    ...checked.manifestDiagnostics,
    ...checked.migrationDiagnostics,
    ...checked.typecheckDiagnostics,
  ]
  printDiagnostics(io, diagnostics)
  if (hasErrors(diagnostics)) return 1
  const compatibility = checked.compatibility
  const jobs: Array<{ readonly fallback: string; readonly task: Promise<unknown> }> = []
  // DSH loads every linked package through its root export, including an
  // explicit Client-only package. The compiler's undefined entry is a
  // deliberate no-op Host module that satisfies that loader contract without
  // enabling the Host face in DSHX config or scaffold commands.
  jobs.push({
    fallback: resolvePath(project.outDir, 'index.js'),
    task: (runtime.buildHost ?? buildHost)({
      packageId: project.packageId,
      logicalName: project.name,
      root: project.root,
      ...(project.hostEntry === undefined ? {} : { entry: project.hostEntry }),
      outDir: project.outDir,
      sourcemap: project.build.sourcemap,
      declarations: project.build.declarations ?? true,
      ...(project.hostVitePlugins === undefined ? {} : { vite: { plugins: project.hostVitePlugins } }),
      compatibility,
    }),
  })
  if (project.clientEntry !== undefined) {
    const dsh = project.manifest.dsh
    const client =
      typeof dsh === 'object' && dsh !== null && !Array.isArray(dsh) && typeof (dsh as Record<string, unknown>).client === 'object'
        ? ((dsh as Record<string, unknown>).client as Record<string, unknown>)
        : undefined
    const external = Array.isArray(client?.external) && client.external.every(value => typeof value === 'string') ? (client.external as string[]) : []
    const inject = Array.isArray(client?.inject) && client.inject.every(value => typeof value === 'string') ? (client.inject as string[]) : []
    jobs.push({
      fallback: resolvePath(project.outDir, 'client.js'),
      task: (runtime.buildClient ?? buildClient)({
        packageId: project.packageId,
        logicalName: project.name,
        settingsNamespace: project.settingsNamespace,
        root: project.root,
        entry: project.clientEntry,
        outDir: project.outDir,
        sourcemap: project.build.sourcemap,
        declarations: project.build.declarations ?? true,
        ...(project.clientVitePlugins === undefined ? {} : { vite: { plugins: project.clientVitePlugins } }),
        external,
        inject,
        compatibility,
      }),
    })
  }
  const results = await Promise.allSettled(jobs.map(job => job.task))
  let failed = false
  const artifacts: string[] = []
  results.forEach((result, index) => {
    if (result.status === 'rejected') {
      failed = true
      const item = diagnosticFromError(result.reason, project.packageFile)
      printDiagnostic(io, item)
      if (args.verbose) printVerboseCause(io, result.reason)
      return
    }
    const fallback = jobs[index]?.fallback
    const output = result.value as { readonly output?: readonly { readonly fileName?: string }[] } | undefined
    const names = output?.output?.map(item => item.fileName).filter((name): name is string => typeof name === 'string' && name !== '') ?? []
    for (const name of names) artifacts.push(resolvePath(project.outDir, name))
    if (names.length === 0 && fallback !== undefined) artifacts.push(fallback)
  })
  if (failed) return 1
  const targetDiagnostics = await (runtime.checkPackageTargets ?? checkPackageTargets)(project)
  printDiagnostics(io, targetDiagnostics)
  if (hasErrors(targetDiagnostics)) return 1
  const outputDirectory = relative(project.root, project.outDir) || '.'
  write(io.stdout, `${statusSymbol(io.stdout, 'success')} ${paint(io.stdout, ['bold', 'green'], `Built ${project.packageId}`)}\n`)
  write(io.stdout, `  ${paint(io.stdout, 'gray', 'Output:')} ${paint(io.stdout, 'cyan', outputDirectory)}\n`)
  write(io.stdout, `  ${paint(io.stdout, 'gray', 'Artifacts:')} ${artifacts.length}\n`)
  for (const artifact of artifacts) write(io.stdout, `    ${paint(io.stdout, 'gray', '•')} ${relative(project.root, artifact) || artifact}\n`)
  return 0
}
