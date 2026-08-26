# @becomeopc/dshx

Typed authoring, bounded Vite builds, diagnostics, and development orchestration for DeepSeek Harness plugins. DSHX does not replace the official DSH/Cordis runtime.

## Install

Create a new minimal project:

```bash
pnpm create dshx my-plugin
cd my-plugin
pnpm check
pnpm dev
```

Generate the complete Candidate API example:

```bash
pnpm create dshx my-plugin --template showcase --style tailwind
```

For an existing package, install DSHX plus one concrete DSH development version and the official feature packages used by the plugin:

```bash
pnpm add -D @becomeopc/dshx @deepseek-ai/dsh
```

## Public modules

| Module                                      | Status                 | Exports                                                                               |
| ------------------------------------------- | ---------------------- | ------------------------------------------------------------------------------------- |
| `@becomeopc/dshx`                           | API Candidate          | `defineConfig`, `DshxConfig`                                                          |
| `@becomeopc/dshx/config`                    | API Candidate          | Same config-only surface                                                              |
| `@becomeopc/dshx/host`                      | API Candidate          | `defineHost`, `defineTool`, `defineCommand`, Prompt helpers and official Prompt types |
| `@becomeopc/dshx/client`                    | API Candidate          | `defineClient`, `defineSlot`, `useApi`, `useApiQuery`, `useSettings`, Slot/Hook types |
| `@becomeopc/dshx/api`                       | API Candidate          | `defineApi`, `method`, `isApiError`, shared API types                                 |
| `@becomeopc/dshx/settings`                  | API Candidate          | `defineSettings` and shared Settings types                                            |
| `@becomeopc/dshx/experimental/conversation` | Experimental           | `defineConversation`, lifecycle/render types, official event types                    |
| `@becomeopc/dshx/tooling`                   | Tooling / Experimental | Node-only build/watch, config, compatibility, diagnostics, CLI, and repair APIs       |

The root no longer reexports Host/Client authoring helpers. The old `/compiler`, `/compat`, `/cli`, and `/conversation` subpaths have no runtime aliases.

## Minimal Host

```ts
import { defineHost, defineTool } from "@becomeopc/dshx/host";

const status = defineTool({
  name: "my_plugin_status",
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

export default defineHost({ tools: [status] });
```

## Build config

```ts
import { defineConfig } from "@becomeopc/dshx";

export default defineConfig({
  host: { entry: "src/host.ts" },
  client: { entry: "src/client.tsx" },
  build: { sourcemap: true, declarations: true },
});
```

`host.vite.plugins` and `client.vite.plugins` accept a bounded native Vite `PluginOption[]`. DSHX protects entry, target, external, chunk, format, and asset policy; Client CSS and inline assets still use Vite's standard pipeline.

## Commands

```bash
dshx check
dshx check --runtime
dshx build
dshx dev
```

Plain `check` is offline and includes TypeScript `noEmit`; `--runtime` additionally requires the linked Profile/Composition/runtime. `build` typechecks first and emits declarations by default.

## Documentation

- [API chapters](https://github.com/liyown/dshx/blob/main/docs/index.md)
- [0.1.1 to 0.1.2 migration](https://github.com/liyown/dshx/blob/main/docs/migrations/0.1.1-to-0.1.2.md)
- [Compatibility](https://github.com/liyown/dshx/blob/main/docs/compatibility.md)
- [Framework Hub](https://dshx.io)

MIT © DSHX contributors.
