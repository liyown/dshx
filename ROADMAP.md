# DSHX Roadmap

This roadmap describes the path from the current 0.1 development toolchain to a stable 1.0 authoring model. It is a capability roadmap, not a required project-mode matrix: Full, Host-only, Client-only, and native modules remain valid combinations chosen by the plugin author and are used only as compatibility fixtures.

## Design Principle

DSHX has two layers:

- Declarative APIs describe what a plugin contributes.
- Official DSH/Cordis `ctx` APIs describe how a plugin participates in runtime behavior.

DSHX should add a public symbol only when it removes repeated, error-prone contribution wiring without replacing an official runtime model. DSHX must not mirror every `ctx.*` service or invent a second DI container, Tool runtime, Session runtime, Event runtime, or Provider protocol.

## Current Baseline

The 0.1 line currently provides:

- Host and Client compilation for independently discovered entries, including native named modules.
- `defineHost`, official `defineTool`, `defineClient`, and official SlotMap-based `defineSlot`.
- Runtime Inspect for Slots, exact Slot contracts, Tools, Services, and Events when the verified DSH adapter and live Composition provide them.
- `dshx dev`, automatic browser handoff for generated projects, Client HMR, Host restart, Profile orchestration, and deterministic `check --fix`.
- Typed unary Host/Client APIs: `defineApi`, `method`, `useApi`, `useQuery`, and `ApiError` over the official Connection transport.

The current release must continue to preserve direct `setup(ctx)` escape hatches and must not require users to select a Host/Client project mode.

## 1.0 Public Surface

The target stable surface is intentionally small, approximately 15-20 long-lived symbols.

### Host

```text
@becomeopc/dshx/host
defineHost
defineTool
defineCommand
definePromptSection
definePromptContext
```

`defineHost` remains the primary contribution declaration. It may contain `tools`, `commands`, `prompts`, `settings`, `api`/`apis`, and `setup(ctx)`. Deterministic dependencies are inferred and deduplicated:

```text
tools    -> tools
commands -> commands
prompts  -> systemPrompt
api      -> connection
```

`defineTool` remains the exact official DSH helper. DSHX must not add a parallel Tool schema or execution DSL.

`defineCommand` and the Prompt helpers must remain thin, type-safe adapters over the official registration objects. Ordering, scope, shadowing, cancellation, and disposal remain DSH-owned.

### Client

```text
@becomeopc/dshx/client
defineClient
defineSlot
defineConversationNode
useApi
useQuery
useSubscription
useSettings
```

`defineSlot` remains the general UI contribution point. DSHX should not grow separate helpers such as `defineToolbarItem`, `definePanel`, or `defineToolView` while the official Slot contract can express those contributions.

`defineConversationNode` is a focused convenience for the official conversation-node seams. It may remove declaration-merging and registration boilerplate, but must preserve stable IDs, start/update semantics, sequence ordering, replay, publication, pagination, location data, and view registration.

### API and Settings

```text
@becomeopc/dshx/api
defineApi
method
event
// stream: only after the official transport has stable semantics

@becomeopc/dshx/settings
defineSettings
```

Unary methods are stable only after version checks, JSON-safe validation, lifecycle cleanup, reconnect behavior, and artifact installation are covered. Events and streams require an official subscribe/unsubscribe contract, ordering rules, replay behavior, backpressure, and Host restart semantics.

Settings use Standard Schema rather than a mandatory schema library. Before stabilization, the implementation must define persistence, secret handling, defaults, migrations, Host/Client visibility, and failed-update rollback.

## Delivery Order

### Stage 1: Harden the current API

Status: complete for the current `protocol-1` Connection seam at the verified DSH boundaries. Artifact/source parity, JSON transformation, channel disposal, version-mismatch classification, cancellation, and reconnect-aware query scheduling are covered. The parameterized generation smoke verifies real unary calls, Host restart, API re-registration, and Client HMR at representative boundaries; the browser fixture additionally verified `useQuery`, AbortSignal propagation, and reconnect recovery.

- Keep `defineApi`/`method` compatible with the official Connection API.
- Verify Host and Client lifecycle, API version mismatch, reconnect, AbortSignal, and HMR behavior against real DSH fixtures.
- Keep `useQuery` as a deliberately small state model; do not add query caching or optimistic updates.
- Keep runtime and native module support independent of project mode labels.

### Stage 2: Command Contribution

Status: complete for the current `protocol-1` Command seam at the verified DSH boundaries. `defineCommand` preserves the official `CommandDefinition`, Host definitions register commands in declaration order through `ctx.commands.register()`, and Cordis retains collision, scope, cancellation, and Fiber disposal ownership. `dshx add command` is a transactional source scaffold. The parameterized generation smoke verifies the generated Command through the official registry and `commands/execute` parser before and after an automatic Host restart.

- Keep `defineCommand` as a typed identity helper over the official Command object.
- Keep command scope, parsing, collisions, lifecycle events, cancellation, and disposal in DSH.
- Keep `dshx add command` local, idempotent, rollback-safe, and independent of Runtime Inspect or Profile mutation.
- Do not route slash commands through `session.prompt`; the verified `protocol-1` seam is the official Connection `commands/execute` Remote.

### Stage 3: Prompt Contributions

Add `definePromptSection` and `definePromptContext` after verifying scoped registration, ordering, shadowing, dynamic context, and tool-schema visibility. Do not reduce Prompt contributions to unscoped static text.

### Stage 4: Settings Contract

Add `defineSettings` and `useSettings` with Standard Schema, persistence boundaries, secret policy, migrations, and Host/Client access rules. A generated settings UI is explicitly out of scope for the core API.

### Stage 5: Conversation Nodes

Add `defineConversationNode` only after a real replay fixture covers event maps, step data, publication, update ordering, pagination, location, view nodes, HMR, and duplicate-registration cleanup. The helper must not hide replay semantics.

### Stage 6: Client Events and Subscriptions

Add `event`, `useSubscription`, and eventually `stream` only after the official Connection transport provides stable subscription semantics. Do not implement a private WebSocket, polling protocol, or Inspect-Bridge reuse for business events.

### Stage 7: Ecosystem Scaffolds

Provide generators for official structures where repetition is high:

- Session event declaration merging and test fixtures.
- Service declaration merging and `inject` checks.
- LLM, Subagent, Filesystem, Sandbox, Shell, Compaction, and Session Title adapter scaffolds when each official seam is verified.

These generators must not become new runtime abstractions. There is no generic `defineService` or `defineProvider` in the stable core.

## Explicit Non-Goals

- No required Full/Host-only/Client-only/native mode selection.
- No `defineService`, `provideService`, `useService`, or generic `defineProvider` runtime.
- No `defineHook` wrapper for `ctx.on`; hooks remain official Cordis events.
- No React Query cache, stale-time, optimistic update, or normalized cache layer.
- No arbitrary npm package loading from CLI input.
- No private RPC or business traffic through the Inspect Bridge.
- No automatic universal form generation from Settings schemas.
- No API stabilization based only on TypeScript declarations or simulated loader tests.

## Stabilization Gates

An API enters the stable 1.0 surface only when all conditions hold:

1. The corresponding DSH official seam is public and documented.
2. A compatibility adapter declares the capability explicitly.
3. The compatibility generation's representative boundaries pass the generic real Composition scenario.
4. Host and Client artifacts install through the DSH CLI without private DSHX runtime imports.
5. Lifecycle tests cover dispose, restart, HMR, duplicate registration, and failure rollback.
6. JSON output, diagnostics, and `--verbose` behavior are stable where a CLI is involved.
7. The API has a documented version and migration policy.

Until these gates pass, the capability remains internal or experimental and must not be presented as an offline fallback.

## Verification Matrix

Every capability stage is validated against the combinations that users may freely choose:

- Host definition + Client definition.
- Host-only source.
- Client-only source with the required root artifact.
- Native named Host.
- Native named Client.
- Mixed DSHX/native entries.

These combinations test compatibility; they do not constrain authoring choices.
