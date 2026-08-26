# Conversation API

**Status: Experimental**

**Entry: `@becomeopc/dshx/experimental/conversation`**

Conversation combines a pure official event-fold lifecycle with one React renderer. It is not part of the API Candidate surface.

## Define, project, and render

```tsx
import { defineClient, useApi } from "@becomeopc/dshx/client";
import {
  defineConversation,
  type ConversationRenderProps,
} from "@becomeopc/dshx/experimental/conversation";
import { reviewApi } from "./review-api.js";

const turnLifecycle = defineConversation({
  kind: "turn-status",
  events: {
    "turn/start": {
      role: "start",
      id: (event) => String(event.data.turn),
      publication: "immediate",
    },
    "turn/end": {
      role: "update",
      id: (event) => String(event.data.turn),
      publication: "animation-frame",
    },
  },
  initial(_context, event) {
    return { turn: event.data.turn, status: "running" as const };
  },
  reduce(state, _context, event) {
    return { ...state, status: event.data.reason.kind };
  },
  project(state) {
    return { label: `Turn ${state.turn}: ${state.status}` };
  },
});

type TurnProps = ConversationRenderProps<typeof turnLifecycle>;

function TurnNode({ data }: TurnProps) {
  const api = useApi(reviewApi);
  return (
    <button onClick={() => void api.refresh({ turn: data.label })}>
      {data.label}
    </button>
  );
}

const turnConversation = turnLifecycle.render(TurnNode);

export default defineClient({
  conversations: [turnConversation],
});
```

`.render(Component)` returns one opaque contribution that contains both the official Conversation definition and the keyed `conversation.chat.node` renderer. Do not create a second Slot for the same kind.

## Lifecycle signature

```ts
defineConversation({
  kind,
  events,
  initial(context, startEvent) => state,
  reduce?(state, context, updateEvent) => nextState,
  project?(state, context) => rendererData,
})
```

| Field                      | Contract                                                                  |
| -------------------------- | ------------------------------------------------------------------------- |
| `kind`                     | Non-empty key used for the official node definition and chat Slot key     |
| `events`                   | Non-empty map whose keys are official `SessionEventMap` keys              |
| `events[type].role`        | `'start'` opens an instance; `'update'` folds into one                    |
| `events[type].id(event)`   | Returns the stable instance id as a string                                |
| `events[type].publication` | Optional official `'none'`, `'animation-frame'`, or `'immediate'` cadence |
| `initial`                  | Creates state from a start event                                          |
| `reduce`                   | Required when any update event exists; returns replacement state          |
| `project`                  | Converts state to renderer data; omitted means `data` is the state        |

`initial`, `reduce`, and `project` are pure lifecycle functions. They run during official replay, pagination, append, and registry rebuild and must not call React Hooks or depend on component-local state.

## Renderer props

The renderer is a capitalized React component. Its props are the official chat-node owner, Session, global, and `conversation` locale props plus:

```ts
{
  readonly node: ConversationRendererNode<Kind, Data>
  readonly data: Data
  readonly useTurnData: UseChatNodeTurnData
}
```

Use `ConversationRenderProps<typeof lifecycle>` when declaring the component separately. Hooks, including `useApi` and `useApiQuery`, belong only in this renderer.

## Location, ordering, and Host interaction

DSHX creates only `target: 'chat'` nodes. It carries the official match location and anchor sequence into the view node; the official assembler owns replay order, pagination, visibility, publication scheduling, and registry rebuilds.

There is no Conversation-specific Host channel. Call Host behavior through `useApi` or `useApiQuery`. API results do not mutate replayed Conversation state; durable state must still come from official Session events.

## Durable event boundary

Only keys already present in the official `SessionEventMap` are supported. TypeScript declaration merging can help an in-memory test compile but does not register a new durable vocabulary with DSH persistence. The current `protocol-1` contract rejects unknown required persisted events, so DSHX does not provide custom events, an emit shortcut, a private event bus, or a durable migration layer.

## Errors

Definitions reject an empty kind, an empty/invalid event map, missing `initial`, missing `reduce` when update events exist, invalid publication values, or a non-component renderer. Copied contributions fail Client authenticity validation.
