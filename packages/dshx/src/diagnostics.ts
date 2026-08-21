/** Severity used by non-throwing project checks. */
export type DshxDiagnosticSeverity = 'error' | 'warning'

/** One actionable issue collected without mutating the project. */
export interface DshxDiagnostic {
  readonly code: string
  readonly severity: DshxDiagnosticSeverity
  readonly message: string
  readonly file: string
  readonly hint: string
}

/** An actionable DSHX failure with a stable diagnostic code. */
export class DshxError extends Error {
  readonly code: string
  readonly hint: string | undefined
  readonly file: string | undefined

  constructor(
    code: string,
    message: string,
    options: { readonly cause?: unknown; readonly file?: string; readonly hint?: string } = {},
  ) {
    super(`${code}\n\n${message}`, options.cause === undefined ? undefined : { cause: options.cause })
    this.name = 'DshxError'
    this.code = code
    this.file = options.file
    this.hint = options.hint
  }
}
