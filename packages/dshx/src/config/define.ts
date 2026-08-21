import type { DshxConfig } from './types.js'

/** Preserve a config object's exact inferred type while checking DSHX fields. */
export function defineConfig<T extends DshxConfig>(config: T): T {
  return config
}
