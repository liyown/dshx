# Client and Slot API

**Status: API Candidate**

**Entry: `@becomeopc/dshx/client`**

## `defineClient(definition)`

```ts
interface ClientDefinition {
  readonly name?: string;
  readonly inject?: readonly string[];
  readonly conversations?: readonly ConversationContribution[];
  readonly slots?: readonly SlotContribution[];
  readonly setup?: (ctx: Context) => void | Promise<void>;
}
```

There are no Client `api`, `apis`, or `settings` fields. Calling `useApi`, `useApiQuery`, or `useSettings` from retained Client code declares the corresponding capability.

```tsx
import type {} from "@deepseek-ai/dsh-client-ui-sidebar/client";
import { defineClient, defineSlot } from "@becomeopc/dshx/client";

function Status() {
  return <p>Plugin ready</p>;
}

const statusSlot = defineSlot("sidebar.footer.action", {
  id: "my-plugin.status",
  order: 0,
  component: Status,
});

export default defineClient({
  name: "my-plugin",
  slots: [statusSlot],
});
```

## `defineSlot(name, options)`

`name` must be a key of the official `SlotMap`. The provider's module augmentation supplies the valid names and the option/prop types, so import its `client` type entry when required.

`SlotOptions` supports the official Slot model:

| Option                                      | Meaning                                                                          |
| ------------------------------------------- | -------------------------------------------------------------------------------- |
| `component`                                 | React component receiving the composed props for the selected Slot kind          |
| `id`, `order`, `key`, and other kind fields | `KindOptions` selected by the official Slot declaration                          |
| `store`                                     | Official store declaration; component props receive its normalized `HandleOf<H>` |
| `inject`                                    | Maps official Slot/store inputs into additional typed component props            |
| `children`                                  | Declares child Slots consumed through `renderSlot` or `renderSlotChain`          |
| `locale`                                    | Selects an official locale namespace and adds its typed locale props             |
| `registrant`                                | Overrides official registration metadata where supported                         |

The helper preserves keyed/list/chain/session/maybe behavior from the official Slot types. If `children` are declared but the component does not consume `renderSlot` or `renderSlotChain`, `RendersCheck` produces a type error. `SlotContribution` is opaque: pass it to `defineClient({ slots })`; do not copy or inspect it.

## Registration and lifecycle

Client registration order is:

1. Experimental Conversation contributions and their keyed chat renderers.
2. Slots, in array order.
3. `setup(ctx)`.

Non-empty Conversations add `conversationEvents` and `slots`. Non-empty Slots add `slots`. Hook capabilities add `connection` or `settingsScope` only when the corresponding Hook module survives final tree-shaking.

Slot and Conversation components are wrapped with the current Client Fiber's API and Settings contexts. Contract identity maps belong to that Fiber and disappear on dispose/HMR; DSHX does not retain a global scope or API cache.

## Hooks

The Client entry exports:

```ts
useApi(contract);
useApiQuery(contract, method, options);
useSettings(contract);
```

Call Hooks only from React components. Calling one outside a DSHX Slot/Conversation renderer throws because no current Client runtime context exists. See [Typed API](./api.md) and [Settings](./settings.md).

## Native Client modules

A module with named `name`, `inject`, `Config`, and `apply` exports bypasses `defineClient()` and is forwarded as an official Client module. DSHX contribution helpers and Hook auto-wiring apply to declarative default exports.
