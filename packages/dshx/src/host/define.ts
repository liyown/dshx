import type { HostDefinition } from './types.js'

/** Preserve a Host definition exactly while providing contextual types. */
export function defineHost<const T extends HostDefinition>(
  definition: T & Record<Exclude<keyof T, keyof HostDefinition>, never>,
): T {
  return definition
}
