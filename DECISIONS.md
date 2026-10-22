# Architecture Decisions

## 2026-08-21: Phase A starts at the client artifact boundary

DSHX will not implement `defineHost`, `defineClient`, `defineSlot`, the CLI, or scaffolding until a real DSH `0.1.0-rc.8` instance loads and hot-reloads the Phase A fixture.

The first implementation uses Vite's programmatic build API with its Rolldown output pipeline. The client is emitted as CJS and wrapped with native output `banner`, `intro`, and `footer` hooks so the generated sourcemap includes the lazy-factory wrapper. CSS Modules and global CSS are compiled into virtual JavaScript modules with Lightning CSS, keeping stylesheet injection inside the lazy factory and avoiding standalone CSS assets.

Host and Client artifacts share `dist/`. The Client compiler overwrites only `client.js` and `client.js.map`; it never empties the output directory, matching the rc.8 preset's `clean: false` behavior.

## 2026-08-21: The rc.8 module graph uses `dsh.client.external`

DeepSeek Harness commit `141eb6fef8` is tagged `dsh-v0.1.0-rc.8` and is the compatibility source of truth.

In this version, the implicit baseline is the union of `PLATFORM_MODULES` and `PRELOADED_CLIENT_EXTERNALS`. Additional synchronous module-table requests come from the exact specifiers in `dsh.client.external`. The similarly named `dsh.client.inject` field records informational package dependency edges and does not control module materialization or Cordis activation.

## 2026-08-21: Build does not mutate project metadata

`dshx build` will compile and validate. Creation, scaffold, and explicit fix commands may modify `package.json` or `cordis.patch.yml`; an ordinary build will not. This resolves the PRD's ambiguous "generate / validate" wording in favor of its explicit metadata-mutation constraint.

## Phase A verification status

- Client wrapper, externals, CSS injection, single-file output, and sourcemap presence: covered by local integration tests.
- Real DSH `dsh-v0.1.0-rc.8` smoke: passed against commit `141eb6fef8` with an isolated `DSH_HOME`.
- Official plugin installation and composition: `dsh plugin --profile web add` installed the linked fixture and `--dump-config` included `dshx-phase-a`.
- Browser loader and Slot rendering: the fixture materialized through the lazy module table and rendered `DSHX Phase A` in `sidebar.footer.action`.
- Shared React identity: a temporary `useState` probe updated in place without an invalid-hook error; the emitted bundle imports React only through the rc.8 platform table.
- CSS ownership: exactly one stable `data-plugin` / `data-plugin-css` tag was present for the fixture.
- Watch and HMR: a TSX/CSS edit changed the bundle hash, `/plugins/events` emitted `rebuilt`, the Slot fiber remounted, and the stale owned style was removed before the replacement was installed.
- Browser sourcemap: the probe stack's generated `client.js:31:12` location mapped to `../src/client.tsx:28:14`, and the same-origin `.map` endpoint returned the emitted map.

## 2026-08-21: v0.1 starts with a standalone Host compiler

The next implementation step is the low-level Host artifact boundary, before exposing `defineHost` or tool shortcuts. `buildHost()` emits one Node ESM `dist/index.js` plus sourcemap, leaves Node builtins and bare package imports external, preserves shared Client artifacts, and supports a complete initial build before watch mode. Client-only packages use the same compiler with a virtual no-op Host entry so the official DSH package loader always sees the standard Host export.

The rc.8 Host smoke loaded the linked Phase A fixture through the isolated Web profile after switching its package root export from the old fixture-only `dist/host.js` to `dist/index.js`. The page had no loader errors and retained the existing Client Slot contribution.

## 2026-08-21: Project metadata has one read-only resolution path

`resolveDshxConfig()` searches upward for the nearest `package.json` and loads only `dshx.config.ts` at that package root through Vite's bundled config loader. Precedence is explicit config, conventional `src/host.ts` and `src/client.tsx` entries, `package.json.name`, then normalized defaults. `host: false` and `client: false` disable a source face, but at least one face must remain. Explicit entries are real-pathed, must exist, and cannot leave the project root.

The resolved package ID always comes from `package.json.name`; `config.name` is a distinct logical name for a later Host adapter. Config dependencies, absolute entries, the original manifest, `<root>/dist`, and all defaulted options are retained so later build, dev, and check flows consume the same project description.

## 2026-08-21: Manifest checks are strict for enabled runtime faces

The checker collects stable `DSHX4xxx` diagnostics in one read-only pass. Core package exports, bundle patch metadata, and a top-level YAML array are mandatory for every project. Client exports and `dsh.client` fields are mandatory only when Client source is enabled; stale Client metadata on a Host-only package is rejected. Client-only source still requires the root Host export because DSHX emits a no-op Host artifact.

String exports and one-level conditional exports with a string `default` match the rc.8 loader. Client arrays reject empty, whitespace-padded, duplicate, self, platform-baseline, and preloaded-baseline module requests. `main` and `files` remain publishing warnings so local profile links are not blocked by packaging advice.

This stage does not inspect an installed DSH version, repair manifests, validate built artifact contents, query online Slots, or infer hard dependencies from source. Those behaviors remain assigned to the profile orchestrator, future `dshx check --fix`, build/check, and inspect stages respectively.

## 2026-08-21: Profile orchestration prefers local DSH and supports PATH fallback

DSHX resolves DSH through the project-local `pnpm exec dsh` first. If the local command is genuinely absent, it falls back to the official `dsh` found on PATH. The selected executable is retained from version detection through Profile commands and the Dev child process, so a plugin can debug against an existing user installation without mutating a global package installation. The selected protocol adapter reports verified, compatible, experimental, or unsupported status; unsupported versions fail with `DSHX5101` unless `compatibility.allowUnsupported` is enabled, in which case DSHX keeps the last adapter and returns the same code as a warning.

The recommended plugin template declares `@deepseek-ai/dsh` in `devDependencies`. This gives each plugin a reproducible host for local debugging without adding DSH to published runtime dependencies or changing the user's global installation. PATH fallback remains a compatibility convenience for existing installations.

Profile state comes from `dsh plugin --profile <name> list --depth 0 --json`. DSHX compares both package ID and real package path, skips an exact existing link, and rejects name/path conflicts before any add. An absent project is installed only through `dsh plugin --profile <name> add <absolute-root>` and must appear in a second official inspection before orchestration succeeds. DSHX never reads or writes the profile manifest directly and does not remove links when a dev process exits.

The Profile API remains internal; the user-facing CLI consumes it without exposing direct Profile mutation methods. It does not validate the Node engine or expose unlink behavior.

## 2026-08-21: Dev sessions gate DSH on successful watch builds

`startDevSession()` composes the resolved project, Profile Orchestrator, Host/Client watcher factories, and one DSH child using the executable selected during version detection. Watch mode starts without requiring a successful one-shot build, so an initial compiler error leaves the watcher active and the face in `error`; a later valid source change can recover it to `ok`. DSH starts only after every enabled face has produced a successful bundle at least once. A failed or unexpectedly exited DSH process is not started again by later build events and requires an explicit `restart()`.

Client rebuilds leave DSH running and rely exclusively on the selected adapter's native HMR. A Host rebuild under the default `auto` policy serializes stop/start operations so only one DSH child is active; the explicit `manual` policy instead sets `hostRestartRequired` until the user requests a restart. Raw Web sessions receive `--no-open` unless the caller supplies an open policy; the generated create-dshx package-manager script opts into `dshx dev --open` so a new project opens the browser by default. The process inherits the environment, uses the project root as cwd, and runs through the selected local or PATH DSH executable with `--profile <profile>`.

Session shutdown first closes enabled watchers, then sends SIGTERM to DSH and escalates to SIGKILL after a bounded timeout. Shutdown is idempotent, waits for an in-flight restart, ignores late watcher/child events, and never removes the Profile link. `DSHX4401` through `DSHX4406` cover spawn, exit, signal, restart, watcher lifecycle, and build failures while retaining the original compiler error or inherited DSH stderr for diagnosis.

This remains a process-control API rather than a user command. It does not own stdin, TTY/raw mode, `r`/`q` keys, automatic restart backoff, unlink, Node engine checks, or artifact inspection; those responsibilities stay with later CLI and check stages.

## 2026-08-21: create-dshx generates the first runnable Full project

`create-dshx` is a separate public package so `pnpm create dshx <name>` follows pnpm's standard create-package resolution. The compiler package is published as `@becomeopc/dshx` because npm rejects the unscoped `dshx` name as too similar to existing packages; it keeps the compiler, runtime helpers, and `dshx build/check/dev` bin. The two packages use the same release version; generated manifests never contain `workspace:*` and receive the matching `@becomeopc/dshx` version.

The first initializer only emits a Full Host + Client project. It uses a small, checked template containing `defineHost`/official `defineTool`, `defineClient`/`defineSlot`, the sidebar provider declaration import, the required exports, DSH metadata, and a minimal bundle patch. Project names are non-scoped npm names and are used as both the target directory and package ID. Existing target directories are never overwritten.

Dependency installation is optional in generation-only mode and defaults to yes in the interactive wizard. Package-manager discovery follows target lockfile, `packageManager`, then PATH (`pnpm`, `yarn`, `npm`). Installation uses an argument-array command runner with the generated project as cwd; failures leave the generated files in place and report `DSHX6004`. Generation conflicts and invalid names use `DSHX6001`/`DSHX6002`, while write and discovery failures use `DSHX6003`/`DSHX6005`.

The initializer also has a deterministic non-interactive contract: a project name is required, `--yes` disables prompts, `--install`/`--no-install` explicitly choose installation, and `--package-manager` can override discovery. Missing names and invalid option combinations return usage code `2` without reading stdin.

The initializer does not implement Host-only/Client-only templates, `check --fix`, unlink, Slot catalog/cache, or Tool View. Runtime `inspect` and `add ui` are separate commands in `dshx`; registry smoke tests require the public `dshx` version to be released, while local tarball tests cover the generated project before publication.

## 2026-08-21: defineHost is an identity API over the official Host model

`@becomeopc/dshx/host` exposes an identity-preserving `defineHost()` whose `setup` receives the official Cordis `Context` and whose `tools` accept the rc.8 `ToolDefinition` directly. DSHX does not introduce parallel Context, Tool, registry, or disposer types. The official Cordis and tools packages are peer dependencies used for public typing; re-exporting the official `defineTool` remains a separate next-stage decision.

The Host compiler now builds through a virtual entry. A default export is normalized as a Host definition; a module without a default export retains its native `name`, `inject`, `Config`, and `apply` contract. Definition names override the resolved logical project name, which in turn falls back to the package ID. Client-only projects keep a named no-op Host entry.

User inject entries keep first-occurrence order. A non-empty `tools` list appends the `tools` service only when it is absent, then `apply()` registers every Tool in declaration order before calling `setup(ctx)`. Tool definitions and duplicate names are passed unchanged to the official registry, and returned disposers are not captured because Cordis already binds registration effects to the calling Fiber.

The public identity helper and internal adapter are bundled into `dist/index.js`; only user and platform bare imports remain external. This keeps DSHX a build-time dependency while allowing stable `DSHX2001`/`DSHX2002` runtime diagnostics for malformed JavaScript definitions. Config schemas, prompt/command shortcuts, service-access inference, Client helpers, Tool View helpers, custom Tool schema DSLs, and user-facing CLI commands remain out of scope for this stage.

## 2026-08-21: defineTool is the official rc.8 helper

`@becomeopc/dshx/host` re-exports the exact `@deepseek-ai/dsh-tools` `defineTool` function. DSHX does not copy `ToolDefinition`, `DefineToolOptions`, schema inference, validation, output rendering, timeout policy, presentation, or registry lifecycle. A Host definition registers those official values through `ctx.tools.register()` in declaration order; Cordis owns registration disposal.

The Host virtual module exposes an inlined identity `defineHost` and forwards `defineTool` to the bare `@deepseek-ai/dsh-tools` external. Built Host artifacts therefore contain no `@becomeopc/dshx/host` or DSHX runtime import and use the DSH-provided official Tool module at load time. Tool View, custom Tool shortcuts, and the user-facing CLI remain later stages.

## 2026-08-21: defineClient is a thin official Client adapter

`@becomeopc/dshx/client` exposes an identity-preserving `defineClient()` with `name`, ordered `inject`, `slots`, and `setup(ctx)`. The `Context` type is imported directly from official Cordis; DSHX does not create a private Client context, service container, slot registry, or disposer list. Slot contributions are created by the official-type-driven `defineSlot()` helper and use one authoritative registration path through the rc.8 Slot service.

The Client compiler uses a virtual entry just like the Host compiler. A default export is validated and normalized to `{ name, inject, apply }`; a module without a default export keeps native `name`, `inject`, `Config`, and `apply` exports. Definition name overrides the resolved logical project name, then the package ID. Inject entries keep first-occurrence order and are deduplicated. Malformed default definitions use `DSHX2101`/`DSHX2102` with the source file and a repair hint.

The identity helper and adapter are bundled into the lazy-CJS Client artifact. Built output must not import `@becomeopc/dshx/client` or DSHX internal runtime code; official Cordis/DSH modules remain governed by the existing Client external policy. Client setup lifecycle remains owned by the official Cordis runtime, and native Client compatibility is retained while the public helper is adopted.

## 2026-08-21: defineSlot delegates to the official Slot registry

`defineSlot()` is a thin identity-style contribution helper over `@deepseek-ai/dsh-client-ui-slots`. Its `SlotMap`, `PropsRuntime`, component, kind, inject, store, and declaration types are the rc.8 source of truth; DSHX does not reproduce a Slot map or registry. Provider packages must be brought into the TypeScript graph with an explicit type-only `/client` import so their declaration merging narrows the Slot key and props types.

`defineClient({ slots })` appends the `slots` Cordis dependency when the list is non-empty, preserves first-occurrence order, and registers each contribution through `ctx.slots.inject(name, () => ctx.slots.register(options, component))` before `setup(ctx)`. DSHX keeps no disposer list: official Slot service and Cordis Fiber own registration lifetime and duplicate/undeclared-slot failures. Invalid contribution shapes use `DSHX2201`/`DSHX2202`; runtime registry semantics are not wrapped or silently changed.

## 2026-08-21: the user CLI is a thin orchestration layer

`dshx build`, `dshx check`, and `dshx dev` consume the existing resolved-project, compiler, Profile, and Dev Session APIs instead of introducing a second project model. `build` is local and read-only; it validates the manifest then builds enabled faces in parallel. `check` is read-only, inspects the local DSH version and Profile link, and reports an absent link as `DSHX4305` without adding it. Only `dev` calls `ensureProjectProfile()`.

The CLI keeps the command grammar intentionally small (`--cwd`, `--verbose`, `check --json`, `inspect <slots|tools|services|events> --json`, and `dev --open`). Interactive input is limited to `r` for `restart()` and `q`/Ctrl-C for `close()`; non-TTY execution never enables raw mode. Session shutdown always restores terminal state and closes watchers and DSH. CLI diagnostics preserve stable codes, file paths, hints, and original causes for verbose output. Scaffold, `check --fix`, unlink, and Tool View remain out of scope.

## 2026-08-22: Inspect is runtime-only and provider-owned

`dshx inspect slots` and `dshx inspect tools` are read-only queries over an already running official DSH Composition. DSHX first resolves the DSH version and checks the Profile link, then calls an injected compatibility `InspectProvider`; it never starts a temporary DSH, invokes `dsh plugin add/remove`, reads a Profile manifest, writes `.dshx/cache/catalog.json`, or invents offline data. The result is a small presentation DTO with `source: "runtime"`; fields unknown to DSHX are retained under `metadata`.

rc.8 exposes `cordis_inspect_list`/`cordis_inspect_query` and Host/Client inspect registries inside the Composition. Because the registry lives in the Composition process, DSHX does not import it across a process boundary or invent a private RPC. The dshx Host artifact loads the adapter allowlist through official `ctx.plugin()`, then exposes a Host-owned `0600` Unix socket and metadata file under `$DSH_HOME/runtime/dshx/inspect`, authenticated by a random token and checked against package identity, project root, and owning pid. `dshx dev` sets `DSHX_INSPECT_BRIDGE=1` for its child; manual DSH launches can set the same environment variable. The bridge accepts only versioned, bounded, newline-delimited read-only list requests and only forwards composition-scoped `Service.listService` and `Event.listEvents` through an ephemeral Agent; Agent-scoped Tool queries stay inside the official runtime Tool. Provider connection failures, malformed DTOs, unsupported targets, stale endpoints, and absent Profile links use `DSHX3202` through `DSHX3205`; the original cause is retained for `--verbose`. Inspect does not generate TypeScript or provide Slot type completion: `defineSlot()` remains governed by official provider declaration merging. The next `dshx add ui` stage may consume this runtime result to generate source.

## 2026-08-22: DSH compatibility follows protocol generations

DSHX follows the standard plugin-tooling model of peer dependency ranges plus compatibility testing. The first adapter is named `protocol-1` after its observable contract, not after DSH semver. It currently publishes `>=0.1.0-rc.8 <0.2.0-0 || 0.1.1-rc.2`; the explicit rc.2 arm is the npm-safe spelling required to cover that verified cross-patch prerelease. `0.1.0-rc.8` and `0.1.1-rc.2` are verified through isolated Host/Client, Profile, child-plugin, Agent-backed Inspect, and Bridge smoke tests. Other stable versions in the range remain `compatible` warnings until smoke-tested, while unverified prereleases are `experimental`. A future DSH minor reuses `protocol-1` when these seams remain intact and creates a new adapter only when adaptation is actually required.

The plugin's `peerDependencies["@deepseek-ai/dsh"]` is its public support declaration; `devDependencies` installs one concrete DSH for local work. The project-local installation is the build and development source of truth. `dshx build` reads its package version without starting DSH, then falls back to the peer range or default adapter when no local package is available. `dshx dev`, `check`, and `inspect` use the version actually returned by the selected DSH executable. The selected adapter is carried through Manifest, Client compiler, Profile, Dev Session, and Inspect operations. Plugin, DSH, and DSHX versions remain independent.

Adapter ranges must not overlap. A new DSH patch/minor that preserves Profile, Manifest, Host loader, Client loader, Tool/Command/Slot, Connection, Inspect, restart, reconnect, and HMR contracts stays on the existing adapter; the real-smoke latest boundary moves only after the generic scenario passes. A breaking seam creates a new adapter, matching official peer dependency ranges, fixture, and compatibility release notes. One DSHX release may contain multiple adapters, but one built artifact targets one generation by default. `compatibility.allowUnsupported` remains a temporary debugging override, not the normal upgrade path.

## 2026-08-22: `add ui` is an explicit, transactional Slot scaffold

`dshx add ui` consumes the runtime Slot summaries returned by the selected Inspect Provider. It never starts DSH, changes Profile links, installs dependencies, or fabricates an offline Catalog. In a TTY it lets the user choose an inspected Slot; automation must pass `--slot`. The provider package must already resolve from the project root, and the generated contribution adds a type-only `${provider}/client` import so official SlotMap declaration merging remains the TypeScript source of truth.

The generator writes a new `src/slots/<slot>.tsx` component and minimally edits a DSHX `defineClient({ slots })` default export. Host-only packages receive a standard Client entry, `./client` export, and adapter-selected `dsh.client` metadata. Native named Client modules are intentionally not rewritten. All edits are preflighted, applied through temporary files, and rolled back if writing or post-generation Manifest checking fails; existing files are never overwritten. `--dry-run` returns the planned diff, and a repeated Slot contribution produces a warning without duplicate registration.

This stage uses TypeScript AST positions for safe edits but does not introduce a DSHX Slot DSL, duplicate official Slot types, Catalog caching, `add tool`, `add hook`, or `check --fix`. The stable generator diagnostics occupy `DSHX6101` through `DSHX6109`.

## 2026-08-22: Client Slot Inspect is progressive and contract-gated

The Client Slot seam is the official `Slots.listSubTree` provider exposed by the running browser Composition. `dshx inspect slots` first reads the compact purpose/topology tree; `dshx inspect slots --root <name>` performs a second query for the selected Slot's exact catalog, registration fields, props metadata, occupants, and replacement risk. DSHX normalizes these JSON-compatible results without copying the official Slot types or inventing a static catalog. A missing browser, Client runner, synchronized provider, or bridge remains an explicit runtime diagnostic rather than an empty successful result.

`dshx add ui` consumes both queries. It emits the official `PropsRuntime<...>` type and a type-only provider `/client` import, but only generates registration fields whose kind and defaults are unambiguous: list Slots receive `id` and `order`, while single Slots receive no list-only fields. Keyed, chain, select, unknown-required, or incomplete contracts return `DSHX6110`/`DSHX6111` before any file is written. Manifest failure still rolls back the complete transaction, and repeated contributions remain idempotent. Client Tool Inspect, offline Catalog fallback, Catalog cache, and `check --fix` remain out of scope.

The isolated Phase A smoke was run against both the existing `0.1.0-rc.8` fixture and a temporary `0.1.1-rc.2` install. Both versions returned live Slot trees and the exact `sidebar.footer.action` contract through the Host-owned bridge; Services and Events remained runtime-backed. The rc.2 dependency swap was temporary and no fixture manifest or lockfile change is part of this stage.

## 2026-08-22: `add tool` generates the smallest official Tool contract

`dshx add tool --name <name>` is a local source scaffold and does not require Runtime Inspect. Inspect Tool summaries are discovery DTOs and do not contain enough information to safely synthesize arbitrary parameter schemas, so the generated definition deliberately uses `parameters: {}` and a string `output` with the official text renderer. Authors continue editing the resulting `defineTool()` with the full rc.8 API for typed parameters, canonical output, timeout, concurrency, and presentation behavior.

The generator creates `src/tools/<name>.ts` and minimally attaches its exported Tool to a DSHX `defineHost({ tools })` default export using TypeScript AST positions. A missing conventional Host is created; an explicitly disabled Host and native named Host are never silently changed. Existing files and duplicate Tool names are handled idempotently, all writes are atomic, and Manifest errors roll back the complete plan. Tool generation does not install packages, mutate Profile links, start DSH, or write Catalog/cache. Diagnostics use `DSHX6201` through `DSHX6209`.

## 2026-08-22: `add hook` scaffolds native Cordis listeners

`dshx add hook --event <name>` is deliberately a thin source generator over the official Cordis `Context.on()` API. It creates a small `registerHook(ctx)` module with an async-safe listener skeleton and minimally attaches that function to a DSHX `defineHost` setup. DSHX does not maintain an event catalog, infer event names or argument types, or wrap the returned disposer; Cordis Fiber owns listener lifetime.

The command requires an explicit event in non-interactive and JSON modes, accepts an optional in-project `.ts` path, supports dry-run and structured output, and never starts DSH, changes Profile links, installs dependencies, or writes Catalog/cache. A missing conventional Host is created, while explicit `host: false`, native named Hosts, non-block setup expressions, path violations, existing files, and duplicate registrations are handled with stable diagnostics. Generation uses atomic multi-file plans and rolls back on write or Manifest Checker errors; diagnostics occupy `DSHX6301` through `DSHX6308` (with `DSHX6306` as the idempotent duplicate warning).

## 2026-08-22: Services and Events Inspect use the DSHX Host bridge

`dshx inspect services` and `dshx inspect events` use the same read-only runtime Inspect contract as Slots and Tools. Their summaries retain only stable `name`, optional `provider`/`scope`, and opaque `metadata`; DSHX does not copy Cordis Service or Event types and does not infer event payload schemas.

The rc.8 adapter advertises `services` and `events` as bridge-backed targets. The Host artifact loads only `@deepseek-ai/dsh-cordis-host-runner` and `@deepseek-ai/dsh-tool-cordis` through official `ctx.plugin()`, and DSHX connects directly to the Host-owned bridge rather than invoking a DSH Inspect CLI. Bridge Service items use `service.key` as `name` and Event items use `event.name`; provider identity and opaque catalog fields are retained in the presentation DTO metadata. If the child plugin, registry, bridge, or current Composition is unavailable, DSHX returns `DSHX3201`, `DSHX3202`, or `DSHX3205` rather than an empty/fabricated result. Future adapters may add targets only when their official Provider and real fixture smoke are verified.

## 2026-08-22: Runtime plugin and Bridge state is read-only check data

`dshx check --json` reports adapter-approved runtime plugin availability from the project root, then overlays actual `loaded`, `skipped`, or `failed` states from the Host-owned Bridge metadata when a Composition is running. Missing optional child plugins use `DSHX5102` warnings and do not block ordinary Host/Client builds. Bridge state is reported as `disabled`, `running`, `stale`, `invalid`, or `unavailable` with `DSHX5103` warnings where remediation is needed; Bridge metadata exposed in JSON never includes its authentication token.

The check command does not start DSH, create a Profile link, connect to the Bridge, or modify project files. The Host artifact remains tolerant of optional child-plugin failures, while `dshx inspect services/events` continues to return the existing runtime diagnostics when the official registry or Bridge cannot serve a query.

## 2026-08-22: check --fix only applies deterministic manifest repairs

`dshx check --fix` is the first public metadata mutation command. It consumes the existing `createManifestRepairPlan()` result, supports `--dry-run` and `--json`, writes only missing adapter-derived exports and DSH metadata, then re-resolves the project and reruns the Manifest Checker. A post-write Manifest error triggers a complete rollback; Profile links, DSH processes, dependencies, patch contents, source files, and conflicting existing values are never changed. DSH/Profile diagnostics remain visible and still affect the final exit code, but they do not authorize unrelated fixes. Runtime Inspect remains the only live capability discovery path; no offline Catalog fallback is part of this release.

## 2026-08-23: project faces are inferred, not selected modes

DSHX does not impose a Full, Host-only, Client-only, or native project mode. Configuration resolution discovers the Host and Client entries that actually exist, while explicit `host`/`client` paths or `false` values let a project choose either face independently. The compiler preserves native named module contracts and emits the required no-op Host artifact only when the DSH loader needs a root export for a Client-only package. The compatibility matrix uses these combinations as test fixtures only; it is not a user-facing restriction.

Source generators have a narrower safety boundary: `add ui`, `add tool`, and `add hook` only perform automatic AST edits on recognizable DSHX default definitions. They do not reject native modules from build or runtime use; they return a manual-registration diagnostic when a requested scaffold cannot safely rewrite an arbitrary native module.

## 2026-08-24: unary API hardening keeps one unambiguous call shape

Host and Client artifacts now bundle the same `defineApi` implementation used by the public source module instead of a second reduced string implementation. API id, version, and handler validation therefore cannot silently differ after compilation. Standard Schema output transformations are returned across the wire, API channel ownership is withdrawn with the owning Fiber, and `DSHX6401` remains a non-retryable contract error on both sides of the Connection transport.

Every unary client uses `(input, options)`. A no-input call passes `undefined` when it needs options (`api.get(undefined, { signal })`), avoiding an unresolvable runtime ambiguity between an input object and an options object. Pre-aborted requests do not reach Connection. `useApiQuery` aborts its generation-scoped request on disconnect, preserves previous successful data while paused/refetching, and reads again when an enabled query observes the next Host generation. It adds no global cache, dedupe, optimistic state, or business retry.

The rc.2 matrix calls the real generated Host API, rejects a mismatched version, automatically restarts the Host, and confirms the API is registered again. A headed rc.8 browser fixture then observed the initial query, a manual Host restart resetting the rendered request count to `1`, a content-changing Client HMR remount incrementing it to `2`, and an in-flight browser request ending in `net::ERR_ABORTED`; the client reported `ApiError.kind = aborted` while the Host handler's official signal fired. Temporary browser probes were removed after verification. This closes the Stage 1 gate for the current Connection seam.

## 2026-08-24: Command contributions preserve the official registry seam

`defineCommand()` is a typed identity helper over the official `CommandDefinition`; it introduces no DSHX parser, invocation context, result type, registry, or lifecycle. A non-empty `defineHost({ commands })` list adds the official `commands` dependency and registers each definition through `ctx.commands.register()` in declaration order before API and user setup. DSHX intentionally ignores the returned disposer because the official registry binds the effect to the calling Cordis Fiber. Official scope, shadowing, duplicate-name failure, argument parsing, attachment admission, cancellation, lifecycle events, and disposal remain unchanged.

`dshx add command --name <name>` only generates the smallest editable official source object and attaches it to a recognizable DSHX Host. It validates the official lowercase name grammar, supports description/path overrides, dry-run and JSON output, is idempotent, and applies atomic multi-file writes with Manifest-check rollback. It does not inspect the runtime, install dependencies, mutate Profiles, or rewrite native and disabled Hosts. Diagnostics occupy `DSHX6501` through `DSHX6508`.

The rc.2 compatibility matrix creates the Command with the public CLI, builds and links the package, verifies discovery through the official `commands/list` Remote, executes the slash line through the official `commands/execute` parser, then repeats after an automatic Host restart. `session.prompt` is not used as a Command transport: its rc.2 implementation admits ordinary model prompts even though a stale optional Command response slot remains in its schema. This closes the Stage 2 gate for the current DSH 0.1 Command seam.

## 2026-08-25: Prompt contributions preserve the official assembly registry

`definePromptSection()` and `definePromptContext()` retain the exact official contribution object behind an opaque, identity-authenticated contribution because the two official shapes are otherwise indistinguishable. `defineHost({ prompts })` adds the `systemPrompt` dependency once and registers contributions in declaration order through `ctx.systemPrompt.section()` or `.context()` after Tools and Commands and before Settings, APIs, and user setup. DSHX does not own Prompt ordering, variables, complete-section policy, tool-schema providers, assembly, scope layers, shadowing, duplicate detection, or disposers.

The public source helpers and compiled Host artifact use the same implementation. Official packages remain external, and advanced or Agent-scoped behavior continues through direct `setup(ctx)` access. The generated Showcase includes one order-150 Tool guidance section and one request-count runtime context; Starter remains a minimal Tool plus Slot and neither template exposes Prompt editing in the Client.

The generation-parameterized smoke assembles the generated contributions through a real Agent, verifies scoped same-name shadowing without global leakage, disposes the scoped contributions and observes restoration, confirms Tool schemas remain visible, and repeats after Host restart at both verified `protocol-1` boundaries. This closes Stage 3 without adding a Prompt scaffold or a second Prompt runtime.

## 2026-08-25: Settings are one shared contract with one Host owner

`defineSettings()` preserves a portable namespace, official Schemastery schema, applies policy, and optional Client decoder. The Host claims ownership exactly once through `defineHost({ settings })`; advanced `contract.host({ base, validate, setup })` facets remain Host-only. A secret-bearing schema is rejected at Host registration unless it declares a decoder that returns a redacted Client value. Secret traversal is fail-closed to plain object/dict/array paths and rejects unions, intersections, transforms, and unknown containers even with a decoder. DSHX does not own persistence, defaults/base/user layering, revisions, validation, watchers, recovery, duplicate detection, or registered-scope disposal.

The Client does not repeat Settings in `defineClient()`. A retained `useSettings(contract)` call is detected after tree-shaking, adds the `settingsScope` Cordis injection, and requires `@deepseek-ai/dsh-client-ui-settings` in the manifest package edges. `dshx check` provides an earlier local-graph diagnostic, while build/dev remain authoritative. One Client Fiber reuses official bound scopes by contract identity and supplies them through React `useSyncExternalStore`; local mutation state is non-optimistic and never stores submitted secret values.

The generated Runtime Deck owns one `showActivity` live setting and a custom toggle rather than a universal form. The real generation smoke verifies layering, writes, stale revision refusal, validation recovery, secret configured state/redaction, persistence, and clean Host restart at rc.8 and rc.2. No Settings scaffold, raw-document migration layer, draft controller, or optimistic cache is introduced.

## 2026-08-25: Conversation authoring is one component contribution, not a React-owned lifecycle

`defineConversation({ kind, events, initial, reduce, project }).render(Component)` colocates one pure official event-fold lifecycle with its keyed `conversation.chat.node` renderer. `defineClient({ conversations })` registers the definition before the renderer and infers `conversationEvents` plus `slots`; authors no longer maintain a separate node definition and Slot contribution for the same node kind. Hooks are valid only in the renderer. Match, state folding execution, replay, sequence ordering, publication, pagination, location, duplicate handling, and disposal remain owned by the official Client assembler and Cordis Fiber.

Conversation components do not receive an implicit Host action bus. Typed writes compose the existing `defineApi`/`useApi` Connection contract, including its AbortSignal and lifecycle behavior. Retained `useApi` or `useApiQuery` modules declare the Client Connection capability and lazily bind contracts by identity inside the current Client Fiber, so `defineClient` does not repeat API contracts; Client `api/apis` fields are removed. The Host must re-resolve live Session or Agent state and own authorization, revision comparison, idempotency, durable outcomes, and explicit business cancellation. Commands are used only when the operation is genuinely a Command, and DSHX does not add a private WebSocket, Session registry, action facet, optimistic state, or automatic retry loop.

The current `protocol-1` Session persistence coordinator rejects unknown required event types, while the public append seam exposes no out-of-tree event-vocabulary registration. Consequently, a Conversation contract may reference only keys already present in the official `SessionEventMap`; declaration merging cannot authorize custom durable persistence. The compatibility output explicitly reports the custom durable event vocabulary as unavailable. Stage 5 stays experimental until DSH provides an effect-owned vocabulary registry that is installed before restore/resume, validates both append and stored history, and preserves required-versus-ignorable semantics. Custom event persistence, Host emit helpers, and end-to-end action receipts are not claimed by this stage.

## 2026-08-24: real DSH verification uses one generation-derived scenario

The real-runtime scenario is version-parameterized and receives either `--version` or `DSH_VERSION`; it is not named after a DSH release. Every compatibility adapter records minimum/latest verified boundaries and exact verified versions beside its range and runtime capabilities. The resolver, diagnostics, local default, documentation, and CI all consume that registry. CI derives at most the representative minimum and latest jobs for each supported generation instead of adding one job or script per DSH release.

`verified` means the exact version passed this scenario. An unverified stable version inside a known generation is `compatible`; an unverified prerelease is `experimental`; a version outside every adapter is `unsupported`. Semver intersection alone can select an adapter for builds, but cannot claim real-runtime verification. A new adapter is justified only by a contract or runtime seam change.

GitHub maintains Changesets version pull requests but has no npm publish command or OIDC permission. Package publication, git tag pushing, and post-publication checks are explicit developer-machine operations. CI remains responsible for verification, not release authority.

## 2026-08-24: Critical Hub email is a best-effort projection of the approval ledger

DSHX Hub sends only critical approval decisions and registered-effect failures through Resend. The existing D1 notification event remains the authoritative record and supplies the stable idempotency key; email is a localized delivery projection for verified account addresses, not a second notification model. Marketing, bulk mail, authentication mail, success follow-ups, inbound replies and user-level email preferences remain out of scope.

The Cloudflare Worker schedules delivery with `waitUntil`, so provider failure cannot change the approval transaction or API response. A successful server approval produces one final decision email, an Agent approval explains that execution is pending, and only effect failure produces a follow-up. The first implementation deliberately avoids a Queue, outbox table and webhook because the event ledger already preserves the durable state and the message volume is bounded. Provider errors are logged without recipient addresses or message content.

`mail.dshx.io` is the sending-only domain. The domain-restricted Resend key lives only in the Worker `RESEND_API_KEY` secret; `EMAIL_FROM` is non-secret configuration. Templates use the maintained `@react-email/render` package plus standard React table markup and shared mail components. The deprecated `@react-email/components` aggregate is not a production dependency, while the pinned React Email CLI and UI are development-only tools for local visual preview.

## 2026-08-24: public packages remain on the 0.1 release line

`@becomeopc/dshx`, `create-dshx`, and `@becomeopc/dshx-hub-cli` remain on `0.1.x` until an explicit release-policy decision opens a later line. Changesets use patch bumps for fixes, features, and breaking development changes during this period; breaking behavior must still be called out in release notes. Framework and `create-dshx` remain a fixed group, while the Hub CLI versions independently within the same `0.1.x` line.

The repository checks both current package versions and pending changeset bump types before CI or the Changesets version action proceeds. This prevents an ordinary `minor` changeset from silently producing `0.2.0` or `0.3.0`. GitHub continues to prepare version pull requests only; publication remains a local developer operation.

## 2026-08-25: 0.1.2 freezes an API Candidate and exposes native Vite plugins through a bounded kernel

The root and `/config` entries now export only `defineConfig` and `DshxConfig`; Host, Client, API, and Settings authoring use their dedicated browser/face-safe entries. Compiler, compatibility, diagnostics, CLI embedding, config resolution, and repair APIs move to the Node-only `/tooling` entry. Conversation moves to `/experimental/conversation`. Removed root reexports and `/compiler`, `/compat`, `/cli`, and `/conversation` subpaths receive AST migration diagnostics but no runtime aliases. Host keeps only `apis`; Client has no API or Settings declaration. `useQuery` is replaced by `useApiQuery`. Opaque contributions prevent copied marker/discriminator objects from becoming a second public protocol.

`dshx.config.ts` accepts `host.vite.plugins` and `client.vite.plugins` as native Vite `PluginOption[]`, rather than a DSHX build-plugin abstraction or arbitrary `UserConfig`. DSHX guards entries and browser boundaries before user transforms, then guards protocol, capability metadata, protected resolved config, and final artifacts after them. Plugins may transform modules and use the standard CSS/PostCSS pipeline, but cannot replace root, config file, public directory, entry, target, externals, output format, chunking, wrapper banner/intro/footer, or inline-asset policy. Dev remains Vite build-watch; `apply: 'serve'` and `configureServer` are unsupported. Host and Client must call stateful plugin factories separately.

Client CSS uses native Vite processing with `cssCodeSplit: false`; all local assets are inlined. The one CSS asset is folded into the lazy factory and materializes one `style[data-plugin][data-plugin-css]` owned by the plugin. Extra chunks, CSS/assets, workers, and WASM are hard errors. Tailwind support is therefore an ordinary optional `@tailwindcss/vite` plugin in generated projects, using a `dshx:` prefix and omitting Preflight; Tailwind is not a DSHX peer or runtime dependency.

Plain `dshx check` becomes an offline config/manifest/provider/protocol/migration/TypeScript check. Profile, Composition, bridge, and runtime readiness move behind `check --runtime`; JSON reports static, typecheck, and runtime status separately. Build typechecks first and declarations default on. Programmatic build/watch return DSHX `BuildReport`/`BuildWatcher`, not raw Vite objects. Host, Client, API, Settings, Slot, Prompt, config, and Creator selections are API Candidate; Conversation, the Vite compatibility layer, and programmatic Tooling remain Experimental. API Candidate is a `0.1.x` design checkpoint, not a 1.0 stability promise.

## 2026-10-20: DSH 0.2 replaces protocol-1 with protocol-2 and removes the old seams

DSH `0.2.1` removed the monolithic Client Runtime and replaced several authoring seams. DSHX `0.2.0` follows the new generation instead of keeping compatibility shims: `protocol-1` is removed, and the only adapter is `protocol-2` over `>=0.2.1-rc.2 <0.3.0-0`. Old Settings providers, `settingsScope`, `conversationEvents`, the `authority` RPC option, and `@deepseek-ai/dsh-client-runtime` are not retained. Projects that need them pin the last `0.1.x` DSHX release.

Settings are now the plugin's official `Config` schema. `defineSettings({ schema })` marks the root volatile, `defineHost({ config })` exports it, and the Client hook reads `ctx.configForms.get(entryId)`. The form identity is the Host profile Loader entry id, so the compiler resolves the plugin's `dsh.bundle.patch` paths and embeds that id in the Client artifact. A contract no longer carries a namespace, an `applies` mode, a Host-owned base/validate/setup facet, or a Client decoder; DSH owns those behaviors.

Conversation registers through `ctx.uiConversation.events.register`, and Connection RPC is peer-admitted. The Client no longer calls `connection.api`; generated `ctx.remote` namespaces are used instead. Prompt assembly uses `personaPrefix`/`personaSuffix`, Commands use attachments, and Session format is 4 with no out-of-tree durable event vocabulary.

The verified baseline is a build of source tag `dsh-v0.2.1-rc.2`, not the npm artifact of the same version, which currently contains stale profile-boot code. The compatibility record stores `verificationSource: "source"`; the npm artifact remains experimental until upstream republishes it. The smoke harness accepts `--dsh-source`/`DSH_SOURCE_ROOT` and links the source CLI, and it requires the source checkout's Host/Client `lib` plus `pnpm run build:native-system`.

DSH 0.2 has no first-party runtime Slots catalog. `inspect slots` reports `DSHX3204`; `add ui` accepts explicit `--slot`/`--provider` values, generates from the caller's registration fields, and emits a `DSHX6112` warning because the provider catalog cannot verify the result. The Host-owned bridge still exposes tools, services, events, and configs and does not use the seven local inspect-bridge commits from the development checkout.

## 2026-10-22: install-target usability has one owner and one stored verdict

`apps/framework-hub/src/lib/catalog/install-target/policy.ts` is the only module that decides whether an install target is usable. The ingest contract, the publication gate, the public selector, and the marketplace projection are adapters over it, and `architecture-boundaries.test.ts` fails if a control-character or spec-safety check appears anywhere else. The four earlier copies had already diverged on repository case, git-ref safety, and whether a GitHub target had to be pinned to the latest stable tag.

The marketplace criterion is installability, not release bookkeeping: a GitHub target that names the plugin's own repository with a safe ref is admitted whether the ref is a tag or a branch, and npm still requires the exact current version so the rendered command installs what the page describes.

Whether a plugin is installable is stored in `plugin_readiness` rather than derived inside ranking SQL. That table has one writer, `install-readiness.server.ts`; readers use the shared `installReadySql` fragment, the quality score adds its bonus from the stored row, and the self-heal that repairs missing rows also rescans scores so a repaired verdict cannot disagree with the score it feeds. Curation, observation, and visibility changes refresh the verdict before responding, because each of them can publish a plugin.

## 2026-10-22: curated copy quality has one definition, in TypeScript and SQL

Whether a curation is placeholder copy is decided in `apps/framework-hub/src/lib/catalog/curation-policy.ts`. The module exports the thresholds, the generic-description phrase list, a pure predicate for the ops detail, and a SQL twin for the list and status projections that must filter before pagination. The two adapters read the same constants rather than a comment asking a future editor to keep them aligned, and an integration test asserts both agree on the same fixtures. `architecture-boundaries.test.ts` fails if the phrase list appears anywhere else.

## 2026-10-22: lifecycle policy is pure, and one codec owns pagination cursors

Everything that decides how an observation combines with what the Hub already stored moved to `apps/framework-hub/src/lib/catalog/observation-merge.ts`: the recency gate, the per-field source priority table, the install-target merge with its single-primary rule, and the diff it reports. The module takes data and returns data, so `mergeProjection` is now covered by unit tests that replay an older read, an equally recent higher-priority read, and an unavailable source, instead of only through D1 fixtures. `operations-v1.server.ts` keeps the clock, the revision counter, and the writes.

Whether a plugin is stale, what an operator still has to do, and whether it is published moved to `lifecycle-policy.ts`, next to the SQL projection the ops list needs to filter before pagination. `needsFor` is authoritative; `needsPrefilterSql` is a superset of it, and an integration test fails if the SQL hides a plugin the TypeScript rule would list. The two writes that publish a plugin now call `pluginStatusFor` instead of carrying one `case` expression each; that also stopped a hide from stamping a fresh `published_at` on a plugin it had just archived.

Pagination cursors have one format, in `cursor.ts`: base64url JSON described by a field list (`"timestamp"`, `"text"`, `"page"`, `"day"`), so no list re-derives the decode by hand. The codec stays pure and reports whether a cursor was unreadable; what that means stays with the adapter — the operations API answers 422 so a cursor-paging client cannot loop on page one, while a public catalog page restarts at page one so a shared link still renders.

## 2026-10-22: the operations API is a directory, not a 2,400-line module

`apps/framework-hub/src/lib/catalog/operations-v1.server.ts` is gone. Its 2,440 lines became `apps/framework-hub/src/lib/catalog/operations/`, and the two policy modules named in the previous entry moved with it: `observation-merge.ts` is now `operations/observation/merge.ts`, and `lifecycle-policy.ts` is now `operations/plugins/policy.ts`. The two v1 _contract_ modules (`operations-v1.contracts.ts`, `operations-v1.http.ts`) stay where they were — they describe the wire format, not the storage — so the directory name reads as "the operations domain" rather than a second API version.

Outside the directory, callers import `@/lib/catalog/operations` and nothing deeper; the barrel in `index.ts` is the only door, and `architecture-boundaries.test.ts` fails if a route or test reaches past it. Inside, dependencies point one way: `store` → `plugins/policy` → reads/curation/submissions/audit, with the observation modules depending on `store` only. That is what let the split stay mechanical: no module needed to know where another lives.

`store.ts` grows by addition only and holds no rules. It is the row types, `parseJson`, "find this plugin by id or slug", "load its operational state (or the state the `plugins` row implies)", "read the copy this plugin currently has", and the four per-plugin reads the ops detail needs (identities, install targets, media, recent audit). A boundary test keeps the plugin lookup — `from plugins where id=? or slug=?` — from being re-typed elsewhere.

The three god functions are now compositions over named parts. `projectionStatements` is a 42-line sequence over six builders, one per table (`publishers`, `plugins`, `repositories`, `plugin_source_documents`, `plugin_metrics_current`, `plugin_install_targets`), each gated on the caller's `operation_id`. `upsertObservation` reads as `readObservation` → `resolvePlugin` → `mergeObservation` → statement builders → `commitObservation`, with the three "nothing changed" answers collapsed into one `unchangedObservation`. `curatePlugin` became the same shape per table, and both writes in `plugins/curation.server.ts` now go through one `commitRevisioned` instead of two copies of "the gate statement matched nothing, so answer 409". `auditOperations` is a scope selector over `catalogIssues`, `storageIssues`, and `communityIssues`.

`apps/framework-hub/src/lib/catalog/digest.ts` is the catalog's only sha-256-to-hex spelling, over text or bytes; observation ids, install-target ids, the curation source hash, uploaded media, and operation-report payload hashes all call it, and a boundary test fails on a second `.toString(16).padStart(2, "0")` under `lib/catalog/`.

No wire format, SQL text, statement order, or error code changed. The evidence is the existing suite rather than a new one: the 144 catalog tests, including the D1 integration suite that drives observations, curation, visibility, submissions, and audit through their adapters, pass unchanged.

## 2026-10-22: the Hub wire contract is a package, not two copies

The previous entry said `operations-v1.contracts.ts` stays in the app because it describes the wire format rather than the storage. It now has a package: `packages/hub-contracts` (`@becomeopc/dshx-hub-contracts`) holds `contracts.ts`, `install-target.ts`, `canonical-json.ts`, and `observation-id.ts`, and both sides of the wire import it. The Hub validates against it; the CLI produces against it; neither can drift from the other because there is nothing to drift from.

Two copies had already drifted in four ways, each one a 422 or a false local pass after a successful run:

- npm identities: the CLI's package-name pattern had no lowercase refinement, so `Fixture-Plugin` passed locally and the Hub rejected it.
- GitHub `fullName`: the CLI required `[A-Za-z0-9_.-]` segments while the Hub accepts any non-space, non-slash pair, so the CLI refused repositories the Hub would take.
- `subdirectory`: the Hub defaulted an omitted subdirectory to `""` and the CLI required the field, so a repository-root observation could not be produced at all.
- install targets: the CLI deduplicated targets and stopped there, forwarding specs it could not vouch for and any number of primaries. Its own test asserted that forwarding, calling the server the owner of the rule; with one shared schema the producer applies the rule itself, which is what "the server owns it" was protecting.

Curation had the same story one level down: the CLI accepted `categories: []` and `derivedFrom: []`, both of which the Hub refuses, and one ops-run test was building exactly that document.

A **published** package is the answer rather than a private workspace dependency or a generated copy. The CLI compiles with `tsc` and publishes `dist`, so a `private: true` dependency would not exist when its consumers install it; and generation would leave two definitions, with a `--check` that detects drift after the fact instead of a module that cannot drift. The package therefore joins the release surface: `check-version-policy.mjs` and `check-preview-release.mjs` list it, `smoke-packages.mjs` imports it in isolation, and `hub-contracts:build` runs before anything that compiles against it. Both consumers also run it from `prebuild`/`pretypecheck`/`pretest` and from `prepare` on install, because a stale `dist` would let a consumer's tests pass against the old contract.

`pluginObservationPayloadSchema` and `pluginObservationV1Schema` are one schema with two readings: the payload treats `observationId` as optional (the producer may send it and must not send a wrong one), and `safeExtend` narrows it to required for the stored form. The id itself is `observationIdInput` — the canonical text — plus each runtime's hash primitive, WebCrypto on the Worker and `node:crypto` in the CLI. The shared vector `68ad24…` is asserted from both ends: `packages/hub-contracts/test/observation-id.test.ts` computes it over the contract's text, and `operations/observation/expected-observation-id.test.ts` computes it through the server's `digest`.

The CLI's `contracts.ts` shrank from 532 lines to about 90 and now holds only what is genuinely the CLI's: `sha256`, `observationIdFor`, `parsePluginObservation`, the media input (the wire metadata minus the fields the CLI derives from the file, expressed with `.omit().extend()`), and the list options (the wire query filters plus `all`). Its schemas are declarations, not definitions: `architecture-boundaries.test.ts` no longer names an install-target module inside the app, and `packages/hub-contracts/test/ownership.test.ts` fails if the CLI declares a second payload schema, a second canonical serializer, or its own id derivation. The identity schemas also lost their `operation*` spelling, which existed only in the app.

The marketplace is not a third copy: it validates the public catalog response the Hub renders, not the observation payload. That response is a separate wire contract and stays a candidate of its own.

`canonicalJson` is the Hub's only canonical serializer now; `catalog/json.ts` keeps `jsonRecord` and re-exports the type. The two `stableJson` copies in `lib/approvals/` deliberately do **not** move yet: they serialize persisted `input_hash` and state hashes, and the hand-rolled version keeps `undefined` keys that `canonicalJson` drops, so switching them changes stored hashes and needs its own migration. The boundary test is scoped to `lib/catalog/` for exactly that reason, and the approvals pair is what the next candidate (state machine) takes on.

## 2026-10-22: the approval ledger is a state machine, not SQL with ifs

`lib/approvals/service.server.ts` was 1,246 lines holding four concerns: the rules for whether an irreversible write may proceed, the SQL that performs it, the notification it sends, and the authorization that decides who may ask. `createApproval` and `createUserApproval` were two copies of one insert path that had to be edited together, and the "validate the effect, fingerprint the subject, check the preconditions" sequence appeared six times, once per operation. The rules were only reachable through a local D1, so the most irreversible path in the system — approving a role change, restoring hidden content, forcing a publication — had no test of its own.

It is four modules now:

- `transitions.ts` (239 lines, pure) — the statuses, the next state for each of the six operations, and refusals that carry their own status code. `Evidence = { current, approved }` is two fingerprints; the machine compares them and answers `approval_superseded` with `supersede: true`, so "the subject moved" is a rule instead of a write buried in an adapter. The operation signature also carries the actor, so an operation's authorization check and its state check are read on the same screen.
- `subject.ts` (52 lines, pure) — the canonical text the fingerprint is taken over, and the precondition check.
- `store.server.ts` (496 lines, adapter) — rows, subject reads, expiry on read, supersession, events, notifications, and the attempt record written on success or failure.
- `service.server.ts` (746 lines) — read what the request rests on, ask the machine, write what it allowed.

`architecture-boundaries.test.ts` fails if `transitions.ts` or `subject.ts` imports Drizzle, `lib/db/`, or a `.server` module, so the split cannot rot back into an adapter.

**The approvals `stableJson` copies are gone.** The previous entry said they had to stay until their persisted hashes got a migration. Measuring first made that unnecessary: on every subject shape — user, review, reply, plugin, maintainer, catalog-run, and the missing-maintainer case — `stableJson` and `canonicalJson` produce byte-identical text. They differ only on `undefined` values, which a D1 row never carries and which a JSON-parsed precondition never produces. So the stored `source_hash` values do not change, and the boundary guard now covers all of `lib/` rather than `lib/catalog/`. Where they would have differed, the old hash would simply stop matching and the request would be superseded — the safe direction, never a wrong write. The `approval_effect_attempts.input_hash` changes only in that hypothetical, and it is an audit column nothing compares.

`getApproval` took a boolean that meant "skip the visibility check" *and* "return the ledger instead of the requester's view". Splitting it into `getApprovalDetail` and `getRequesterApproval` removed a union type every caller had to know about; the whole `/api/ops` family now answers in the requester shape, including the list a caller polls with.

Two smaller collapses: `effectOutcomeStatements` builds the success and failure records from one description, so the call log, the event and the notification cannot fall out of step; and one `insertApproval` serves both requesters, with the two exported names left as the public surface.

The new tests are the point of the split: `transitions.test.ts` exercises the whole table — every operation, every refusal code, the stale branch, the expired lease, the duplicate success — in 19 cases and 3ms of assertions, with no database. The integration suite still runs, but now only proves that persistence and concurrency do what the machine decided.
