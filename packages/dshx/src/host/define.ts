import type { CommandDefinition } from '@deepseek-ai/dsh-commands'
import type { PromptContext, PromptSection } from '@deepseek-ai/dsh-system-prompt'
import type { HostDefinition, PromptContextContribution, PromptContribution, PromptSectionContribution } from './types.js'

export type PromptContributionParts = { readonly kind: 'section'; readonly value: PromptSection } | { readonly kind: 'context'; readonly value: PromptContext }

const promptContributions = new WeakMap<object, PromptContributionParts>()

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
  const contribution = {} as PromptSectionContribution<T>
  promptContributions.set(contribution, { kind: 'section', value: section })
  return contribution
}

/** Preserve an official PromptContext while tagging its registration method. */
export function definePromptContext<const T extends PromptContext>(context: T): PromptContextContribution<T> {
  const contribution = {} as PromptContextContribution<T>
  promptContributions.set(contribution, { kind: 'context', value: context })
  return contribution
}

export function promptContributionKind(value: unknown): 'section' | 'context' | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  return promptContributions.get(value)?.kind
}

export function promptContributionParts(value: PromptContribution): PromptContributionParts {
  const parts = promptContributions.get(value)
  if (parts === undefined) throw new TypeError('Invalid Prompt contribution; create it with definePromptSection() or definePromptContext().')
  return parts
}
