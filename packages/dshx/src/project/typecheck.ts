import { access } from 'node:fs/promises'
import { resolve } from 'node:path'
import ts from 'typescript'
import type { DshxDiagnostic } from '../diagnostics.js'

export interface ProjectTypecheckResult {
  readonly status: 'passed' | 'failed'
  readonly configFile: string
  readonly diagnostics: readonly DshxDiagnostic[]
}

function diagnosticFile(diagnostic: ts.Diagnostic): { file: string; location: string } {
  if (diagnostic.file === undefined || diagnostic.start === undefined) return { file: '', location: '' }
  const position = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start)
  return {
    file: diagnostic.file.fileName,
    location: `${position.line + 1}:${position.character + 1}: `,
  }
}

function convertDiagnostic(diagnostic: ts.Diagnostic, fallbackFile: string): DshxDiagnostic {
  const location = diagnosticFile(diagnostic)
  return {
    code: `TS${diagnostic.code}`,
    severity: diagnostic.category === ts.DiagnosticCategory.Error ? 'error' : 'warning',
    message: `${location.location}${ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')}`,
    file: location.file === '' ? fallbackFile : location.file,
    hint: 'Fix the TypeScript diagnostic before building the plugin.',
  }
}

/** Type-check a plugin exactly as an offline CI gate without emitting files. */
export async function typecheckProject(root: string): Promise<ProjectTypecheckResult> {
  const configFile = resolve(root, 'tsconfig.json')
  try {
    await access(configFile)
  } catch {
    const diagnostic: DshxDiagnostic = {
      code: 'DSHX4401',
      severity: 'error',
      message: 'No tsconfig.json was found at the plugin project root.',
      file: configFile,
      hint: 'Create a tsconfig.json that includes the Host, Client, shared contracts, and dshx.config.ts.',
    }
    return { status: 'failed', configFile, diagnostics: [diagnostic] }
  }

  const loaded = ts.readConfigFile(configFile, ts.sys.readFile)
  if (loaded.error !== undefined) {
    const diagnostics = [convertDiagnostic(loaded.error, configFile)]
    return { status: 'failed', configFile, diagnostics }
  }
  const parsed = ts.parseJsonConfigFileContent(
    loaded.config,
    ts.sys,
    root,
    {
      noEmit: true,
      incremental: false,
      composite: false,
    },
    configFile,
  )
  const parseDiagnostics = parsed.errors.map(diagnostic => convertDiagnostic(diagnostic, configFile))
  if (parseDiagnostics.some(diagnostic => diagnostic.severity === 'error')) {
    return { status: 'failed', configFile, diagnostics: parseDiagnostics }
  }

  const program = ts.createProgram({
    rootNames: parsed.fileNames,
    options: parsed.options,
    ...(parsed.projectReferences === undefined ? {} : { projectReferences: parsed.projectReferences }),
  })
  const diagnostics = [...parseDiagnostics, ...ts.getPreEmitDiagnostics(program).map(diagnostic => convertDiagnostic(diagnostic, configFile))]
  return {
    status: diagnostics.some(diagnostic => diagnostic.severity === 'error') ? 'failed' : 'passed',
    configFile,
    diagnostics,
  }
}
