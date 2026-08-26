import type { DshxConfig } from './types.js'

type ExactObject<Value extends object, Shape extends object> = Value &
  Record<Exclude<keyof Value, keyof Shape>, never> & {
    readonly [Key in keyof Value & keyof Shape]: ExactValue<Value[Key], Shape[Key]>
  }

type ExactValue<Value, Shape> = Value extends readonly unknown[]
  ? Value
  : Value extends object
    ? ExactObject<Value, Extract<NonNullable<Shape>, object>>
    : Value

/** Preserve a config object's exact inferred type while checking DSHX fields. */
export function defineConfig<const T extends DshxConfig>(config: ExactObject<T, DshxConfig>): T {
  return config
}
