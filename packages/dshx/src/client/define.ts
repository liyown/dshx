import type { ClientDefinition, DshxSlotOptions, SlotContribution } from './types.js'

/** Preserve a Client definition exactly while providing contextual types. */
export function defineClient<const T extends ClientDefinition>(definition: T & Record<Exclude<keyof T, keyof ClientDefinition>, never>): T {
  return definition
}

/** Create a declarative Slot contribution without changing the options object. */
export function defineSlot<K extends keyof import('@deepseek-ai/dsh-client-ui-slots').SlotMap & string, const O extends DshxSlotOptions<K>>(
  name: K,
  options: O,
): SlotContribution<K, O> {
  const { component, ...registration } = options
  return { name, options: registration as Omit<O, 'component'>, component }
}
