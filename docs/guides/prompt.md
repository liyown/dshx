# Prompt API

**Status: API Candidate**

**Entry: `@becomeopc/dshx/host`**

## Define contributions

```ts
import {
  defineHost,
  definePromptContext,
  definePromptSection,
} from "@becomeopc/dshx/host";

let requestCount = 0;

const guidance = definePromptSection({
  name: "my-plugin:guidance",
  order: 150,
  text: "Use my_plugin_status before reporting runtime health.",
});

const runtime = definePromptContext({
  name: "my-plugin:runtime",
  order: 0,
  text: () => `The plugin has handled ${requestCount} requests.`,
});

export default defineHost({
  prompts: [guidance, runtime],
});
```

```ts
definePromptSection<const T extends PromptSection>(section: T): PromptSectionContribution<T>
definePromptContext<const T extends PromptContext>(context: T): PromptContextContribution<T>
```

Both helpers preserve the official object identity and literal types while producing an opaque Host contribution. Pass the result to `prompts`; do not branch on an internal marker or recreate the wrapper manually.

The Host entry also exports the official `PromptSection`, `PromptContext`, and `AssembleContext` types.

## Runtime behavior

For a non-empty `prompts` list DSHX appends the `systemPrompt` inject once, then calls the matching official `ctx.systemPrompt.section()` or `.context()` registration method in Host array order.

DSHX does not implement or cache:

- order resolution;
- duplicate-name handling;
- global/Agent scope and shadowing;
- complete-section policy;
- variable or Tool-schema providers;
- assembly;
- registration disposal.

Those behaviors remain official `@deepseek-ai/dsh-system-prompt` behavior. A dynamic `text` provider is evaluated when the official assembler reads the Context, so it can reflect current Host state without a DSHX cache.

## Scoped or advanced registration

Use direct official registration in `setup(ctx)` when a contribution must be created under a specific Cordis/Agent scope or uses an official capability not represented by the two helpers:

```ts
export default defineHost({
  inject: ["systemPrompt"],
  setup(ctx) {
    ctx.systemPrompt.section(scopedSection);
  },
});
```

The official registry owns the disposer and restores shadowed contributions when that scope is disposed.

## Errors

A copied object or an object not returned by `definePromptSection()`/`definePromptContext()` is rejected as a malformed Host contribution. Official validation of names, orders, duplicates, complete behavior, and providers is not repeated by DSHX.
