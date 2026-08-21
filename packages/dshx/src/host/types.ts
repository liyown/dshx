import type { Context } from '@deepseek-ai/cordis'
import type { ToolDefinition } from '@deepseek-ai/dsh-tools'

/** Author-facing Host definition backed by the official Cordis context and Tool model. */
export interface HostDefinition {
  readonly name?: string
  readonly inject?: readonly string[]
  readonly tools?: readonly ToolDefinition[]
  readonly setup?: (ctx: Context) => void | Promise<void>
}
