import type { Context } from '@deepseek-ai/cordis'
import type {
  ChildrenDecl,
  ComposedProps,
  EntryKeyOf,
  InjectParams,
  KindOptions,
  LocaleNamespaceMap,
  SlotComponent,
  SlotMap,
  StoreDecl,
} from '@deepseek-ai/dsh-client-ui-slots'
import type { ApiContract, ApiMethodDefinition } from '../api/types.js'

/**
 * Structural Conversation contribution accepted by the Client adapter.
 *
 * The concrete, generically typed author contract lives in the Conversation
 * public entry. Keeping this boundary structural prevents the general Client
 * definition from duplicating that contract's state and event relationships.
 */
export interface ClientConversationContribution {
  readonly kind: 'conversation-component'
  readonly marker: 'dshx.conversation-component.v1'
  readonly contract: {
    readonly kind: string
    readonly events: object
    readonly component: unknown
  }
  readonly definition: {
    readonly kind: string
    readonly target?: string
    readonly match: unknown
    readonly start: unknown
    readonly update: unknown
    readonly buildViewNode?: unknown
  }
  readonly renderer: {
    readonly name: 'conversation.chat.node'
    readonly options: {
      readonly key: string
      readonly locale: 'conversation'
    } & object
    readonly component: unknown
  }
}

/** Author-facing Client definition backed by the official Cordis context. */
export interface ClientDefinition {
  readonly name?: string
  readonly inject?: readonly string[]
  readonly conversations?: readonly ClientConversationContribution[]
  // Keep this constraint structural. A bare SlotContribution defaults to an
  // unknown Slot union whose kind-specific options are intentionally empty;
  // defineSlot() supplies the precise relationship on the inferred value.
  readonly slots?: readonly {
    readonly name: string
    readonly options: object
    readonly component: unknown
  }[]
  /** Optional eager binding retained for compatibility; useApi/useQuery normally infer this capability. */
  readonly api?: ApiContract<Record<string, ApiMethodDefinition<any, any>>>
  /** Optional eager bindings retained for compatibility; useApi/useQuery normally infer this capability. */
  readonly apis?: readonly ApiContract<Record<string, ApiMethodDefinition<any, any>>>[]
  readonly setup?: (ctx: Context) => void | Promise<void>
}

/** Official rc.8 Slot registration options plus the author component. */
export type DshxSlotOptions<
  K extends keyof SlotMap & string,
  EntryKey extends EntryKeyOf<K> = EntryKeyOf<K>,
  D extends ChildrenDecl = Record<never, never>,
  H extends StoreDecl | undefined = undefined,
  I extends object = object,
  M = never,
  N extends (keyof LocaleNamespaceMap & string) | undefined = undefined,
> = {
  readonly component: SlotComponent<ComposedProps<K, EntryKey, keyof D & keyof SlotMap & string, H extends StoreDecl ? H : undefined, I, M, N>>
  readonly children?: D
  readonly store?: H
  readonly inject?: (...args: InjectParams<K, H>) => I
  readonly locale?: N
  readonly registrant?: string
} & KindOptions<K, EntryKey, M>

/** A declarative Slot contribution consumed by the Client adapter. */
export interface SlotContribution<K extends keyof SlotMap & string = keyof SlotMap & string, O extends DshxSlotOptions<K> = DshxSlotOptions<K>> {
  readonly name: K
  readonly options: Omit<O, 'component'>
  readonly component: O['component']
}
