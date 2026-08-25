# Host contributions

`defineHost` is the declarative ownership boundary for one DSHX Host artifact. It registers official DSH contribution objects against the active Cordis context; it does not create parallel registries or retain contribution disposers.

## Define a Host

```ts
import {
  defineHost,
  definePromptContext,
  definePromptSection,
  defineTool,
} from "@becomeopc/dshx/host";

const statusTool = defineTool({
  name: "my_plugin_status",
  description: "Return the plugin status.",
  parameters: {},
  output: {
    schema: { type: "string" },
    render: (_args, value) => [{ type: "text", text: value }],
  },
  async execute() {
    return "ready";
  },
});

const guidance = definePromptSection({
  name: "my-plugin:guidance",
  order: 150,
  text: "Use my_plugin_status when the user asks about plugin state.",
});

let requestCount = 0;
const runtime = definePromptContext({
  name: "my-plugin:runtime",
  order: 0,
  text: () => `Status requests: ${requestCount}`,
});

export default defineHost({
  name: "my-plugin",
  tools: [statusTool],
  prompts: [guidance, runtime],
  setup(ctx) {
    // Direct Cordis behavior belongs here when no declarative seam fits.
    void ctx;
  },
});
```

`defineHost` preserves the definition's literal types. `defineTool` is the official DSH helper, while `defineCommand` preserves the official `CommandDefinition` unchanged.

## Registration order

DSHX registers non-empty arrays in one fixed order:

1. Tools
2. Commands
3. Prompts
4. Settings
5. APIs
6. top-level `setup(ctx)`

Array order is preserved within each contribution family. Equal-order Prompt contributions therefore reach the official registry in author order. The official package still decides final ordering, duplicate handling, scope shadowing, assembly, and disposal.

## Automatic Host injection

Non-empty contribution fields add and deduplicate their required Cordis service:

| Host field      | Injected service |
| --------------- | ---------------- |
| `tools`         | `tools`          |
| `commands`      | `commands`       |
| `prompts`       | `systemPrompt`   |
| `settings`      | `settings`       |
| `api` or `apis` | `connection`     |

An empty array adds no service. Explicit `inject` entries remain available for behavior used from `setup(ctx)` and are deduplicated with inferred entries.

## Prompt Sections and Contexts

Prompt contributions share one ordered `prompts` array. The wrapper records only which official registration method to call and retains the contributed object by identity:

```ts
const section = definePromptSection({
  name: "my-plugin:guidance",
  order: 150,
  text: "Prefer the status tool for runtime questions.",
});

const context = definePromptContext({
  name: "my-plugin:runtime",
  order: 0,
  text: () => readCurrentRuntimeSummary(),
});

export default defineHost({ prompts: [section, context] });
```

`definePromptSection(section)` returns `{ kind: "section", section }`; `definePromptContext(context)` returns `{ kind: "context", context }`. The `PromptSection`, `PromptContext`, and `AssembleContext` types are re-exported from `@becomeopc/dshx/host`.

Dynamic Prompt providers are evaluated by the official assembler, not cached by DSHX. Name validation, `order`, duplicate detection, `complete`, scoped shadowing, and contribution disposal also remain official behavior. Register directly in `setup(ctx)` when an official contribution must attach to a narrower scope than the Host definition:

```ts
export default defineHost({
  inject: ["systemPrompt"],
  setup(ctx) {
    ctx.systemPrompt.section(scopedSection);
  },
});
```

## Settings and APIs

A Settings contract appears in the Host exactly once to declare namespace ownership:

```ts
export default defineHost({ settings: [runtimeSettings] });
```

Use `runtimeSettings.host({ base, validate, setup })` only when the Host needs private behavior. See [Settings](./settings.md).

Typed APIs use the same implementation-facet pattern:

```ts
export default defineHost({
  api: statusApi.host({
    async get({ signal }) {
      signal.throwIfAborted();
      return readStatus();
    },
  }),
});
```

Use `apis` for multiple registrations. See [Typed Host/Client API](./typed-api.md).

## `setup(ctx)` and lifecycle

Top-level `setup(ctx)` runs after declarative contributions are registered. Use it for direct Cordis integration, an official seam DSHX does not model, or behavior that intentionally needs the raw context.

Lifecycle ownership should still stay with Cordis. Register resources through official context APIs and `ctx.effect()` instead of maintaining a module-level disposer list. Settings facets and typed API registrations already hand their disposers to the active Fiber.

## Build boundary

Source helpers and compiled Host artifacts share the same implementation contract. A built artifact must not retain imports of `@becomeopc/dshx/host` or another DSHX-private runtime helper. At runtime it calls only the official services selected by the active compatibility adapter.

Read [Architecture](../architecture.md) for the complete artifact and ownership boundary, and [Compatibility](../compatibility.md) before changing official dependency ranges.
