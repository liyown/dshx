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

## 2026-08-21: Profile orchestration uses the project-local official CLI

DSHX resolves DSH from the project through `pnpm exec dsh` and requires `@deepseek-ai/dsh` to be both declared and locally resolvable. It does not fall back to a global executable, so the version checked by DSHX is the version the project installs. Exact rc.8 is verified; an unsupported version fails with `DSHX5101` unless `compatibility.allowUnsupported` is enabled, in which case DSHX keeps the rc.8 adapter and returns the same code as a warning.

Profile state comes from `dsh plugin --profile <name> list --depth 0 --json`. DSHX compares both package ID and real package path, skips an exact existing link, and rejects name/path conflicts before any add. An absent project is installed only through `dsh plugin --profile <name> add <absolute-root>` and must appear in a second official inspection before orchestration succeeds. DSHX never reads or writes the profile manifest directly and does not remove links when a dev process exits.

This layer remains internal until the user-facing CLI is implemented. It does not start DSH, manage watchers, validate the Node engine, restart Host code, or expose unlink behavior; the next process-orchestrator and CLI stages own those concerns.

## 2026-08-21: Dev sessions gate DSH on successful watch builds

`startDevSession()` composes the resolved project, Profile Orchestrator, Host/Client watcher factories, and one project-local DSH child. Watch mode starts without requiring a successful one-shot build, so an initial compiler error leaves the watcher active and the face in `error`; a later valid source change can recover it to `ok`. DSH starts only after every enabled face has produced a successful bundle at least once. A failed or unexpectedly exited DSH process is not started again by later build events and requires an explicit `restart()`.

Client rebuilds leave DSH running and rely exclusively on rc.8 HMR. A Host rebuild under the default `manual` policy sets `hostRestartRequired`; `auto` serializes stop/start operations so only one DSH child is active. Web processes receive `--no-open` unless the caller supplies an open policy. The process inherits the environment, uses the project root as cwd, and always runs through `pnpm exec dsh --profile <profile>`.

Session shutdown first closes enabled watchers, then sends SIGTERM to DSH and escalates to SIGKILL after a bounded timeout. Shutdown is idempotent, waits for an in-flight restart, ignores late watcher/child events, and never removes the Profile link. `DSHX4401` through `DSHX4406` cover spawn, exit, signal, restart, watcher lifecycle, and build failures while retaining the original compiler error or inherited DSH stderr for diagnosis.

This remains a process-control API rather than a user command. It does not own stdin, TTY/raw mode, `r`/`q` keys, automatic restart backoff, unlink, Node engine checks, or artifact inspection; those responsibilities stay with later CLI and check stages.

## 2026-08-21: defineHost is an identity API over the official Host model

`dshx/host` exposes an identity-preserving `defineHost()` whose `setup` receives the official Cordis `Context` and whose `tools` accept the rc.8 `ToolDefinition` directly. DSHX does not introduce parallel Context, Tool, registry, or disposer types. The official Cordis and tools packages are peer dependencies used for public typing; re-exporting the official `defineTool` remains a separate next-stage decision.

The Host compiler now builds through a virtual entry. A default export is normalized as a Host definition; a module without a default export retains its native `name`, `inject`, `Config`, and `apply` contract. Definition names override the resolved logical project name, which in turn falls back to the package ID. Client-only projects keep a named no-op Host entry.

User inject entries keep first-occurrence order. A non-empty `tools` list appends the `tools` service only when it is absent, then `apply()` registers every Tool in declaration order before calling `setup(ctx)`. Tool definitions and duplicate names are passed unchanged to the official registry, and returned disposers are not captured because Cordis already binds registration effects to the calling Fiber.

The public identity helper and internal adapter are bundled into `dist/index.js`; only user and platform bare imports remain external. This keeps DSHX a build-time dependency while allowing stable `DSHX2001`/`DSHX2002` runtime diagnostics for malformed JavaScript definitions. Config schemas, prompt/command shortcuts, service-access inference, Client helpers, and user-facing CLI commands remain out of scope for this stage.
