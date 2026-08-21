# DSHX

DSHX is a build-time development toolkit for out-of-tree DeepSeek Harness plugins.

Development currently targets DSH `0.1.0-rc.8`. The implemented foundation includes the Host and Client compilers, read-only project configuration resolution, strict package/patch manifest checking, idempotent Profile linking through the official DSH CLI, and the internal development process orchestrator.

```bash
pnpm install
pnpm check
```

The public packages are `dshx` (the compiler, runtime helpers, and CLI) and `create-dshx` (the project initializer). Start a new Full plugin with the project-book workflow:

```bash
pnpm create dshx demo
cd demo
pnpm dev
```

The initializer refuses to overwrite an existing directory, generates a Host Tool and a Client Slot, and asks before installing dependencies in an interactive terminal. For scripts and CI, pass the project name plus `--yes`; `--install` and `--no-install` explicitly control dependency installation, and `--package-manager pnpm|yarn|npm` overrides detection. It detects pnpm, yarn, or npm from an existing lockfile, `packageManager`, and finally the available PATH commands. The generated project pins DSH to `0.1.0-rc.8` and uses the matching published `dshx` version.

The package exposes four user commands. `dshx build` validates the manifest and builds enabled Host/Client faces without touching DSH or project metadata. `dshx check` performs the same read-only manifest checks plus DSH version and Profile-link inspection; use `--json` for automation. DSHX prefers the project-local `pnpm exec dsh`, then falls back to the official `dsh` on PATH, so plugin developers can debug against an existing user installation without adding DSH to every plugin manifest. `dshx dev` ensures the project is linked through the selected DSH CLI, starts the coordinated watchers, and launches DSH only after the enabled faces build successfully. Web sessions pass `--no-open` by default; use `dshx dev --open` to opt in to browser handoff. In an interactive terminal, `r` restarts DSH and `q` closes the session.

While an official rc.8 composition is already running with a Runtime Inspect Provider, use `dshx inspect slots` or `dshx inspect tools` to read its live Slot and Tool summaries. `--json` produces a machine-readable result and `--verbose` includes the original provider cause. Inspect is strictly read-only: it does not start DSH, add/remove Profile links, write a catalog, or generate TypeScript. rc.8's providers are internal runtime services and do not expose a supported external endpoint to this CLI yet; when no provider is injected by a compatibility adapter, DSHX returns `DSHX3201` instead of fabricating offline data. `defineSlot()` TypeScript completion still comes from the provider's official declaration merging, not from Inspect.

Projects can import `defineConfig` and `resolveDshxConfig` from `dshx/config`. Resolution finds the nearest `package.json`, loads only a root `dshx.config.ts`, and applies explicit fields before the `src/host.ts` / `src/client.tsx` conventions and defaults. The package ID always remains `package.json.name`; an optional config `name` is a separate logical Host name.

Plugin projects should declare the DSH host as a development dependency so `pnpm exec dshx dev` is immediately reproducible:

```json
{
  "devDependencies": {
    "@deepseek-ai/dsh": "0.1.0-rc.8"
  }
}
```

`@deepseek-ai/dsh` stays out of the published runtime dependency graph. DSHX also accepts an official `dsh` already available on PATH when the plugin does not carry a local host dependency.

Manifest checking reports all errors and publishing warnings without rewriting `package.json`, `dshx.config.ts`, or `cordis.patch.yml`. Enabled source faces require their rc.8 exports and DSH metadata. Host-only projects omit Client metadata; Client-only projects retain the root Host export for the generated no-op Host artifact.

Profile orchestration resolves `dsh` from the project first and falls back to the official PATH command when no project-local CLI exists. It inspects and changes Profile state only through `dsh plugin`, skips an existing link to the same real project path, and rejects package-name or path conflicts before installation. Unsupported DSH versions fail by default; `compatibility.allowUnsupported` continues with the rc.8 adapter and a persistent warning.

The internal development session keeps Host and Client watchers alive when their first build fails. DSH starts only after every enabled source face has built successfully at least once, using the project root, resolved Profile, and the executable selected during version detection; Web sessions add `--no-open` by default. Client rebuilds rely on rc.8 native HMR. Host rebuilds either mark `hostRestartRequired` for the default manual policy or serialize an automatic DSH restart when `dev.hostRestart` is `auto`.

An unexpected DSH exit is reported as failed and is not put into an automatic restart loop. `restart()` performs one explicit stop/start without changing the Profile link. `close()` is idempotent, closes both watchers first, then sends SIGTERM to DSH and escalates to SIGKILL after a bounded timeout. The CLI maps TTY `r` to `restart()` and `q`/Ctrl-C to `close()`; non-TTY sessions respond only to process signals.

Host projects can import `defineHost` and the official rc.8 `defineTool` from `dshx/host` and default-export a definition with `inject`, tools, and direct `setup(ctx)` access to the official Cordis Context. `defineTool` is the exact official function, not a DSHX wrapper; schemas, execution validation, output rendering, and tool lifecycle remain owned by DSH. `defineHost()` preserves the original object; the Host compiler supplies the resolved logical name, merges the `tools` dependency when needed, registers tools through `ctx.tools.register()`, and runs setup afterward. The Host helper and thin adapter are inlined into `dist/index.js`, while `@deepseek-ai/dsh-tools` remains a bare external resolved by DSH.

Client projects can import `defineClient` from `dshx/client` and default-export a definition with an optional logical `name`, ordered service `inject`, and `setup(ctx)`. The setup receives the official Cordis Context; DSHX only deduplicates the declared dependencies and adapts the definition to rc.8's native `{ name, inject, apply, Config }` module shape. Existing native named Client exports remain supported. The Client helper and adapter are inlined into `dist/client.js`, so the built lazy-CJS module has no `dshx/client` runtime import.

Client definitions may now include `slots: [defineSlot(...)]`. `defineSlot()` uses the official rc.8 `SlotMap` declaration merging and registration types, while the adapter calls `ctx.slots.inject()` and `ctx.slots.register()` in declaration order. A non-empty Slot list adds the Cordis `slots` dependency automatically; registration disposal remains owned by the official Fiber. Add a type-only import from the Slot provider's `/client` export when its SlotMap augmentation is needed. Inspect reads the live runtime composition for discovery, but does not replace these compile-time types.

Existing native Host modules with named `name`, `inject`, `Config`, and `apply` exports remain supported. The Host stage does not add Tool shortcuts, Tool View helpers, a custom Tool schema DSL, infer service dependencies from `setup(ctx)`, or add Host config-schema shortcuts.

The real DSH browser/HMR smoke test remains a release gate. Unit or simulated loader tests do not count as that verification.

The repository's generated-package smoke tests use local build artifacts until `dshx` and `create-dshx` are published to npm. A registry install of a generated project therefore requires the corresponding public `dshx` version to have been released first.
