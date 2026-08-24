import type { Context } from '@deepseek-ai/cordis'
import type { CommandDefinition } from '@deepseek-ai/dsh-commands'
import type { ToolDefinition } from '@deepseek-ai/dsh-tools'
import type { ApiHostRegistration, ApiMethodDefinition } from '../api/types.js'

/** Author-facing Host definition backed by the official Cordis context and Tool model. */
export interface HostDefinition {
  readonly name?: string
  readonly inject?: readonly string[]
  readonly tools?: readonly ToolDefinition[]
  readonly commands?: readonly CommandDefinition[]
  readonly api?: ApiHostRegistration<Record<string, ApiMethodDefinition<any, any>>, any>
  readonly apis?: readonly ApiHostRegistration<Record<string, ApiMethodDefinition<any, any>>, any>[]
  readonly setup?: (ctx: Context) => void | Promise<void>
}
