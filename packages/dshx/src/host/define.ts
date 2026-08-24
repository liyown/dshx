import type { CommandDefinition } from '@deepseek-ai/dsh-commands'
import type { HostDefinition } from './types.js'

/** Preserve a Host definition exactly while providing contextual types. */
export function defineHost<const T extends HostDefinition>(
  definition: T & Record<Exclude<keyof T, keyof HostDefinition>, never>,
): T {
  return definition
}

/** Preserve the exact official Command definition without changing its runtime contract. */
export function defineCommand<const T extends CommandDefinition>(definition: T): T {
  return definition
}
