# @becomeopc/dshx

Build, inspect, and ship typed DeepSeek Harness Host and Client plugins without adding a second application runtime.

## Install

For a new plugin, use the initializer so the DSH version, official feature packages, manifest edges, and DSHX release stay aligned:

```bash
pnpm create dshx my-plugin
cd my-plugin
pnpm dev
```

For an existing plugin:

```bash
pnpm add -D @becomeopc/dshx @deepseek-ai/dsh
```

Add the official peer packages required by the contributions your project uses. The [compatibility guide](https://github.com/liyown/dshx/blob/main/docs/compatibility.md) documents the current protocol range and provider edges.

## Minimal Host

```ts
import { defineHost, defineTool } from "@becomeopc/dshx/host";

const status = defineTool({
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

export default defineHost({ tools: [status] });
```

Build and validate the project with:

```bash
dshx check
dshx build
```

The initializer generates a complete mixed Host/Client example with Prompt contributions, Settings, a typed API, and a Client Slot.

## Public modules

| Module                         | Public surface                                                                              | Guide                                                                                            |
| ------------------------------ | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `@becomeopc/dshx/host`         | `defineHost`, official Tool and Command helpers, Prompt wrappers, and official Prompt types | [Host contributions](https://github.com/liyown/dshx/blob/main/docs/guides/host-contributions.md) |
| `@becomeopc/dshx/client`       | `defineClient`, typed Slots, `useApi`, `useQuery`, and `useSettings`                        | [Documentation index](https://github.com/liyown/dshx/blob/main/docs/index.md)                    |
| `@becomeopc/dshx/settings`     | Portable Schemastery-backed Settings contracts                                              | [Settings](https://github.com/liyown/dshx/blob/main/docs/guides/settings.md)                     |
| `@becomeopc/dshx/api`          | Typed unary Host/Client API contracts                                                       | [Typed API](https://github.com/liyown/dshx/blob/main/docs/guides/typed-api.md)                   |
| `@becomeopc/dshx/conversation` | Experimental component-shaped Conversation contracts                                        | [Conversation](https://github.com/liyown/dshx/blob/main/docs/guides/conversation.md)             |
| `@becomeopc/dshx/config`       | Project configuration                                                                       | [Documentation index](https://github.com/liyown/dshx/blob/main/docs/index.md)                    |
| `@becomeopc/dshx/compiler`     | Programmatic Host and Client builds                                                         | [Architecture](https://github.com/liyown/dshx/blob/main/docs/architecture.md)                    |
| `@becomeopc/dshx/cli`          | Stable parser and CLI runner interfaces                                                     | [CLI reference](https://github.com/liyown/dshx/blob/main/docs/cli-reference.md)                  |
| `@becomeopc/dshx/compat`       | Adapter resolution, project compatibility assessment, capabilities, and diagnostics         | [Compatibility](https://github.com/liyown/dshx/blob/main/docs/compatibility.md)                  |

## Commands

```bash
dshx build
dshx check
dshx check --fix --dry-run
dshx dev
dshx inspect slots
dshx add ui --slot <slot-name>
dshx add tool --name <tool-name>
dshx add command --name <command-name>
dshx add hook --event <event-name>
```

`build` writes only declared artifacts and does not rewrite source or manifest metadata. `check` is read-only unless `check --fix` is explicitly requested. `inspect` reads the current running Composition and never falls back to a fabricated catalog. Scaffold commands are transactional, support `--dry-run`, and do not install dependencies or mutate Profiles.

## Documentation

- [Documentation index](https://github.com/liyown/dshx/blob/main/docs/index.md)
- [Architecture](https://github.com/liyown/dshx/blob/main/docs/architecture.md)
- [Compatibility policy](https://github.com/liyown/dshx/blob/main/docs/compatibility.md)
- [Roadmap](https://github.com/liyown/dshx/blob/main/ROADMAP.md)
- [Framework Hub](https://dshx.io/docs)

Declare the plugin's public DSH range in `peerDependencies` and pin one concrete local DSH in `devDependencies`. DSHX versions independently; the installed DSH selects the compatibility adapter.

MIT © DSHX contributors.
