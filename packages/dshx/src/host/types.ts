import type { Context } from '@deepseek-ai/cordis'
import type { CommandDefinition } from '@deepseek-ai/dsh-commands'
import type { PromptContext, PromptSection } from '@deepseek-ai/dsh-system-prompt'
import type { ToolDefinition } from '@deepseek-ai/dsh-tools'
import type { ApiHostRegistration, ApiMethodDefinition } from '../api/types.js'
import type { SettingsContribution } from '../settings/types.js'

/** A system-prompt section wrapped only to preserve its registration kind. */
export interface PromptSectionContribution<Section extends PromptSection = PromptSection> {
  readonly kind: 'section'
  readonly section: Section
}

/** Dynamic runtime context wrapped only to preserve its registration kind. */
export interface PromptContextContribution<Prompt extends PromptContext = PromptContext> {
  readonly kind: 'context'
  readonly context: Prompt
}

/** One official system-prompt contribution registered by a DSHX Host. */
export type PromptContribution = PromptSectionContribution | PromptContextContribution

/** Author-facing Host definition backed by the official Cordis context and Tool model. */
export interface HostDefinition {
  readonly name?: string
  readonly inject?: readonly string[]
  readonly tools?: readonly ToolDefinition[]
  readonly commands?: readonly CommandDefinition[]
  readonly prompts?: readonly PromptContribution[]
  readonly settings?: readonly SettingsContribution[]
  readonly api?: ApiHostRegistration<Record<string, ApiMethodDefinition<any, any>>, any>
  readonly apis?: readonly ApiHostRegistration<Record<string, ApiMethodDefinition<any, any>>, any>[]
  readonly setup?: (ctx: Context) => void | Promise<void>
}
