import type { Context } from '@deepseek-ai/cordis'
import type { CommandDefinition } from '@deepseek-ai/dsh-commands'
import type { PromptContext, PromptSection } from '@deepseek-ai/dsh-system-prompt'
import type { ToolDefinition } from '@deepseek-ai/dsh-tools'
import type { AnyApiMethodDefinition, ApiHostRegistration } from '../api/types.js'
import type { SettingsContribution } from '../settings/types.js'

/** A system-prompt section wrapped only to preserve its registration kind. */
declare const promptContributionBrand: unique symbol

export interface PromptSectionContribution<Section extends PromptSection = PromptSection> {
  readonly [promptContributionBrand]: { readonly kind: 'section'; readonly value: Section }
}

/** Dynamic runtime context wrapped only to preserve its registration kind. */
export interface PromptContextContribution<Prompt extends PromptContext = PromptContext> {
  readonly [promptContributionBrand]: { readonly kind: 'context'; readonly value: Prompt }
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
  readonly apis?: readonly ApiHostRegistration<Record<string, AnyApiMethodDefinition>, any>[]
  readonly setup?: (ctx: Context) => void | Promise<void>
}
