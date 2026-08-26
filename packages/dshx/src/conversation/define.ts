import type { ConversationMatch, ConversationNodeContext, ConversationNodeDefinition, ConversationPublication } from '@deepseek-ai/dsh-client-runtime/client'
import type { SessionEvent, SessionEventType } from '@deepseek-ai/dsh-session/types'
import { createElement } from 'react'
import type {
  ConversationContribution,
  ConversationContributionParts,
  ConversationEventDescriptor,
  ConversationEventDescriptors,
  ConversationEventType,
  ConversationLifecycle,
  ConversationLifecycleDefinition,
  ConversationRendererComponent,
  ConversationRendererNode,
  ConversationRendererProps,
  ConversationRendererSlotProps,
} from './types.js'

type NoUnknownEventTypes<Events extends ConversationEventDescriptors> = Record<Exclude<keyof Events, SessionEventType>, never>

const PUBLICATIONS = new Set<ConversationPublication>(['none', 'animation-frame', 'immediate'])
const contributionParts = new WeakMap<object, ConversationContributionParts>()

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function validateDefinition(definition: {
  readonly kind: string
  readonly events: object
  readonly initial: unknown
  readonly reduce?: unknown
  readonly project?: unknown
}): void {
  if (definition.kind.trim() === '') throw new TypeError('Conversation kind must be a non-empty string.')
  if (!isRecord(definition.events)) throw new TypeError(`Conversation ${JSON.stringify(definition.kind)} events must be an object.`)
  const entries = Object.entries(definition.events)
  if (entries.length === 0) throw new TypeError(`Conversation ${JSON.stringify(definition.kind)} must declare at least one event.`)
  let hasStart = false
  let hasUpdate = false
  for (const [type, value] of entries) {
    if (!isRecord(value) || (value.role !== 'start' && value.role !== 'update') || typeof value.id !== 'function') {
      throw new TypeError(`Conversation ${JSON.stringify(definition.kind)} event ${JSON.stringify(type)} must declare role and id(event).`)
    }
    if (value.role === 'start') hasStart = true
    else hasUpdate = true
    if (value.publication !== undefined && !PUBLICATIONS.has(value.publication as ConversationPublication)) {
      throw new TypeError(`Conversation ${JSON.stringify(definition.kind)} event ${JSON.stringify(type)} has invalid publication.`)
    }
  }
  if (!hasStart) throw new TypeError(`Conversation ${JSON.stringify(definition.kind)} must declare at least one start event.`)
  if (typeof definition.initial !== 'function') throw new TypeError(`Conversation ${JSON.stringify(definition.kind)} initial must be a function.`)
  if (hasUpdate && typeof definition.reduce !== 'function') {
    throw new TypeError(`Conversation ${JSON.stringify(definition.kind)} reduce must be a function when update events are declared.`)
  }
  if (definition.reduce !== undefined && typeof definition.reduce !== 'function')
    throw new TypeError(`Conversation ${JSON.stringify(definition.kind)} reduce must be a function.`)
  if (definition.project !== undefined && typeof definition.project !== 'function')
    throw new TypeError(`Conversation ${JSON.stringify(definition.kind)} project must be a function.`)
}

function locationOf<State>(context: ConversationNodeContext<State>) {
  return context.start?.location ?? context.matches[0]?.location ?? { kind: 'unresolved' as const }
}

function anchorOf<State>(context: ConversationNodeContext<State>): number {
  return context.start?.event.seq ?? context.matches[0]?.event.seq ?? 0
}

function descriptorFor<Events extends ConversationEventDescriptors>(
  events: Events,
  event: SessionEvent,
): ConversationEventDescriptor<ConversationEventType<Events>> | undefined {
  return events[event.type as ConversationEventType<Events>] as ConversationEventDescriptor<ConversationEventType<Events>> | undefined
}

function makeContribution<Kind extends string, Events extends ConversationEventDescriptors, State, Data>(
  lifecycle: ConversationLifecycle<Kind, Events, State, Data>,
  definitionOptions: ConversationLifecycleDefinition<Kind, Events, State, Data>,
  authorComponent: ConversationRendererComponent<Kind, Data>,
): ConversationContribution<Kind, State, Data> {
  const definition: ConversationNodeDefinition<State> = {
    kind: lifecycle.kind,
    target: 'chat',
    match(event) {
      const descriptor = descriptorFor(lifecycle.events, event)
      if (descriptor === undefined) return null
      const id = descriptor.id(event as never)
      if (typeof id !== 'string')
        throw new TypeError(`Conversation ${JSON.stringify(lifecycle.kind)} event ${JSON.stringify(event.type)} returned a non-string id.`)
      return { id, role: descriptor.role }
    },
    start(context, match) {
      return definitionOptions.initial(context as ConversationNodeContext<never>, match.event as never)
    },
    update(context, match) {
      if (definitionOptions.reduce === undefined) return context.state
      return definitionOptions.reduce(context.state, context, match.event as never)
    },
    buildViewNode(context) {
      if (context.state === undefined) return null
      const stateContext = context as ConversationNodeContext<State> & { readonly state: State }
      const data = definitionOptions.project === undefined ? (context.state as unknown as Data) : definitionOptions.project(context.state, stateContext)
      const node: ConversationRendererNode<Kind, Data> = {
        key: context.key,
        kind: lifecycle.kind,
        id: context.id,
        target: 'chat',
        anchorSeq: anchorOf(context),
        location: locationOf(context),
        visibility: 'visible',
        data,
      }
      return node
    },
    ...(Object.values(lifecycle.events).some(value => value?.publication !== undefined)
      ? {
          publication(match: ConversationMatch) {
            return descriptorFor(lifecycle.events, match.event)?.publication ?? 'immediate'
          },
        }
      : {}),
  }
  const renderer = (props: ConversationRendererSlotProps<Kind, Data>) =>
    createElement(authorComponent, { ...props, data: props.node.data } as ConversationRendererProps<Kind, Data>)
  const contribution = {} as ConversationContribution<Kind, State, Data>
  contributionParts.set(contribution, {
    definition,
    renderer: {
      name: 'conversation.chat.node',
      options: { key: lifecycle.kind, locale: 'conversation' },
      component: renderer,
    },
  })
  return contribution
}

export function isConversationContribution(value: unknown): value is ConversationContribution {
  return typeof value === 'object' && value !== null && contributionParts.has(value)
}

export function getConversationContributionParts(value: ConversationContribution): ConversationContributionParts {
  const parts = contributionParts.get(value)
  if (parts === undefined) throw new TypeError('Invalid Conversation contribution; use defineConversation(...).render(Component).')
  return parts
}

export function defineConversation<const Kind extends string, const Events extends ConversationEventDescriptors, State, Data = State>(definition: {
  readonly kind: Kind
  readonly events: Events & NoUnknownEventTypes<Events>
  readonly initial: (context: ConversationNodeContext<never>, event: import('./types.js').ConversationStartEvent<Events>) => State
  readonly reduce?: (
    state: State,
    context: ConversationNodeContext<State> & { readonly state: State },
    event: import('./types.js').ConversationUpdateEvent<Events>,
  ) => State
  readonly project?: (state: State, context: ConversationNodeContext<State> & { readonly state: State }) => Data
}): ConversationLifecycle<Kind, Events, State, Data> {
  validateDefinition(definition)
  const lifecycle: ConversationLifecycle<Kind, Events, State, Data> = {
    kind: definition.kind,
    events: definition.events,
    render(component) {
      if (typeof component !== 'function') throw new TypeError(`Conversation ${JSON.stringify(definition.kind)} renderer must be a component function.`)
      return makeContribution(lifecycle, definition as never, component)
    },
  }
  return lifecycle
}
