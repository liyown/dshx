import type { Readable, Writable } from 'node:stream'

export type CreateDiagnosticSeverity = 'error' | 'warning'
export interface CreateDiagnostic {
  readonly code: `DSHX${number}`
  readonly severity: CreateDiagnosticSeverity
  readonly message: string
  readonly file: string
  readonly hint: string
  readonly cause?: unknown
}
export interface CreateIO {
  readonly stdin?: Readable & { readonly isTTY?: boolean }
  readonly stdout?: Writable
  readonly stderr?: Writable
  readonly readLine?: (question: string, defaultValue?: string) => Promise<string>
  readonly confirm?: (question: string, defaultValue: boolean) => Promise<boolean>
}
export interface CommandResult {
  readonly exitCode: number
  readonly stdout?: string
  readonly stderr?: string
}
export type CommandRunner = (command: string, args: readonly string[], options: { readonly cwd: string }) => Promise<CommandResult>
export interface FileSystem {
  readonly exists: (path: string) => Promise<boolean>
  readonly isDirectory: (path: string) => Promise<boolean>
  readonly list: (path: string) => Promise<readonly string[]>
  readonly mkdir: (path: string) => Promise<void>
  readonly writeFile: (path: string, contents: string) => Promise<void>
  readonly readFile: (path: string) => Promise<string>
}
export type PackageManager = 'pnpm' | 'yarn' | 'npm'
export type TemplateName = 'starter' | 'showcase'
export type ProjectStyle = 'css-modules' | 'tailwind' | 'none'
export interface CreateProjectOptions {
  readonly name: string
  readonly template?: TemplateName
  readonly style?: ProjectStyle
  readonly cwd?: string
  readonly install?: boolean
  readonly packageManager?: PackageManager
  readonly dshxVersion?: string
  /** Exact DSH version installed for local development. */
  readonly dshVersion?: string
  /** Public DSH support range written to peerDependencies. */
  readonly dshRange?: string
}
export interface CreateProjectResult {
  readonly root: string
  readonly packageId: string
  readonly template: TemplateName
  readonly style: ProjectStyle
  readonly files: readonly string[]
  readonly packageManager?: PackageManager
  readonly installed: boolean
  readonly diagnostics: readonly CreateDiagnostic[]
}

export interface TemplateContext {
  readonly packageId: string
  readonly dshxVersion: string
  readonly dshVersion: string
  readonly dshRange: string
}

export interface RenderedTemplateFile {
  readonly path: string
  readonly contents: string
}
