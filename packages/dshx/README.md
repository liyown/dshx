# @becomeopc/dshx

Build, inspect, and ship typed DeepSeek Harness Host and Client plugins without adding a second application runtime.

## Install

```bash
pnpm add -D @becomeopc/dshx @deepseek-ai/dsh
```

Install the adapter-approved Host plugins when your project uses Runtime Inspect or those official contribution seams:

```bash
pnpm add -D @deepseek-ai/dsh-system-prompt @deepseek-ai/dsh-settings @deepseek-ai/dsh-client-ui-settings @deepseek-ai/schemastery @deepseek-ai/dsh-cordis-host-runner @deepseek-ai/dsh-tool-cordis
```

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

`build` and `check` are read-only unless `check --fix` is explicitly requested. `inspect` reads the current running Composition and never falls back to a fabricated catalog. Scaffold commands are transactional, support `--dry-run`, and do not install dependencies or mutate Profiles.

## Public modules

- `@becomeopc/dshx/host`: `defineHost`, the official `defineTool`, `defineCommand`, `definePromptSection`, `definePromptContext`, and the official `PromptSection`, `PromptContext`, and `AssembleContext` types.
- `@becomeopc/dshx/client`: `defineClient`, typed Slot contributions, and `useSettings`.
- `@becomeopc/dshx/api`: typed unary Host/Client APIs.
- `@becomeopc/dshx/settings`: portable Schemastery-backed Settings contracts.
- `@becomeopc/dshx/config`: project configuration.
- `@becomeopc/dshx/compiler`: programmatic Host and Client builds.
- `@becomeopc/dshx/cli`: stable parser and CLI runner interfaces.

Prompt contributions use one ordered wrapper array so DSHX can select the official registration method without changing the contributed object:

```ts
import {
  defineHost,
  definePromptContext,
  definePromptSection,
} from "@becomeopc/dshx/host";

const guidance = definePromptSection({
  name: "plugin:guidance",
  order: 150,
  text: "Use the status tool when the user asks about runtime state.",
});

const runtime = definePromptContext({
  name: "plugin:runtime",
  order: 0,
  text: () => "Runtime state is ready.",
});

export default defineHost({ prompts: [guidance, runtime] });
```

DSH owns ordering, scoped shadowing, assembly, duplicate detection, and disposal. Use `setup(ctx)` when a contribution must be registered directly against a narrower official scope.

Define Settings once, claim Host ownership once, and consume the same contract directly from a Slot component:

```ts
// settings.ts
import Schema from "@deepseek-ai/schemastery";
import { defineSettings } from "@becomeopc/dshx/settings";

export const runtimeSettings = defineSettings({
  namespace: "my-plugin",
  schema: Schema.object({ showActivity: Schema.boolean().default(true) }),
  applies: "live",
});

// host.ts
export default defineHost({ settings: [runtimeSettings] });

// client.tsx
const settings = useSettings(runtimeSettings);
await settings.set("showActivity", false);
```

There is no `ClientDefinition.settings`. A retained `useSettings()` call makes the compiler inject `settingsScope` and require `@deepseek-ai/dsh-client-ui-settings` in `dsh.client.inject`. DSHX delegates persistence, layering, revisions, redaction, validation, shared mirroring, and lifecycle to the official Settings packages. Use `runtimeSettings.host({ base, validate, setup })` only for Host-only behavior; those facets never enter the shared Client contract.

Declare the plugin's public DSH range in `peerDependencies` and pin one concrete local DSH in `devDependencies`. DSHX versions independently; the installed DSH selects the adapter. The current adapter is `protocol-1`, not a mechanical alias for DSH `0.1` semver.

See the [documentation](https://dshx.io/docs), [compatibility policy](https://github.com/liyown/dshx/blob/main/docs/compatibility.md), and [roadmap](https://github.com/liyown/dshx/blob/main/ROADMAP.md).

MIT © DSHX contributors.
