import type { Context } from '@deepseek-ai/cordis'
import type {
  ChildrenDecl,
  ComposedProps,
  EntryKeyOf,
  HandleOf,
  InjectParams,
  KindOptions,
  LocaleNamespaceMap,
  SlotComponent,
  SlotMap,
  StoreDecl,
} from '@deepseek-ai/dsh-client-ui-slots'
import type { ConversationContribution } from '../conversation/types.js'

declare const slotContributionBrand: unique symbol

export type ClientConversationContribution = ConversationContribution

export interface ClientDefinition {
  readonly name?: string
  readonly inject?: readonly string[]
  readonly conversations?: readonly ClientConversationContribution[]
  readonly slots?: readonly SlotContribution[]
  readonly setup?: (ctx: Context) => void | Promise<void>
}

type RendersCheck<C, D> = [keyof D & keyof SlotMap & string] extends [never]
  ? unknown
  : C extends (props: infer P) => unknown
    ? 'renderSlot' extends keyof P
      ? unknown
      : 'renderSlotChain' extends keyof P
        ? unknown
        : { 'children declared but the component consumes no renderSlot': keyof D & keyof SlotMap & string }
    : unknown

/** Official Slot registration options, including store-handle normalization and child-render checks. */
export type SlotOptions<
  K extends keyof SlotMap & string,
  EntryKey extends EntryKeyOf<K> = EntryKeyOf<K>,
  D extends ChildrenDecl = Record<never, never>,
  H extends StoreDecl | undefined = undefined,
  I extends object = object,
  M = never,
  N extends (keyof LocaleNamespaceMap & string) | undefined = undefined,
  C extends SlotComponent<never> = SlotComponent<never>,
> = {
  readonly component: C & SlotComponent<ComposedProps<K, EntryKey, keyof D & keyof SlotMap & string, HandleOf<H>, I, M, N>> & RendersCheck<C, D>
  readonly children?: D
  readonly store?: H
  readonly inject?: (...args: InjectParams<K, H>) => I
  readonly locale?: N
  readonly registrant?: string
} & KindOptions<K, EntryKey, M>

/** Opaque declarative Slot contribution consumed by the Client adapter. */
export interface SlotContribution<K extends keyof SlotMap & string = keyof SlotMap & string, O extends object = object, C = unknown> {
  readonly [slotContributionBrand]: {
    readonly name: K
    readonly options: O
    readonly component: C
  }
}
