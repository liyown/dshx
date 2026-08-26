# Host API

**Status: API Candidate**

**Entry: `@becomeopc/dshx/host`**

## `defineHost(definition)`

```ts
interface HostDefinition {
  readonly name?: string;
  readonly inject?: readonly string[];
  readonly tools?: readonly ToolDefinition[];
  readonly commands?: readonly CommandDefinition[];
  readonly prompts?: readonly PromptContribution[];
  readonly settings?: readonly SettingsContribution[];
  readonly apis?: readonly ApiHostRegistration[];
  readonly setup?: (ctx: Context) => void | Promise<void>;
}
```

`defineHost()` preserves the exact inferred object type and rejects unknown fields. Use only `apis`; the singular `api` field was removed in `0.1.2`.

```ts
import { defineHost, defineTool } from "@becomeopc/dshx/host";

const statusTool = defineTool({
  name: "plugin_status",
  description: "Return plugin status.",
  parameters: {},
  output: {
    schema: { type: "string" },
    render: (_args, value) => [{ type: "text", text: value }],
  },
  async execute() {
    return "ready";
  },
});

export default defineHost({
  name: "my-plugin",
  tools: [statusTool],
});
```

`defineTool` is the official DSH Tool helper. `defineCommand` is an identity helper over the official `CommandDefinition`; DSHX does not wrap command parsing or execution.

## Registration order

The generated `apply(ctx)` executes contributions in this fixed order:

1. Tools, in array order.
2. Commands, in array order.
3. Prompt Sections and Contexts, in array order.
4. Settings, in array order.
5. APIs, after every API channel is registered.
6. `setup(ctx)`.

Equal-order Prompt contributions retain Host array registration order. Official registries remain authoritative for duplicate names, shadowing, scope, validation, and disposal.

## Automatic injects

DSHX starts with `inject`, removes duplicates, and appends a service only when its contribution list is non-empty.

| Contribution | Cordis service |
| ------------ | -------------- |
| `tools`      | `tools`        |
| `commands`   | `commands`     |
| `prompts`    | `systemPrompt` |
| `settings`   | `settings`     |
| `apis`       | `connection`   |

An empty or omitted list adds no service. Package/provider edges in `package.json` are separate from Cordis service names and are validated by `dshx check` and `dshx build`.

## `setup(ctx)` and disposal

Use `setup` for direct official services or behavior that has no DSHX contribution helper:

```ts
export default defineHost({
  inject: ["events"],
  setup(ctx) {
    ctx.effect(() => {
      const dispose = startObserver(ctx);
      return () => dispose();
    }, "my-plugin observer");
  },
});
```

DSHX does not keep a disposer array. Register lifecycle ownership with `ctx.effect()` or use the disposer semantics of the official registry being called. A Settings `.host({ setup })` disposer is passed to `ctx.effect()` automatically.

## Runtime validation

The built adapter reports a Host-definition diagnostic when the default export is not a `defineHost()` object, contains an unknown field, uses a malformed contribution, or supplies a non-function `setup`. Native DSH Host modules remain supported when they export named `name`, `inject`, `Config`, and `apply` instead of a default definition.

## Related chapters

- [Prompt](./prompt.md)
- [Settings](./settings.md)
- [Typed API](./api.md)
- [Build](./build.md)
