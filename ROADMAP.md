# DSHX Roadmap

DSHX remains on `0.1.x`. `0.1.2` establishes an API Candidate authoring surface but does not promise 1.0 stability. Further breaking changes require an explicit migration and must pass both verified DSH boundaries.

## Runtime boundary

DSHX adds declarations, types, compilation, diagnostics, Profile orchestration, and scaffolding. Official DSH/Cordis continues to own registries, scope, transport, persistence, Prompt assembly, Conversation replay, HMR cleanup, and disposer lifetimes.

## 0.1.2 API Candidate

### Stable entry layout

```text
@becomeopc/dshx                 defineConfig, DshxConfig only
@becomeopc/dshx/config          defineConfig, DshxConfig only
@becomeopc/dshx/host            Host definitions and contributions
@becomeopc/dshx/client          Client definitions, Slots, React Hooks
@becomeopc/dshx/api             shared typed unary API contracts
@becomeopc/dshx/settings        shared Settings contracts
```

Contributions are opaque and identity-authenticated. Source helpers and virtual build modules share one implementation; built artifacts retain no DSHX private runtime import.

### Host

```ts
defineHost({
  name,
  inject,
  tools,
  commands,
  prompts,
  settings,
  apis,
  setup(ctx) {},
});
```

Registration order is Tools → Commands → Prompts → Settings → APIs → setup. Only non-empty lists infer and deduplicate official services. `api` is removed.

### Client and Slots

```ts
defineClient({
  name,
  inject,
  conversations,
  slots,
  setup(ctx) {},
});
```

Client `api`, `apis`, and Settings declarations are removed. Retained `useApi`, `useApiQuery`, and `useSettings` modules infer capabilities after tree-shaking. `defineSlot` follows the official `SlotMap`, `HandleOf`, inject props, kind options, children, locale, session/maybe, keyed/list/chain, and render checks.

### Typed API

- `method<I, O>()` is `I → I → O → O`.
- Standard Schema methods infer `ClientInput → HostInput → HostOutput → ClientOutput`.
- Schemas execute once at the Host boundary.
- `.host()` requires exact handler keys.
- Imperative methods use `(input, options)`; no-input Signal calls pass `undefined`.
- `ApiError` is opaque and tested with `isApiError`.
- `useApiQuery` has a strict pending/success/error union, generation-aware pause/reconnect, caller abort, and stable JSON input fingerprints.
- No global cache, dedupe, optimistic state, or business retry.

### Settings

- One Schemastery contract is shared; one Host claims ownership.
- `.host({ base, validate, setup })` is the Host-only advanced facet.
- Client decoders throw on invalid redacted data and infer Client value types.
- Secret paths are fail-closed to safely redacted object/dict/array shapes.
- `useSettings` exposes only status, value, revision, writable, mode, applies, secrets, read error, mutation pending, set, and unset.
- No optimistic state, retained submitted value, automatic retry, raw-document migration, or generic form UI.

### Prompt

Prompt Section and Context helpers preserve official object identity and select the official registration method. Ordering, scope, shadowing, duplicates, dynamic provider evaluation, assembly, and disposal remain official behavior.

## Experimental surfaces

### Conversation

```tsx
const lifecycle = defineConversation({
  kind,
  events,
  initial(context, event) {},
  reduce(state, context, event) {},
  project(state, context) {},
});

const contribution = lifecycle.render(Component);
```

Conversation remains under `@becomeopc/dshx/experimental/conversation`. Pure lifecycle functions fold official `SessionEventMap` events; Hooks belong only in the renderer. It stays Experimental until the upstream durable event vocabulary and real replay/HMR/reconnect lifecycle are stable enough for a long-lived public promise.

### Vite compatibility layer

`host.vite.plugins` and `client.vite.plugins` accept bounded native Vite `PluginOption[]`. The extension kernel, config-reload last-good behavior, and compatibility rules remain Experimental while Vite/Rolldown hooks evolve. DSHX will not add a parallel build-plugin API.

### Tooling

`@becomeopc/dshx/tooling` contains Node-only build/watch, config resolution, compatibility, diagnostics, CLI, and repair APIs. `BuildReport` and `BuildWatcher` hide raw Vite return types, but programmatic Tooling remains Experimental during `0.1.x`.

## Completed delivery stages

| Stage                               | Status                              | Gate                                                                                                    |
| ----------------------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------- |
| 1. Typed unary API                  | Candidate                           | transform-once, exact handlers, cancel/reconnect/restart, Hook inference                                |
| 2. Commands                         | Candidate                           | official registry, array order, lifecycle disposal                                                      |
| 3. Prompt contributions             | Candidate                           | real assembly, scope shadow, dynamic Context, restart                                                   |
| 4. Settings contract                | Candidate                           | read/write, revision/recovery, secrets, restart, Hook inference                                         |
| 5. Conversation component lifecycle | Experimental                        | official event replay and integrated renderer implemented; durable custom events unavailable            |
| 5.5. API/build stabilization        | Candidate + Experimental extensions | entry cleanup, Vite kernel, standard CSS/assets, Creator matrix, offline check, declarations, migration |

The representative `protocol-1` boundaries remain `0.1.0-rc.8` and `0.1.1-rc.2`.

## Next capability tracks

### Adoption and ecosystem

- Keep the Framework Hub examples, copyable development Prompt, and standalone DSHX development Skill aligned with the installed release.
- Add verified example plugins that demonstrate Candidate APIs without depending on Experimental Conversation.
- Improve diagnostics from real user failures before adding more helpers.
- Add scaffolds only for repeated official structures; do not add `dshx add api/settings/prompt/conversation` by default.

### Build extensions

- Verify more ordinary Vite transformation plugins against the protected output boundary.
- Add PostCSS/framework recipes as documentation and Creator styles only when they need no DSHX runtime abstraction.
- Keep independent static assets, multi-chunk output, workers, and WASM unsupported until DSH has an ownership/loader contract for them.

### Official events and streaming

- Add API subscription/stream Hooks only after official Connection exposes stable ownership, cancellation, reconnect, and backpressure semantics.
- Support custom durable Conversation events only after DSH exposes an effect-owned vocabulary registry installed before restore/resume and enforced for append and persisted history.
- Do not implement private WebSockets, polling protocols, or reuse Inspect for business traffic.

### 1.0 stabilization

An API may be promoted from Candidate only when:

1. the corresponding official seam is public and documented;
2. the adapter declares the capability;
3. minimum/latest generation boundaries pass real Composition smoke;
4. built tarballs load without DSHX private runtime imports;
5. dispose, restart, HMR, duplicate, abort, reconnect, and failure recovery are covered where applicable;
6. diagnostics and JSON fields have a migration policy;
7. at least one external plugin has exercised the API without private workarounds.

## Explicit non-goals

- No required Full/Host-only/Client-only/native project mode.
- No second DI container, Tool runtime, Session runtime, Prompt registry, Settings store, Event bus, or Connection transport.
- No generic `defineService`, `provideService`, `useService`, or provider abstraction.
- No arbitrary `vite.config.*`, Vite dev server, multi-chunk output, or public static directory.
- No React Query-style cache, stale time, optimistic mutation, or normalized entity cache.
- No universal Settings form or automatic raw-document migration.
- No unsupported API stabilization based only on TypeScript or simulated loaders.
