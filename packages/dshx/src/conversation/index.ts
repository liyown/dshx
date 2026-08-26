/** @experimental Conversation remains outside the API Candidate surface. */
export { defineConversation } from './define.js'
export type {
  ConversationContribution,
  ConversationContractEvent,
  ConversationEventDescriptor,
  ConversationEventDescriptors,
  ConversationEventType,
  ConversationEventTypeForRole,
  ConversationLifecycle,
  ConversationLifecycleDefinition,
  ConversationRendererComponent,
  ConversationRendererNode,
  ConversationRendererProps,
  ConversationRendererSlotProps,
  ConversationRenderProps,
  ConversationStartEvent,
  ConversationTypedMatch,
  ConversationUpdateEvent,
} from './types.js'
export type {
  ChatConversationViewNode,
  ConversationContextReader,
  ConversationLocation,
  ConversationMatch,
  ConversationNodeContext,
  ConversationNodeDefinition,
  ConversationPreviousContext,
  ConversationPublication,
} from '@deepseek-ai/dsh-client-runtime/client'
export type { SessionEvent, SessionEventMap, SessionEventType, SessionId } from '@deepseek-ai/dsh-session/types'
