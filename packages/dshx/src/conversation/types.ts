import type { ComponentType } from 'react'
import type {
  ChatConversationViewNode,
  ConversationContextReader,
  ConversationLocation,
  ConversationLocationDataScope,
  ConversationMatch,
  ConversationNodeContext,
  ConversationNodeDefinition,
  ConversationPreviousContext,
  ConversationPublication,
} from '@deepseek-ai/dsh-client-runtime/client'
import type { SessionEvent, SessionEventMap, SessionEventType } from '@deepseek-ai/dsh-session/types'
import type { ChatNodeOwnerProps, UseChatNodeTurnData } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { GlobalStandardProps, PropsLocale, SessionStandardProps } from '@deepseek-ai/dsh-client-ui-slots'

/** Stable contribution marker used by Client runtime diagnostics. */
export const CONVERSATION_COMPONENT_MARKER = 'dshx.conversation-component.v1' as const

/** One official Session event type's Conversation lifecycle role and identity extractor. */
export interface ConversationEventDescriptor<Type extends SessionEventType = SessionEventType> {
  readonly role: 'start' | 'update'
  readonly id: (event: SessionEvent<Type>) => string
  readonly publication?: ConversationPublication
}

/** Object-first event family keyed exclusively by the official SessionEventMap. */
export type ConversationEventDescriptors = {
  readonly [Type in keyof SessionEventMap]?: ConversationEventDescriptor<Type>
}

/** Event types retained by one Conversation contract. */
export type ConversationEventType<Events extends ConversationEventDescriptors> = keyof Events & SessionEventType

/** Event types assigned one lifecycle role by a Conversation contract. */
export type ConversationEventTypeForRole<Events extends ConversationEventDescriptors, Role extends ConversationEventDescriptor['role']> = {
  [Type in ConversationEventType<Events>]: Events[Type] extends { readonly role: Role } ? Type : never
}[ConversationEventType<Events>]

/** Typed official event union retained by one Conversation contract. */
export type ConversationContractEvent<Events extends ConversationEventDescriptors> = SessionEvent<ConversationEventType<Events>>

/** Typed official start-event union retained by one Conversation contract. */
export type ConversationStartEvent<Events extends ConversationEventDescriptors> = SessionEvent<ConversationEventTypeForRole<Events, 'start'>>

/** Typed official update-event union retained by one Conversation contract. */
export type ConversationUpdateEvent<Events extends ConversationEventDescriptors> = SessionEvent<ConversationEventTypeForRole<Events, 'update'>>

/** Official Match narrowed to one contract-owned Session event union. */
export type ConversationTypedMatch<Event extends SessionEvent = SessionEvent> = Omit<ConversationMatch, 'event'> & { readonly event: Event }

/** Input that creates deterministic State from one start event. */
export interface ConversationInitialInput<Events extends ConversationEventDescriptors, State> {
  readonly context: ConversationNodeContext<State>
  readonly event: ConversationStartEvent<Events>
  readonly match: ConversationTypedMatch<ConversationStartEvent<Events>>
  readonly reader: ConversationContextReader
  previous<PreviousState>(kind: string): ConversationPreviousContext<PreviousState> | undefined
}

/** Input that folds one ascending post-start update into deterministic State. */
export interface ConversationReduceInput<Events extends ConversationEventDescriptors, State> {
  readonly context: ConversationNodeContext<State> & { readonly state: State }
  readonly state: State
  readonly event: ConversationUpdateEvent<Events>
  readonly match: ConversationTypedMatch<ConversationUpdateEvent<Events>>
}

/** Optional per-Match publication override layered above descriptor defaults. */
export interface ConversationPublicationInput<Events extends ConversationEventDescriptors> {
  readonly event: ConversationContractEvent<Events>
  readonly match: ConversationTypedMatch<ConversationContractEvent<Events>>
  readonly descriptor: ConversationEventDescriptor<ConversationEventType<Events>>
}

/** Input for publishing Definition-owned Step or Turn business data. */
export interface ConversationLocationDataInput<State> {
  readonly context: ConversationNodeContext<State>
  readonly state: State | undefined
  readonly scope: ConversationLocationDataScope
}

/** Turn-scoped business value; DSHX supplies the owning contract key and scope discriminator. */
export interface ConversationTurnLocationDataProjection<Value = unknown> {
  readonly turn: number
  readonly step?: never
  readonly value: Value
}

/** Step-scoped business value; DSHX supplies the owning contract key and scope discriminator. */
export interface ConversationStepLocationDataProjection<Value = unknown> {
  readonly turn: number
  readonly step: number
  readonly value: Value
}

/** Contract-owned Location data projection accepted by the component lifecycle. */
export type ConversationLocationDataProjection<Value = unknown> = ConversationTurnLocationDataProjection<Value> | ConversationStepLocationDataProjection<Value>

/** Renderer-ready projection; DSHX fills stable Definition and target identity. */
export interface ConversationViewProjection<Data> {
  readonly data: Data
  readonly anchorSeq?: number
  readonly location?: ConversationLocation
  readonly visibility?: 'visible' | 'hidden'
}

/** Input for projecting assembled State into one Chat renderer payload. */
export interface ConversationViewInput<State> {
  readonly context: ConversationNodeContext<State>
  readonly state: State | undefined
}

/** Final Chat Node narrowed to the contribution's renderer key and payload. */
export type ConversationRendererNode<Kind extends string, Data> = Omit<ChatConversationViewNode, 'kind' | 'data'> & {
  readonly kind: Kind
  readonly data: Data
}

/** Official keyed Chat Slot props without requiring a ChatNodeDataMap merge. */
export type ConversationRendererSlotProps<Kind extends string, Data> = ChatNodeOwnerProps &
  SessionStandardProps &
  GlobalStandardProps &
  PropsLocale<'conversation'> & {
    readonly node: ConversationRendererNode<Kind, Data>
    readonly useTurnData: UseChatNodeTurnData
  }

/** Full official Slot currency plus the state machine's projected data. */
export type ConversationRendererProps<Kind extends string, Data> = ConversationRendererSlotProps<Kind, Data> & { readonly data: Data }

/** Hook-capable React renderer paired with one Conversation state machine. */
export type ConversationRendererComponent<Kind extends string, Data> = ComponentType<ConversationRendererProps<Kind, Data>>

type ConversationReducerOptions<Events extends ConversationEventDescriptors, State> = [ConversationEventTypeForRole<Events, 'update'>] extends [never]
  ? { readonly reduce?: (input: ConversationReduceInput<Events, NoInfer<State>>) => State }
  : { readonly reduce: (input: ConversationReduceInput<Events, NoInfer<State>>) => State }

/** Component lifecycle options; omitting view projects defined State directly. */
export type ConversationComponentOptions<Kind extends string, Events extends ConversationEventDescriptors, State, Data = State> = {
  readonly initial: (input: ConversationInitialInput<Events, State>) => State
  readonly publication?: (input: ConversationPublicationInput<Events>) => ConversationPublication | undefined
  readonly locationData?: (input: ConversationLocationDataInput<NoInfer<State>>) => ConversationLocationDataProjection | null
  readonly view?: (input: ConversationViewInput<NoInfer<State>>) => ConversationViewProjection<Data> | null
  readonly component: ConversationRendererComponent<Kind, NoInfer<Data>>
} & ConversationReducerOptions<Events, State>

/** Lifecycle options whose default renderer payload is the assembled State. */
export type ConversationDefaultComponentOptions<Kind extends string, Events extends ConversationEventDescriptors, State> = Omit<
  ConversationComponentOptions<Kind, Events, State, State>,
  'view'
> & {
  readonly view?: never
}

/** Lifecycle options that explicitly project assembled State into renderer Data. */
export type ConversationProjectedComponentOptions<Kind extends string, Events extends ConversationEventDescriptors, State, Data> = ConversationComponentOptions<
  Kind,
  Events,
  State,
  Data
> & {
  readonly view: (input: ConversationViewInput<NoInfer<State>>) => ConversationViewProjection<Data> | null
}

/** Component factory defaults renderer Data to State when view is omitted. */
export interface ConversationComponentFactory<Kind extends string, Events extends ConversationEventDescriptors> {
  <Initial extends (input: ConversationInitialInput<Events, never>) => any, Data = ReturnType<Initial>>(
    options: {
      readonly initial: Initial
      readonly publication?: (input: ConversationPublicationInput<Events>) => ConversationPublication | undefined
      readonly locationData?: (input: ConversationLocationDataInput<ReturnType<Initial>>) => ConversationLocationDataProjection | null
      readonly view?: (input: ConversationViewInput<ReturnType<Initial>>) => ConversationViewProjection<Data> | null
      readonly component: ConversationRendererComponent<Kind, NoInfer<Data>>
    } & ConversationReducerOptions<Events, ReturnType<Initial>>,
  ): ConversationComponentContribution<Kind, Events, ReturnType<Initial>, Data>
}

/** One integrated official Definition and keyed Chat renderer contribution. */
export interface ConversationComponentContribution<
  Kind extends string = string,
  Events extends ConversationEventDescriptors = ConversationEventDescriptors,
  State = unknown,
  Data = unknown,
> {
  readonly kind: 'conversation-component'
  readonly marker: typeof CONVERSATION_COMPONENT_MARKER
  readonly contract: ConversationContract<Kind, Events>
  readonly definition: ConversationNodeDefinition<State>
  readonly renderer: {
    readonly name: 'conversation.chat.node'
    readonly options: {
      readonly key: Kind
      readonly locale: 'conversation'
    }
    readonly component: ComponentType<ConversationRendererSlotProps<Kind, Data>>
  }
}

/** Portable event-family identity extended once with a Client component lifecycle. */
export interface ConversationContract<Kind extends string = string, Events extends ConversationEventDescriptors = ConversationEventDescriptors> {
  readonly kind: Kind
  readonly events: Events
  readonly component: ConversationComponentFactory<Kind, Events>
}
