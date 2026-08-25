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
- Schemastery-backed Settings contracts: `defineSettings`, Host ownership facets, and hook-driven `useSettings` Client wiring over the official shared mirror.
- Experimental component-shaped Conversation contributions that bundle one official event-folding definition with its keyed chat renderer.

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
settings -> settings
api      -> connection
```

`defineTool` remains the exact official DSH helper. DSHX must not add a parallel Tool schema or execution DSL.

`defineCommand` and the Prompt helpers must remain thin, type-safe adapters over the official registration objects. Ordering, scope, shadowing, cancellation, and disposal remain DSH-owned.

### Client

```text
@becomeopc/dshx/client
defineClient
defineSlot
useApi
useQuery
useSubscription
useSettings

@becomeopc/dshx/conversation
defineConversation
```

`defineSlot` remains the general UI contribution point. DSHX should not grow separate helpers such as `defineToolbarItem`, `definePanel`, or `defineToolView` while the official Slot contract can express those contributions.

`defineConversation` is a focused component contribution over the official conversation-node seams. Its declaration may colocate event matching, state folding, view projection, and the keyed React renderer, but the official assembler must still execute replay, sequence ordering, publication, pagination, location, and disposal. The React component receives projected data; it does not become a second event reducer or Session runtime.

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

Settings contracts use the official Schemastery package so the same schema can drive Host inference and the official browser decoder. DSH retains persistence, defaults/base/user layering, revisions, secret redaction, validation, recovery, shared mirroring, and lifecycle. DSHX does not add raw-document migrations; schema evolution in this stage is backward-compatible only.

## Delivery Order

### Stage 1: Harden the current API

Status: complete for the current `protocol-1` Connection seam at the verified DSH boundaries. Artifact/source parity, JSON transformation, channel disposal, version-mismatch classification, cancellation, reconnect-aware query scheduling, and hook-driven Client binding are covered. Retained `useApi`/`useQuery` code now infers the Connection capability and lazily reuses contracts by identity within one Client Fiber; explicit `ClientDefinition.api/apis` remains a compatibility form. The parameterized generation smoke verifies real unary calls, Host restart, API re-registration, and Client HMR at representative boundaries; the browser fixture additionally verified `useQuery`, AbortSignal propagation, and reconnect recovery.

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

Status: complete for the current `protocol-1` System Prompt seam at the verified DSH boundaries. `definePromptSection` and `definePromptContext` preserve official contribution values inside a small discriminated wrapper, while `defineHost({ prompts })` injects `systemPrompt` and delegates registration, ordering, scope, shadowing, assembly, and disposal to DSH. The generated starter demonstrates one ordered guidance section and one dynamic runtime context. The parameterized real-runtime smoke verifies global and Agent-scoped assembly, shadow/restore, dynamic context, Tool schema visibility, and Host restart cleanup.

- Keep Prompt contribution values compatible with the official `PromptSection` and `PromptContext` contracts.
- Keep variables, tool-schema providers, complete-prompt policy, scoped registration, ordering, shadowing, and disposal in DSH.
- Keep `setup(ctx)` as the direct path for Agent-scoped and advanced System Prompt behavior.
- Do not add a `dshx add prompt` scaffold until repeated authoring patterns justify it.

### Stage 4: Settings Contract

Status: complete for the current `protocol-1` Settings and Client Settings Scope seams at the verified DSH boundaries. `defineSettings` preserves one portable Schemastery contract; `defineHost({ settings })` claims namespace ownership, while `useSettings(contract)` directly binds the official shared Client scope without a duplicate Client declaration. Tree-shaken Hook retention drives `settingsScope` injection and package-edge diagnostics. Secret contracts require a Client-safe decoder, and advanced `.host()` facets keep base, validation, setup, and disposer behavior out of Client artifacts.

- Keep persistence, layering, revisions, schema validation, write serialization, redaction, recovery, namespace collisions, and scope disposal in DSH/Cordis.
- Keep Hook mutation state local: no optimistic state, retry loop, cache, or retained write value.
- Keep Client values decoder-safe while allowing typed writes to Host schema fields, including write-only secrets.
- Keep the generated Runtime Deck as a concrete custom control; do not add a generic Settings page or form generator.
- Do not add `dshx add settings` or DSHX raw-document migrations in this stage.

### Stage 5: Conversation Nodes

Status: the component contribution is implemented for the official `protocol-1` Client seams, but Stage 5 remains experimental and open. `defineConversation({ kind, events }).component(...)` produces one contribution for `defineClient({ conversations })`; DSHX registers its official assembler definition before the keyed `conversation.chat.node` renderer and infers the `conversationEvents` and `slots` dependencies. This removes the artificial split between a lifecycle definition and its renderer without moving lifecycle execution into React.

- Keep event keys constrained to the official `SessionEventMap` at the current verified boundaries. TypeScript declaration merging alone does not make a new required event type safe for Session persistence or replay.
- Keep match, start/update folding, view-node publication, replay, ordering, pagination, location, duplicate handling, and disposal in the official Client runtime.
- Keep Host interaction compositional: use the existing `defineApi`/`useApi` Connection contract for typed writes, and use official Commands or Agent behavior only when their semantics actually match the operation. Do not add a private Conversation transport or an implicit Host action facet.
- Do not present custom durable Session events as supported until DSH exposes an effect-owned event-vocabulary registration seam that is active before restore/resume, validates append and persisted history, and distinguishes required from ignorable data.
- Before marking the stage complete, add a real replay fixture for official events covering step data, publication, update ordering, pagination, location, HMR, reconnect, and duplicate-registration cleanup; then add a separate custom-event fixture only after the upstream vocabulary seam exists.

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
