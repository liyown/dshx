# Build and Vite extensions

**Config status: API Candidate**

**`host.vite` / `client.vite` status: Experimental**

**Config entries: `@becomeopc/dshx` or `@becomeopc/dshx/config`**

## Configuration

```ts
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "@becomeopc/dshx";

export default defineConfig({
  host: {
    entry: "src/host.ts",
  },
  client: {
    entry: "src/client.tsx",
    vite: {
      plugins: [tailwindcss()],
    },
  },
  build: {
    sourcemap: true,
    declarations: true,
  },
});
```

```ts
interface DshxConfig {
  readonly name?: string;
  readonly host?:
    | false
    | {
        readonly entry?: string;
        readonly vite?: { readonly plugins?: readonly PluginOption[] };
      };
  readonly client?:
    | false
    | {
        readonly entry?: string;
        readonly vite?: { readonly plugins?: readonly PluginOption[] };
      };
  readonly profile?: string;
  readonly dev?: { readonly hostRestart?: "manual" | "auto" };
  readonly build?: {
    readonly sourcemap?: boolean;
    readonly declarations?: boolean;
  };
  readonly compatibility?: { readonly allowUnsupported?: boolean };
}
```

String face shorthand was removed. Resolution rules are exact:

| Face value         | Result                                                                                        |
| ------------------ | --------------------------------------------------------------------------------------------- |
| omitted            | Detect `src/host.ts` or `src/client.tsx`; disable the face when the convention file is absent |
| `false`            | Disable the face                                                                              |
| `{}`               | Enable the conventional path and error when the file is absent                                |
| `{ entry: '...' }` | Enable the explicit in-project file and error when it is absent                               |

DSHX reads only `dshx.config.ts`; it does not read `vite.config.*` and does not accept arbitrary Vite `UserConfig` fields.

## Vite plugin contract

`plugins` accepts native Vite `PluginOption[]`, including nested arrays and promises. Vite `enforce` and `apply` ordering is retained. DSHX entry/browser guards run before user transformations; protocol, capability, and artifact guards run after them.

Plugins may resolve or transform modules, participate in the CSS/PostCSS pipeline, and use build/watch hooks. They may not override:

- `root`, `configFile`, or `publicDir`;
- Host or Client input entry;
- output format, filename, exports, code splitting, `manualChunks`, banner, intro, or footer;
- external module policy or build target;
- `assetsInlineLimit` or Client `cssCodeSplit`.

The resolved-config and output guards report the exact protected field. Call a stateful plugin factory separately for Host and Client; reusing the same plugin instance is rejected.

`dshx dev` uses Vite build-watch with `command: 'build'` and development mode. It is not a Vite dev server: a wholly serve-only plugin option is rejected, serve-only branches inside a mixed plugin factory are filtered out, and `configureServer` hooks do not run. A plugin may expose an optional `configureServer` hook, but it must also work through its build hooks. When config or dependency files change, DSHX closes old watchers, resolves both faces again, and switches only after a replacement session succeeds; a failed reload leaves the last-good session running while it waits for a fix.

## CSS and assets

Client CSS uses the standard Vite pipeline. CSS Modules, PostCSS, Tailwind, and user CSS plugins therefore behave like ordinary build plugins within the bounded output contract.

DSHX fixes `cssCodeSplit: false` and `publicDir: false`, and inlines imported images, fonts, and SVG files as data URIs. After Vite emits its single CSS asset, DSHX folds it into the lazy Client factory and removes the standalone asset. Factory materialization creates one owned element:

```html
<style data-plugin="package-id" data-plugin-css="package-id/client.css"></style>
```

Loading the registration script alone does not create the style; it is created when the lazy factory materializes. Official DSH plugin ownership removes the old element during HMR/disposal. The final Client output allows one JavaScript file, an optional sourcemap, declarations, and no independent CSS, asset, worker, WASM, or additional chunk.

## Tailwind v4 without Preflight

Tailwind is optional and remains a generated-project dev dependency. Configure the standard plugin as shown above, then import a CSS-first stylesheet:

```css
@layer theme, utilities;

@import "tailwindcss/theme.css" layer(theme) prefix(dshx);

@import "tailwindcss/utilities.css" layer(utilities) source("./") prefix(dshx);
```

Omitting `tailwindcss/preflight.css` avoids resetting DSH's shared page DOM. Use the `dshx:` utility prefix and complete static class names, for example `className="dshx:flex dshx:gap-2"`; do not assemble class fragments dynamically.

## Artifacts and declarations

`build.sourcemap` defaults to `true`; `build.declarations` defaults to `true`. A mixed project emits:

```text
dist/index.js
dist/index.js.map       # when enabled
dist/index.d.ts
dist/client.js
dist/client.js.map      # when enabled
dist/client.d.ts
```

The declaration files describe the actual DSH/Cordis module shape—`name`, `inject`, `Config`, and `apply(ctx, config)`—not the authoring `HostDefinition`/`ClientDefinition`. Shared contracts appear in public source declarations only when the plugin author explicitly exports them. Build and pack validation require every `package.json` `exports`, `types`, and `bin` path to exist.

## Commands

`dshx build` runs the same offline manifest, migration, and TypeScript checks as `dshx check` before building. `dshx dev` uses the same build kernel in watch mode and then coordinates the official DSH Profile/runtime. Programmatic build/watch APIs live in the experimental [Tooling](./tooling.md) entry.
