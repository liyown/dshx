import type { Writable } from 'node:stream'
import { styleText } from 'node:util'
import type { DshProjectCompatibilityAssessment } from '../compat/index.js'
import { DshxError } from '../diagnostics.js'
import type { DshxDiagnostic } from '../diagnostics.js'
import type { CliIO } from './context.js'

export function defaultIO(): CliIO {
  return { stdin: process.stdin, stdout: process.stdout, stderr: process.stderr }
}

export function write(stream: Writable, text: string): void {
  stream.write(text)
}

type TerminalStyle = Parameters<typeof styleText>[0]

export function paint(stream: Writable, style: TerminalStyle, text: string): string {
  const terminal = stream as Writable & { isTTY?: boolean }
  if (terminal.isTTY !== true || process.env.NO_COLOR !== undefined || process.env.TERM === 'dumb') return text
  return styleText(style, text)
}

export function statusSymbol(stream: Writable, status: 'success' | 'pending' | 'failure'): string {
  if (status === 'success') return paint(stream, ['bold', 'green'], '✓')
  if (status === 'failure') return paint(stream, ['bold', 'red'], '×')
  return paint(stream, ['bold', 'yellow'], '●')
}

export function diagnosticFromError(error: unknown, fallbackFile = ''): DshxDiagnostic {
  if (error instanceof DshxError) {
    return {
      code: error.code,
      severity: 'error',
      message: error.message.replace(/^DSHX\d+\n\n/, ''),
      file: error.file ?? fallbackFile,
      hint: error.hint ?? 'Fix the reported problem and run DSHX again.',
    }
  }
  return {
    code: 'DSHX0001',
    severity: 'error',
    message: error instanceof Error ? error.message : String(error),
    file: fallbackFile,
    hint: 'Run with --verbose to inspect the original error.',
  }
}

export function printDiagnostic(io: CliIO, item: DshxDiagnostic): void {
  const location = item.file === '' ? '' : `\n  file: ${item.file}`
  const severityStyle: TerminalStyle = item.severity === 'error' ? ['bold', 'red'] : ['bold', 'yellow']
  const heading = paint(io.stderr, severityStyle, `${item.code} [${item.severity}]`)
  const file = location === '' ? '' : paint(io.stderr, 'gray', location)
  const hint = paint(io.stderr, 'cyan', `hint: ${item.hint}`)
  write(io.stderr, `${heading} ${item.message}${file}\n  ${hint}\n`)
}

export function printDiagnostics(io: CliIO, items: readonly DshxDiagnostic[]): void {
  for (const item of items) printDiagnostic(io, item)
}

export function printVerboseCause(io: CliIO, error: unknown): void {
  if (!(error instanceof Error) || error.cause === undefined) return
  const cause = error.cause
  if (cause !== null && typeof cause === 'object') {
    const record = cause as Record<string, unknown>
    if (typeof record.stderr === 'string' && record.stderr.trim() !== '') {
      write(io.stderr, `stderr:\n${record.stderr.trim()}\n`)
    }
    if (typeof record.stdout === 'string' && record.stdout.trim() !== '') {
      write(io.stderr, `stdout:\n${record.stdout.trim()}\n`)
    }
    if (typeof record.shortMessage === 'string' && record.shortMessage.trim() !== '') {
      write(io.stderr, `cause: ${record.shortMessage.trim()}\n`)
      return
    }
  }
  write(io.stderr, `cause: ${cause instanceof Error ? (cause.stack ?? cause.message) : String(cause)}\n`)
}

export function hasErrors(items: readonly DshxDiagnostic[]): boolean {
  return items.some(item => item.severity === 'error')
}

export function printCompatibilitySummary(io: CliIO, assessment: DshProjectCompatibilityAssessment, dshxVersion: string, verbose = false): void {
  const status = assessment.installedVersion === undefined ? 'not detected' : (assessment.resolution?.support ?? 'unsupported')
  const label = (value: string): string => paint(io.stdout, 'gray', value)
  write(io.stdout, `${paint(io.stdout, ['bold', 'cyan'], '◆ DSH compatibility')}\n`)
  write(io.stdout, `  ${label('DSHX:')} ${paint(io.stdout, 'cyan', dshxVersion)}\n`)
  write(io.stdout, `  ${label('Plugin peer range:')} ${assessment.declaredRange ?? 'not declared'}\n`)
  write(
    io.stdout,
    `  ${label('Installed DSH:')} ${paint(io.stdout, 'cyan', assessment.installedVersion ?? 'not detected')}${assessment.installedVersion === undefined ? '' : ` (${paint(io.stdout, status === 'unsupported' ? 'red' : 'green', status)})`}\n`,
  )
  write(
    io.stdout,
    `  ${label('Adapter:')} ${assessment.compatibility.id} / ${assessment.compatibility.protocolGeneration} (${paint(io.stdout, 'green', assessment.compatibility.lifecycle)})\n`,
  )
  write(
    io.stdout,
    `  ${label('Capabilities:')} ${assessment.capabilities.length} available${verbose ? `\n    ${assessment.capabilities.join('\n    ')}` : ''}\n`,
  )
}
