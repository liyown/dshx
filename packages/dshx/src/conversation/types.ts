import type { ComponentType } from 'react'
import type {
  ChatConversationViewNode,
  ConversationContextReader,
  ConversationLocation,
  ConversationMatch,
  ConversationNodeContext,
  ConversationNodeDefinition,
  ConversationPreviousContext,
  ConversationPublication,
} from '@deepseek-ai/dsh-client-runtime/client'
import type { SessionEvent, SessionEventMap, SessionEventType } from '@deepseek-ai/dsh-session/types'
import type { ChatNodeOwnerProps, UseChatNodeTurnData } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { GlobalStandardProps, PropsLocale, SessionStandardProps } from '@deepseek-ai/dsh-client-ui-slots'

declare const conversationContributionBrand: unique symbol
declare const conversationKindBrand: unique symbol
declare const conversationStateBrand: unique symbol
declare const conversationDataBrand: unique symbol

export interface ConversationEventDescriptor<Type extends SessionEventType = SessionEventType> {
  readonly role: 'start' | 'update'
  readonly id: (event: SessionEvent<Type>) => string
  readonly publication?: ConversationPublication
}

export type ConversationEventDescriptors = { readonly [Type in keyof SessionEventMap]?: ConversationEventDescriptor<Type> }
export type ConversationEventType<Events extends ConversationEventDescriptors> = keyof Events & SessionEventType
export type ConversationEventTypeForRole<Events extends ConversationEventDescriptors, Role extends ConversationEventDescriptor['role']> = {
  [Type in ConversationEventType<Events>]: Events[Type] extends { readonly role: Role } ? Type : never
}[ConversationEventType<Events>]
export type ConversationContractEvent<Events extends ConversationEventDescriptors> = SessionEvent<ConversationEventType<Events>>
export type ConversationStartEvent<Events extends ConversationEventDescriptors> = SessionEvent<ConversationEventTypeForRole<Events, 'start'>>
export type ConversationUpdateEvent<Events extends ConversationEventDescriptors> = SessionEvent<ConversationEventTypeForRole<Events, 'update'>>
export type ConversationTypedMatch<Event extends SessionEvent = SessionEvent> = Omit<ConversationMatch, 'event'> & { readonly event: Event }

export type ConversationRendererNode<Kind extends string, Data> = Omit<ChatConversationViewNode, 'kind' | 'data'> & {
  readonly kind: Kind
  readonly data: Data
}

export type ConversationRendererSlotProps<Kind extends string, Data> = ChatNodeOwnerProps &
  SessionStandardProps &
  GlobalStandardProps &
  PropsLocale<'conversation'> & {
    readonly node: ConversationRendererNode<Kind, Data>
    readonly useTurnData: UseChatNodeTurnData
  }

export type ConversationRendererProps<Kind extends string, Data> = ConversationRendererSlotProps<Kind, Data> & { readonly data: Data }
export type ConversationRendererComponent<Kind extends string, Data> = ComponentType<ConversationRendererProps<Kind, Data>>

export interface ConversationLifecycleDefinition<Kind extends string, Events extends ConversationEventDescriptors, State, Data = State> {
  readonly kind: Kind
  readonly events: Events
  readonly initial: (context: ConversationNodeContext<never>, event: ConversationStartEvent<Events>) => State
  readonly reduce?: (state: State, context: ConversationNodeContext<State> & { readonly state: State }, event: ConversationUpdateEvent<Events>) => State
  readonly project?: (state: State, context: ConversationNodeContext<State> & { readonly state: State }) => Data
}

export interface ConversationLifecycle<
  Kind extends string = string,
  Events extends ConversationEventDescriptors = ConversationEventDescriptors,
  State = unknown,
  Data = State,
> {
  readonly kind: Kind
  readonly events: Events
  readonly render: (component: ConversationRendererComponent<Kind, Data>) => ConversationContribution<Kind, State, Data>
}

/** Opaque integrated official Definition + keyed Chat renderer contribution. */
export interface ConversationContribution<Kind extends string = string, State = unknown, Data = unknown> {
  readonly [conversationContributionBrand]: true
  readonly [conversationKindBrand]?: Kind
  readonly [conversationStateBrand]?: State
  readonly [conversationDataBrand]?: Data
}

export type ConversationRenderProps<Lifecycle> =
  Lifecycle extends ConversationLifecycle<infer Kind, any, any, infer Data> ? ConversationRendererProps<Kind, Data> : never

/** Internal parts read only by the Client adapter. */
export interface ConversationContributionParts<State = unknown> {
  readonly definition: ConversationNodeDefinition<State>
  readonly renderer: {
    readonly name: 'conversation.chat.node'
    readonly options: { readonly key: string; readonly locale: 'conversation' }
    readonly component: ComponentType<any>
  }
}

export type { ConversationContextReader, ConversationLocation, ConversationNodeContext, ConversationNodeDefinition, ConversationPreviousContext }
