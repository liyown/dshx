# DSHX

DSHX is a build-time development toolkit for out-of-tree DeepSeek Harness plugins.

The first public release, `0.1.0`, targets the DSH `0.1` protocol generation. `0.1.0-rc.8` and `0.1.1-rc.2` are verified against the Phase A fixture; later compatible `0.1.x` versions are accepted with an explicit compatibility warning until smoke-tested. The implemented foundation includes the Host and Client compilers, read-only project configuration resolution, strict package/patch manifest checking, idempotent Profile linking through the official DSH CLI, and the internal development process orchestrator.

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

The initializer refuses to overwrite an existing directory, generates a Host Tool and a Client Slot, and asks before installing dependencies in an interactive terminal. For scripts and CI, pass the project name plus `--yes`; `--install` and `--no-install` explicitly control dependency installation, and `--package-manager pnpm|yarn|npm` overrides detection. It detects pnpm, yarn, or npm from an existing lockfile, `packageManager`, and finally the available PATH commands. The generated project declares the compatible DSH `0.1` range and uses the matching published `dshx` version; the lockfile selects the concrete installed version.

The package exposes five user commands. `dshx build` validates the manifest and builds enabled Host/Client faces without touching DSH or project metadata. `dshx check` performs the same read-only manifest checks plus DSH version, Profile-link, adapter-approved runtime plugin, and Host Inspect Bridge status inspection; `dshx check --fix` can apply only deterministic manifest metadata repairs, while `--dry-run` previews them. Use `--json` for automation. DSHX prefers the project-local `pnpm exec dsh`, then falls back to the official `dsh` on PATH, so plugin developers can debug against an existing user installation without adding DSH to every plugin manifest. `dshx dev` ensures the project is linked through the selected DSH CLI, starts the coordinated watchers, and launches DSH only after the enabled faces build successfully. Web sessions pass `--no-open` by default; use `dshx dev --open` to opt in to browser handoff. In an interactive terminal, `r` restarts DSH and `q` closes the session.

While an official DSH composition and its browser Client are already running, use `dshx inspect slots`, `dshx inspect tools`, `dshx inspect services`, or `dshx inspect events` to read live composition summaries. `dshx inspect slots --root <slot-name>` performs the second exact-contract query needed before scaffolding. `--json` produces a machine-readable result and `--verbose` includes the original provider cause. Inspect is strictly read-only: it does not start DSH, add/remove Profile links, write a catalog, or generate TypeScript. The selected compatibility adapter loads the allowlisted official Cordis child plugins inside the current Host and the dshx Host artifact exposes a local Inspect Bridge when `DSHX_INSPECT_BRIDGE=1` is set (this is enabled by `dshx dev`). The bridge is a per-user Unix socket with a short-lived token and exposes only the official composition-scoped Service/Event catalogs and the Client `Slots.listSubTree` provider. Without a running bridge, browser Client, synchronized Client provider, or official provider, Inspect returns `DSHX3201/DSHX3202/DSHX3205` rather than fabricating offline data. Slot tree discovery and exact contract lookup are separate runtime queries. `defineSlot()` TypeScript completion still comes from the provider's official declaration merging, not from Inspect.

When a supported Runtime Inspect Provider reports a Slot, `dshx add ui --slot <name>` can generate a typed TSX contribution and attach it to the existing `defineClient({ slots })` entry. The generator first reads the compact Slot tree, then performs an exact `listSubTree({ root })` query; only `list` and `single` contracts with stable registration metadata are generated. Keyed/chain/select contracts and incomplete provider metadata return `DSHX6110`/`DSHX6111` without writing files. In a TTY, `dshx add ui` presents the inspected Slot list; non-TTY scripts must pass `--slot`. The provider package must already be installed in the plugin project because the generator writes its `/client` type-only import but never runs a package manager. `--dry-run` prints the planned files without writing them, and repeated generation of the same Slot is idempotent. Host-only projects receive a Client entry, `./client` export, and `dsh.client` metadata through this explicit command. Native named Client modules, missing providers, and unavailable Client/browser Inspect seams are reported without changing files. `add ui` does not link Profiles, start DSH, write a catalog, or implement `add hook` or `check --fix`.

Use `dshx add tool --name <name>` to scaffold an official Host Tool. The generated file uses `defineTool()` with no parameters and a string output so it is immediately type-safe without guessing a complex schema; edit the file afterward to add official parameter, output, timeout, concurrency, or presentation fields. The command attaches the Tool to a DSHX `defineHost({ tools })` default export, creates the conventional Host entry when no Host file exists, and refuses to rewrite native named Hosts or an explicitly disabled Host. It is transactional, supports `--dry-run`/`--json`, never installs dependencies or changes Profiles, and treats repeated Tool names as idempotent warnings.

Use `dshx add hook --event <name>` to scaffold a native Cordis event listener. The generated `src/hooks/<event>.ts` exports `registerHook(ctx)` and calls `ctx.on(<event>, ...)`; the Host `defineHost` setup is minimally extended to invoke it. DSHX does not invent an event naming DSL, infer listener parameters, inspect or start DSH, install dependencies, or change Profile links. Existing native named Hosts and unsafe setup shapes are rejected with a repair hint, and repeated event registrations are idempotent warnings. `--dry-run` and `--json` are available for scripts; non-TTY callers must provide `--event`.

Projects can import `defineConfig` and `resolveDshxConfig` from `dshx/config`. Resolution finds the nearest `package.json`, loads only a root `dshx.config.ts`, and applies explicit fields before the `src/host.ts` / `src/client.tsx` conventions and defaults. The package ID always remains `package.json.name`; an optional config `name` is a separate logical Host name.

Plugin projects should declare the DSH host and the adapter-approved optional Host child plugins as development dependencies so `pnpm exec dshx dev` is immediately reproducible:

```json
{
  "devDependencies": {
    "@deepseek-ai/dsh": ">=0.1.0-rc.8 <0.2.0",
    "@deepseek-ai/dsh-cordis-host-runner": ">=0.1.0-rc.8 <0.2.0",
    "@deepseek-ai/dsh-tool-cordis": ">=0.1.0-rc.8 <0.2.0"
  }
}
```

`@deepseek-ai/dsh` stays out of the published runtime dependency graph. DSHX also accepts an official `dsh` already available on PATH when the plugin does not carry a local host dependency.

Manifest checking reports all errors and publishing warnings without rewriting `package.json`, `dshx.config.ts`, or `cordis.patch.yml`. Enabled source faces require exports and DSH metadata for the selected compatibility adapter. Host-only projects omit Client metadata; Client-only projects retain the root Host export for the generated no-op Host artifact. `dshx check --fix` applies only missing, adapter-derived manifest fields; `--dry-run` previews the diff and `--json` returns a machine-readable repair summary. It never modifies source files, dependencies, Profile links, patch contents, or ambiguous existing values. After a write, DSHX re-resolves the project and reruns the Manifest Checker; any new Manifest error restores the original files.

Profile orchestration resolves `dsh` from the project first and falls back to the official PATH command when no project-local CLI exists. It selects a protocol adapter from the detected version, inspects and changes Profile state only through `dsh plugin`, skips an existing link to the same real project path, and rejects package-name or path conflicts before installation. Verified versions run normally; unverified versions inside the adapter range continue with a warning. Versions outside every supported range fail by default; `compatibility.allowUnsupported` continues with the last adapter and a persistent risk warning.

The internal development session keeps Host and Client watchers alive when their first build fails. DSH starts only after every enabled source face has built successfully at least once, using the project root, resolved Profile, selected compatibility adapter, and executable selected during version detection; Web sessions add `--no-open` by default. Client rebuilds rely on the selected DSH generation's native HMR. Host rebuilds either mark `hostRestartRequired` for the default manual policy or serialize an automatic DSH restart when `dev.hostRestart` is `auto`.

An unexpected DSH exit is reported as failed and is not put into an automatic restart loop. `restart()` performs one explicit stop/start without changing the Profile link. `close()` is idempotent, closes both watchers first, then sends SIGTERM to DSH and escalates to SIGKILL after a bounded timeout. The CLI maps TTY `r` to `restart()` and `q`/Ctrl-C to `close()`; non-TTY sessions respond only to process signals.

Host projects can import `defineHost` and the official `defineTool` for the selected DSH generation from `dshx/host` and default-export a definition with `inject`, tools, and direct `setup(ctx)` access to the official Cordis Context. `defineTool` is the exact official function, not a DSHX wrapper; schemas, execution validation, output rendering, and tool lifecycle remain owned by DSH. `defineHost()` preserves the original object; the Host compiler supplies the resolved logical name, merges the `tools` dependency when needed, registers tools through `ctx.tools.register()`, and runs setup afterward. The Host helper and thin adapter are inlined into `dist/index.js`, while `@deepseek-ai/dsh-tools` remains a bare external resolved by DSH.

Client projects can import `defineClient` from `dshx/client` and default-export a definition with an optional logical `name`, ordered service `inject`, and `setup(ctx)`. The setup receives the official Cordis Context; DSHX only deduplicates the declared dependencies and adapts the definition to the selected DSH generation's native `{ name, inject, apply, Config }` module shape. Existing native named Client exports remain supported. The Client helper and adapter are inlined into `dist/client.js`, so the built lazy-CJS module has no `dshx/client` runtime import.

Client definitions may now include `slots: [defineSlot(...)]`. `defineSlot()` uses the selected DSH generation's official `SlotMap` declaration merging and registration types, while the adapter calls `ctx.slots.inject()` and `ctx.slots.register()` in declaration order. A non-empty Slot list adds the Cordis `slots` dependency automatically; registration disposal remains owned by the official Fiber. Add a type-only import from the matching Slot provider's `/client` export when its SlotMap augmentation is needed. Inspect reads the live runtime composition for discovery, but does not replace these compile-time types.

Existing native Host modules with named `name`, `inject`, `Config`, and `apply` exports remain supported. The Host stage does not add Tool shortcuts, Tool View helpers, a custom Tool schema DSL, infer service dependencies from `setup(ctx)`, or add Host config-schema shortcuts.

The real DSH browser/HMR smoke test remains a release gate. Unit or simulated loader tests do not count as that verification.

For a full rc.2 cold-start matrix, run `pnpm run smoke:rc2`. It creates Full, Host-only, Client-only, and native Host projects in a temporary root, installs the published `0.1.1-rc.2` DSH packages plus a local dshx tarball, builds each project, exercises Profile linking, runtime Inspect, scaffold idempotency, Client HMR, Host restart, and cleanup, then removes the temporary root. Set `DSHX_KEEP_SMOKE=1` only when preserving a failed run for diagnosis is necessary.

The repository's generated-package smoke tests use local build artifacts until `dshx` and `create-dshx` are published to npm. A registry install of a generated project therefore requires the corresponding public `dshx` version to have been released first.
