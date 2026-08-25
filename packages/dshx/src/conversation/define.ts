import type {
  ConversationLocation,
  ConversationLocationData,
  ConversationLocationDataScope,
  ConversationMatch,
  ConversationNodeContext,
  ConversationNodeDefinition,
  ConversationPublication,
} from '@deepseek-ai/dsh-client-runtime/client'
import type { SessionEvent, SessionEventType } from '@deepseek-ai/dsh-session/types'
import { createElement, type ComponentType } from 'react'
import {
  CONVERSATION_COMPONENT_MARKER,
  type ConversationComponentContribution,
  type ConversationComponentFactory,
  type ConversationComponentOptions,
  type ConversationContract,
  type ConversationContractEvent,
  type ConversationEventDescriptor,
  type ConversationEventDescriptors,
  type ConversationEventType,
  type ConversationInitialInput,
  type ConversationLocationDataProjection,
  type ConversationPublicationInput,
  type ConversationReduceInput,
  type ConversationRendererNode,
  type ConversationRendererProps,
  type ConversationRendererSlotProps,
  type ConversationTypedMatch,
} from './types.js'

/** Object-first portable Conversation event-family definition. */
export interface ConversationDefinition<Kind extends string, Events extends ConversationEventDescriptors> {
  readonly kind: Kind
  readonly events: Events
}

type NoUnknownEventTypes<Events extends ConversationEventDescriptors> = Record<Exclude<keyof Events, SessionEventType>, never>

const PUBLICATIONS = new Set<ConversationPublication>(['none', 'animation-frame', 'immediate'])

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function validateDefinition(definition: { readonly kind: string; readonly events: object }): void {
  if (definition.kind.trim() === '') throw new TypeError('Conversation kind must be a non-empty string.')
  if (!isRecord(definition.events)) {
    throw new TypeError(`Conversation ${JSON.stringify(definition.kind)} events must be an object.`)
  }
  const entries = Object.entries(definition.events)
  if (entries.length === 0) {
    throw new TypeError(`Conversation ${JSON.stringify(definition.kind)} must declare at least one event.`)
  }
  let hasStart = false
  for (const [type, value] of entries) {
    if (!isRecord(value) || (value.role !== 'start' && value.role !== 'update') || typeof value.id !== 'function') {
      throw new TypeError(`Conversation ${JSON.stringify(definition.kind)} event ${JSON.stringify(type)} must declare role and id(event).`)
    }
    if (value.role === 'start') hasStart = true
    if (value.publication !== undefined && !PUBLICATIONS.has(value.publication as ConversationPublication)) {
      throw new TypeError(`Conversation ${JSON.stringify(definition.kind)} event ${JSON.stringify(type)} has invalid publication.`)
    }
  }
  if (!hasStart) throw new TypeError(`Conversation ${JSON.stringify(definition.kind)} must declare at least one start event.`)
}

function validateComponentOptions(
  kind: string,
  events: ConversationEventDescriptors,
  options: {
    readonly initial: unknown
    readonly reduce?: unknown
    readonly publication?: unknown
    readonly locationData?: unknown
    readonly view?: unknown
    readonly component: unknown
  },
): void {
  if (typeof options.initial !== 'function') throw new TypeError(`Conversation ${JSON.stringify(kind)} initial must be a function.`)
  const hasUpdates = Object.values(events).some(descriptor => descriptor?.role === 'update')
  if (hasUpdates && typeof options.reduce !== 'function') {
    throw new TypeError(`Conversation ${JSON.stringify(kind)} reduce must be a function when update events are declared.`)
  }
  if (options.reduce !== undefined && typeof options.reduce !== 'function') {
    throw new TypeError(`Conversation ${JSON.stringify(kind)} reduce must be a function.`)
  }
  if (options.publication !== undefined && typeof options.publication !== 'function') {
    throw new TypeError(`Conversation ${JSON.stringify(kind)} publication must be a function.`)
  }
  if (options.locationData !== undefined && typeof options.locationData !== 'function') {
    throw new TypeError(`Conversation ${JSON.stringify(kind)} locationData must be a function.`)
  }
  if (options.view !== undefined && typeof options.view !== 'function') {
    throw new TypeError(`Conversation ${JSON.stringify(kind)} view must be a function.`)
  }
  if (typeof options.component !== 'function') throw new TypeError(`Conversation ${JSON.stringify(kind)} component must be a function.`)
}

function locationOf<State>(context: ConversationNodeContext<State>): ConversationLocation {
  return context.start?.location ?? context.matches[0]?.location ?? { kind: 'unresolved' }
}

function anchorOf<State>(context: ConversationNodeContext<State>): number {
  return context.start?.event.seq ?? context.matches[0]?.event.seq ?? 0
}

function locationDataOf(kind: string, scope: ConversationLocationDataScope, projection: ConversationLocationDataProjection): ConversationLocationData {
  if (!Number.isSafeInteger(projection.turn) || projection.turn < 0) {
    throw new TypeError(`Conversation ${JSON.stringify(kind)} locationData returned an invalid turn coordinate.`)
  }
  if (scope === 'turn') {
    if (projection.step !== undefined) {
      throw new TypeError(`Conversation ${JSON.stringify(kind)} turn locationData must not include a step coordinate.`)
    }
    return { kind: 'turn', turn: projection.turn, key: kind, value: projection.value } as ConversationLocationData
  }
  if (!Number.isSafeInteger(projection.step) || (projection.step as number) < 0) {
    throw new TypeError(`Conversation ${JSON.stringify(kind)} step locationData must include a valid step coordinate.`)
  }
  return {
    kind: 'step',
    turn: projection.turn,
    step: projection.step,
    key: kind,
    value: projection.value,
  } as ConversationLocationData
}

function descriptorFor<Events extends ConversationEventDescriptors>(
  events: Events,
  event: SessionEvent,
): ConversationEventDescriptor<ConversationEventType<Events>> | undefined {
  return events[event.type as ConversationEventType<Events>] as ConversationEventDescriptor<ConversationEventType<Events>> | undefined
}

function createContribution<Kind extends string, Events extends ConversationEventDescriptors, State, Data>(
  contract: ConversationContract<Kind, Events>,
  options: ConversationComponentOptions<Kind, Events, State, Data>,
): ConversationComponentContribution<Kind, Events, State, Data> {
  validateComponentOptions(contract.kind, contract.events, options)
  const definition: ConversationNodeDefinition<State> = {
    kind: contract.kind,
    target: 'chat',
    match(event) {
      const descriptor = descriptorFor(contract.events, event)
      if (descriptor === undefined) return null
      const id = descriptor.id(event as SessionEvent<ConversationEventType<Events>>)
      if (typeof id !== 'string') {
        throw new TypeError(`Conversation ${JSON.stringify(contract.kind)} event ${JSON.stringify(event.type)} returned a non-string id.`)
      }
      return { id, role: descriptor.role }
    },
    start(context, match, reader) {
      const typedMatch = match as ConversationInitialInput<Events, State>['match']
      return options.initial({
        context,
        event: typedMatch.event,
        match: typedMatch,
        reader,
        previous: kind => reader.previous(kind),
      })
    },
    update(context, match) {
      if (options.reduce === undefined) return context.state
      const typedMatch = match as ConversationReduceInput<Events, State>['match']
      return options.reduce({
        context,
        state: context.state,
        event: typedMatch.event,
        match: typedMatch,
      })
    },
    buildViewNode(context) {
      const projection =
        options.view === undefined ? (context.state === undefined ? null : { data: context.state as Data }) : options.view({ context, state: context.state })
      if (projection === null) return null
      const node: ConversationRendererNode<Kind, Data> = {
        key: context.key,
        kind: contract.kind,
        id: context.id,
        target: 'chat',
        anchorSeq: projection.anchorSeq ?? anchorOf(context),
        location: projection.location ?? locationOf(context),
        visibility: projection.visibility ?? 'visible',
        data: projection.data,
      }
      return node
    },
    ...(options.locationData === undefined
      ? {}
      : {
          buildLocationData(context, scope) {
            const projection = options.locationData?.({ context, state: context.state, scope }) ?? null
            return projection === null ? null : locationDataOf(contract.kind, scope, projection)
          },
        }),
    ...(options.publication === undefined && !Object.values(contract.events).some(value => value?.publication !== undefined)
      ? {}
      : {
          publication(match: ConversationMatch) {
            const event = match.event as ConversationContractEvent<Events>
            const descriptor = descriptorFor(contract.events, event)
            if (descriptor === undefined) return 'immediate'
            const input: ConversationPublicationInput<Events> = {
              event,
              match: match as ConversationTypedMatch<ConversationContractEvent<Events>>,
              descriptor,
            }
            return options.publication?.(input) ?? descriptor.publication ?? 'immediate'
          },
        }),
  }
  const authorComponent = options.component as ComponentType<ConversationRendererProps<Kind, Data>>
  const renderer = (props: ConversationRendererSlotProps<Kind, Data>) =>
    createElement(authorComponent, { ...props, data: props.node.data } as ConversationRendererProps<Kind, Data>)
  return {
    kind: 'conversation-component',
    marker: CONVERSATION_COMPONENT_MARKER,
    contract,
    definition,
    renderer: {
      name: 'conversation.chat.node',
      options: { key: contract.kind, locale: 'conversation' },
      component: renderer,
    },
  }
}

/**
 * Define one portable official Session-event family, then attach its complete
 * deterministic Client lifecycle through {@link ConversationContract.component}.
 */
export function defineConversation<const Kind extends string, const Events extends ConversationEventDescriptors>(
  definition: ConversationDefinition<Kind, Events> & { readonly events: Events & NoUnknownEventTypes<Events> },
): ConversationContract<Kind, Events> {
  validateDefinition(definition)
  const contract: ConversationContract<Kind, Events> = {
    kind: definition.kind,
    events: definition.events,
    component: ((options: ConversationComponentOptions<Kind, Events, unknown, unknown>) =>
      createContribution(contract, options)) as ConversationComponentFactory<Kind, Events>,
  }
  return contract
}
