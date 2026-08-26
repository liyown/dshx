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
import type { ClientDefinition, LocaleDefinition, PropsLocaleOf, SlotContribution } from './types.js'

export interface SlotContributionParts {
  readonly name: keyof SlotMap & string
  readonly options: object
  readonly component: unknown
}

const slotContributions = new WeakMap<object, SlotContributionParts>()

type WithoutComponent<Options extends object> = Omit<Options, 'component'>
type RendersCheck<C, D> = [keyof D & keyof SlotMap & string] extends [never]
  ? unknown
  : C extends (props: infer P) => unknown
    ? 'renderSlot' extends keyof P
      ? unknown
      : 'renderSlotChain' extends keyof P
        ? unknown
        : { 'children declared but the component consumes no renderSlot': keyof D & keyof SlotMap & string }
    : unknown

export function defineClient<const T extends ClientDefinition>(definition: T & Record<Exclude<keyof T, keyof ClientDefinition>, never>): T {
  return definition
}

export function isSlotContribution(value: unknown): value is SlotContribution {
  return typeof value === 'object' && value !== null && slotContributions.has(value)
}

export function slotContributionParts(value: SlotContribution): SlotContributionParts {
  const parts = slotContributions.get(value)
  if (parts === undefined) throw new TypeError('Invalid Slot contribution; create it with defineSlot(name, options).')
  return parts
}

export function defineSlot<
  K extends keyof SlotMap & string,
  L extends LocaleDefinition,
  const EntryKey extends EntryKeyOf<K> = EntryKeyOf<K>,
  const D extends ChildrenDecl = Record<never, never>,
  H extends StoreDecl | undefined = undefined,
  M = never,
  C extends SlotComponent<never> = SlotComponent<never>,
>(
  name: K,
  options: {
    readonly component: C &
      SlotComponent<
        ComposedProps<K, NoInfer<EntryKey>, keyof NoInfer<D> & keyof SlotMap & string, HandleOf<NoInfer<H>>, object, NoInfer<M>, undefined> &
          PropsLocaleOf<NoInfer<L>>
      > &
      RendersCheck<C, D>
    readonly children?: D
    readonly store?: H
    readonly locale: L
    readonly registrant?: string
  } & KindOptions<K, EntryKey, M>,
): SlotContribution<K, WithoutComponent<typeof options>, C>
export function defineSlot<
  K extends keyof SlotMap & string,
  L extends LocaleDefinition,
  I extends object,
  const EntryKey extends EntryKeyOf<K> = EntryKeyOf<K>,
  const D extends ChildrenDecl = Record<never, never>,
  H extends StoreDecl | undefined = undefined,
  M = never,
  C extends SlotComponent<never> = SlotComponent<never>,
>(
  name: K,
  options: {
    readonly component: C &
      SlotComponent<
        ComposedProps<K, NoInfer<EntryKey>, keyof NoInfer<D> & keyof SlotMap & string, HandleOf<NoInfer<H>>, I, NoInfer<M>, undefined> &
          PropsLocaleOf<NoInfer<L>>
      > &
      RendersCheck<C, D>
    readonly children?: D
    readonly store?: H
    readonly inject: (...args: InjectParams<K, H>) => I
    readonly locale: L
    readonly registrant?: string
  } & KindOptions<K, EntryKey, M>,
): SlotContribution<K, WithoutComponent<typeof options>, C>
export function defineSlot<
  K extends keyof SlotMap & string,
  const EntryKey extends EntryKeyOf<K> = EntryKeyOf<K>,
  const D extends ChildrenDecl = Record<never, never>,
  H extends StoreDecl | undefined = undefined,
  M = never,
  N extends (keyof LocaleNamespaceMap & string) | undefined = undefined,
  C extends SlotComponent<never> = SlotComponent<never>,
>(
  name: K,
  options: {
    readonly component: C &
      SlotComponent<ComposedProps<K, NoInfer<EntryKey>, keyof NoInfer<D> & keyof SlotMap & string, HandleOf<NoInfer<H>>, object, NoInfer<M>, NoInfer<N>>> &
      RendersCheck<C, D>
    readonly children?: D
    readonly store?: H
    readonly locale?: N
    readonly registrant?: string
  } & KindOptions<K, EntryKey, M>,
): SlotContribution<K, WithoutComponent<typeof options>, C>
export function defineSlot<
  K extends keyof SlotMap & string,
  I extends object,
  const EntryKey extends EntryKeyOf<K> = EntryKeyOf<K>,
  const D extends ChildrenDecl = Record<never, never>,
  H extends StoreDecl | undefined = undefined,
  M = never,
  N extends (keyof LocaleNamespaceMap & string) | undefined = undefined,
  C extends SlotComponent<never> = SlotComponent<never>,
>(
  name: K,
  options: {
    readonly component: C &
      SlotComponent<ComposedProps<K, NoInfer<EntryKey>, keyof NoInfer<D> & keyof SlotMap & string, HandleOf<NoInfer<H>>, I, NoInfer<M>, NoInfer<N>>> &
      RendersCheck<C, D>
    readonly children?: D
    readonly store?: H
    readonly inject: (...args: InjectParams<K, H>) => I
    readonly locale?: N
    readonly registrant?: string
  } & KindOptions<K, EntryKey, M>,
): SlotContribution<K, WithoutComponent<typeof options>, C>
export function defineSlot<K extends keyof SlotMap & string, const O extends { readonly component: unknown }>(
  name: K,
  options: O,
): SlotContribution<K, Omit<O, 'component'>, O['component']> {
  const { component, ...registration } = options
  const contribution = {} as SlotContribution<K, Omit<O, 'component'>, O['component']>
  slotContributions.set(contribution, { name, options: registration, component })
  return contribution
}
