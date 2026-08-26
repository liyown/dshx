# @becomeopc/dshx

Typed authoring, bounded Vite builds, diagnostics, and development orchestration for DeepSeek Harness plugins. DSHX does not replace the official DSH/Cordis runtime.

## Install

Create a new minimal project:

```bash
pnpm create dshx@preview my-plugin
cd my-plugin
pnpm check
pnpm dev
```

Generate the complete Candidate API example:

```bash
pnpm create dshx@preview my-plugin --template showcase --style tailwind
```

For an existing package, install DSHX plus one concrete DSH development version and the official feature packages used by the plugin:

```bash
pnpm add -D @becomeopc/dshx@preview @deepseek-ai/dsh
```

## Public modules

| Module                                      | Status                 | Exports                                                                               |
| ------------------------------------------- | ---------------------- | ------------------------------------------------------------------------------------- |
| `@becomeopc/dshx`                           | API Candidate          | `defineConfig`, `DshxConfig`                                                          |
| `@becomeopc/dshx/config`                    | API Candidate          | Same config-only surface                                                              |
| `@becomeopc/dshx/host`                      | API Candidate          | `defineHost`, `defineTool`, `defineCommand`, Prompt helpers and official Prompt types |
| `@becomeopc/dshx/client`                    | API Candidate          | `defineClient`, `defineLocale`, `defineSlot`, Hooks, Locale/Slot types                |
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

## Client dependencies

Client provider packages and runtime services are separate declarations. `package.json#dsh.client.inject` makes a provider package load before the plugin; `defineClient({ inject: [...] })` tells Cordis which services `setup(ctx)` directly requires.

For plugin-owned copy, use `defineLocale()` instead of augmenting `LocaleNamespaceMap`:

```json
{
  "dsh": {
    "client": {
      "inject": ["@deepseek-ai/dsh-client-locale"]
    }
  }
}
```

```tsx
import {
  defineClient,
  defineLocale,
  defineSlot,
  type PropsLocaleOf,
} from "@becomeopc/dshx/client";

const copy = defineLocale("my-plugin.status", {
  zh: { ready: "已就绪" },
  en: { ready: "Ready" },
});

function Status({ t }: PropsLocaleOf<typeof copy>) {
  return <p>{t("ready")}</p>;
}

const slot = defineSlot("sidebar.footer.action", {
  id: "my-plugin.status",
  locale: copy,
  component: Status,
});

export default defineClient({ locales: [copy], slots: [slot] });
```

`zh` and `en` must contain the same string-valued keys. Non-empty `locales` registers the dictionaries before Slots and automatically requests the Cordis `locale` service; the package still declares `@deepseek-ai/dsh-client-locale` in `dsh.client.inject`. `dshx check`, `dshx build`, and every `dshx dev` Client rebuild diagnose a missing provider edge. Raw locale namespace strings remain available for advanced integration with a provider-owned, augmented `LocaleNamespaceMap`, but do not register dictionaries.

## Commands

```bash
dshx check
dshx check --runtime
dshx build
dshx dev
dshx dev --port 0
```

Plain `check` is offline and includes TypeScript `noEmit`; `--runtime` additionally requires the linked Profile/Composition/runtime. `build` typechecks first and emits declarations by default. `dev --port 0` lets DSH ask the OS for a free Web port; pass a concrete port when the same address must survive automatic Host restarts.

## Documentation

- [API chapters](https://github.com/liyown/dshx/blob/main/docs/index.md)
- [0.1.1 to 0.1.2 migration](https://github.com/liyown/dshx/blob/main/docs/migrations/0.1.1-to-0.1.2.md)
- [Compatibility](https://github.com/liyown/dshx/blob/main/docs/compatibility.md)
- [Preview scope](https://github.com/liyown/dshx/blob/main/docs/preview.md)
- [Framework Hub](https://dshx.io)

MIT © DSHX contributors.
