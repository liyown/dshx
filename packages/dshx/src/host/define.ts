import type { CommandDefinition } from '@deepseek-ai/dsh-commands'
import type { PromptContext, PromptSection } from '@deepseek-ai/dsh-system-prompt'
import type { HostDefinition, PromptContextContribution, PromptSectionContribution } from './types.js'

/** Preserve a Host definition exactly while providing contextual types. */
export function defineHost<const T extends HostDefinition>(definition: T & Record<Exclude<keyof T, keyof HostDefinition>, never>): T {
  return definition
}

/** Preserve the exact official Command definition without changing its runtime contract. */
export function defineCommand<const T extends CommandDefinition>(definition: T): T {
  return definition
}

/** Preserve an official PromptSection while tagging its registration method. */
export function definePromptSection<const T extends PromptSection>(section: T): PromptSectionContribution<T> {
  return { kind: 'section', section }
}

/** Preserve an official PromptContext while tagging its registration method. */
export function definePromptContext<const T extends PromptContext>(context: T): PromptContextContribution<T> {
  return { kind: 'context', context }
}
