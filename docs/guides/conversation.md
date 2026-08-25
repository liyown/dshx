# Conversation components

Conversation components combine a deterministic official Conversation definition and its keyed `conversation.chat.node` React renderer in one author-facing contribution. The component shape removes registration boilerplate without moving Session or assembly ownership into DSHX.

This API is experimental.

## Define one component lifecycle

```tsx
import { defineClient } from "@becomeopc/dshx/client";
import { defineConversation } from "@becomeopc/dshx/conversation";

interface TurnStatusState {
  readonly turn: number;
  readonly status: string;
}

const turnStatus = defineConversation({
  kind: "plugin:turn-status",
  events: {
    "turn/start": {
      role: "start",
      id: (event) => String(event.data.turn),
    },
    "turn/end": {
      role: "update",
      id: (event) => String(event.data.turn),
    },
  },
}).component({
  initial: ({ event }): TurnStatusState => ({
    turn: event.data.turn,
    status: "running",
  }),
  reduce: ({ state, event }): TurnStatusState => ({
    ...state,
    status: event.data.reason.kind,
  }),
  view: ({ state }) =>
    state === undefined
      ? null
      : {
          data: {
            label: `Turn ${state.turn}: ${state.status}`,
          },
        },
  component: ({ data }) => <p>{data.label}</p>,
});

export default defineClient({ conversations: [turnStatus] });
```

One contribution registers the official Conversation definition before its keyed Chat renderer. DSHX also infers the required `conversationEvents` and `slots` Client services.

## Lifecycle surface

| Surface                    | Responsibility                                                                   |
| -------------------------- | -------------------------------------------------------------------------------- |
| `kind`                     | Stable Conversation definition and renderer identity                             |
| `events[type].role`        | Mark an official Session event as `start` or `update`                            |
| `events[type].id(event)`   | Produce the instance id that groups related matches                              |
| `events[type].publication` | Optional official publication default for that event type                        |
| `initial(input)`           | Create deterministic state from a start event                                    |
| `reduce(input)`            | Fold one ascending update into existing state; required when update events exist |
| `publication(input)`       | Optionally override publication per match                                        |
| `locationData(input)`      | Publish contract-owned Turn or Step business data                                |
| `view(input)`              | Project assembled state into renderer data and optional node metadata            |
| `component(props)`         | Render the projected data with the full official Chat Slot props                 |

`initial` receives the typed start event, official match and context, a context reader, and `previous(kind)`. `reduce` receives the typed update-event union and current state. These functions form the deterministic assembly path; keep side effects and React Hooks out of them.

If `view` is omitted, defined state becomes renderer data directly:

```tsx
const messageNode = defineConversation({
  kind: "plugin:user-message",
  events: {
    "user/message": {
      role: "start",
      id: (event) => String(event.seq),
    },
  },
}).component({
  initial: ({ event }) => ({ sequence: event.seq }),
  component: ({ data }) => <p>Message event {data.sequence}</p>,
});
```

`view` may return `null` to omit the node, or return:

```ts
{
  data,
  anchorSeq?,
  location?,
  visibility?: "visible" | "hidden"
}
```

DSHX fills stable `key`, `kind`, `id`, and `target` fields. When optional fields are omitted, it derives the anchor and location from official start evidence and defaults visibility to `visible`.

## Location and publication

`locationData` returns only the business coordinates and value:

```ts
locationData({ state, scope }) {
  if (state === undefined || scope !== "turn") return null;
  return { turn: state.turn, value: state.status };
}
```

For Turn scope return `{ turn, value }`; for Step scope return `{ turn, step, value }`. DSHX supplies the contract-owned key and the current scope discriminator, then delegates storage and lookup to the official assembler.

Publication values are the official `none`, `animation-frame`, and `immediate` modes. A component-level `publication(input)` result overrides an event descriptor's default when it returns a value; otherwise the descriptor or official immediate default applies.

## React props and Host interaction

The renderer receives `data`, the typed `node`, and the complete official Chat Slot currency, including Session identity, locale, projection, workspace, and Turn-data helpers. React Hooks are valid here.

Use the existing typed API for Host interaction:

```tsx
import { useApi } from "@becomeopc/dshx/client";
import { reviewActions } from "./review-api.js";

function ReviewNode({ data }: { data: { reviewId: string } }) {
  const actions = useApi(reviewActions);

  return (
    <button
      onClick={() => {
        void actions.retry({ reviewId: data.reviewId });
      }}
    >
      Retry review
    </button>
  );
}
```

This retains the API Hook-driven Connection capability automatically. It does not add a Conversation-specific action bus, and an API response does not mutate assembled state. Authorization, revision checks, idempotency, durable outcomes, and business cancellation remain Host responsibilities. Read [Typed Host/Client API](./typed-api.md) for the full contract.

## Durable event boundary

At the verified `protocol-1` boundary, every `events` key must already exist in the official `SessionEventMap`. TypeScript declaration merging can teach a local compiler about a type, but it does not register that event with Session persistence.

The currently released DSH Session packages expose no out-of-tree vocabulary registry for required durable event types. Consequently, DSHX does not provide a custom durable-event helper or a Host emit shortcut. Use official event types today, and treat the official Session log as the only replayable source of Conversation UI state.

## Runtime ownership

DSHX adapts the component declaration into official contracts. The official runtime still owns:

- event matching and ascending fold order;
- replay and reconstruction;
- scoped registration and shadowing;
- node publication and pagination;
- location storage and lookup;
- Chat Slot composition; and
- Fiber/HMR disposal.

DSHX does not keep a Conversation registry, assembled-state cache, event log, pagination model, or renderer lifecycle of its own.

Read [Architecture](../architecture.md) for the ownership boundary and [Compatibility](../compatibility.md) for the currently verified official packages.
