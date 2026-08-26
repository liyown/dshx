# Architecture

DSHX is a build/development toolchain. Built plugins run on official DSH/Cordis services; DSHX does not add a second application runtime.

## Ownership matrix

| DSHX owns                                          | DSH/Cordis owns                                                  |
| -------------------------------------------------- | ---------------------------------------------------------------- |
| Project/config discovery                           | Dependency scopes and Fibers                                     |
| Static manifest/provider diagnostics               | Tool, Command, Prompt, Settings, Slot, Conversation registries   |
| Type checking and migration diagnostics            | Duplicate handling, scope shadowing, disposer lifetimes          |
| Protocol-generation selection                      | Connection transport and cancellation propagation                |
| Host/Client Vite compilation                       | Prompt assembly and dynamic-provider evaluation                  |
| Bounded CSS/asset materialization                  | Settings persistence, revisions, redaction, recovery             |
| Profile CLI orchestration and read-only Inspect    | Conversation replay, ordering, pagination, publication, location |
| Source scaffolds and deterministic manifest repair | Client HMR and Host process semantics                            |

Public contributions are opaque declarations over official types. DSHX authenticates them and chooses the official registration method; it does not maintain a parallel registry or cache.

## Authoring graphs

Shared browser-safe contracts live in their own modules:

```text
src/api/*.ts       -> imported by Host and Client
src/settings.ts    -> imported by Host and Client
src/host.ts        -> Node Host graph
src/client.tsx     -> browser Client graph
```

Host-only Settings facets (`base`, `validate`, `setup`) remain in `src/host.ts`. React Hooks remain in Slot or Conversation renderer components. Conversation `initial/reduce/project` functions are replayable pure logic and do not call Hooks.

## Build flow

1. Resolve the nearest package, `dshx.config.ts`, convention/explicit entries, config dependencies, and manifest.
2. Select one compatibility adapter from the installed DSH version and ensure the public peer range fits one generation.
3. Run offline manifest, provider-edge, migration, and TypeScript checks.
4. Build Host and Client with internal entry/browser guards first, native user Vite transformations next, and protocol/capability/artifact guards last.
5. Inline DSHX helper implementations into the output while keeping official runtime packages governed by the adapter external policy.
6. Enforce one Host ESM chunk and one lazy-CJS Client chunk. Fold one standard Vite CSS asset into the Client factory and reject additional chunks/assets/workers/WASM.
7. Emit declarations for the actual `name`/`inject`/`Config`/`apply` module shape.

Final artifacts contain no import of a DSHX authoring/runtime-private module.

## Hook capability inference

`useApi`, `useApiQuery`, and `useSettings` do not require duplicate Client declarations. The Client compiler uses final chunk module metadata after tree-shaking to determine whether API or Settings Hook modules are retained. It then:

- validates the matching `dsh.client.inject` provider package edge;
- embeds the capability flag used by the Client adapter;
- adds `connection` or `settingsScope` to the Cordis inject list;
- creates one contract-identity map scoped to the current Client Fiber.

There is no marker-string scan, global API cache, global Settings scope, or stale HMR map.

## Vite extension boundary

User Vite plugins are standard `PluginOption[]`, not a DSHX plugin abstraction. They can transform modules and CSS but cannot replace roots, entries, output protocol, target, externals, chunking, or inline-asset policy. `dshx dev` is build-watch rather than a Vite dev server. See [Build](./guides/build.md).

## Conversation boundary

The experimental Conversation helper creates one official node definition plus one keyed chat renderer. The official assembler still executes matching, folding, projection scheduling, replay, ordering, pagination, location, HMR rebuild, and disposal. Host interaction uses the ordinary typed Connection API.

The verified `protocol-1` persistence contract has no out-of-tree durable event-vocabulary registry. Conversation event keys therefore remain limited to the official `SessionEventMap`; TypeScript declaration merging alone does not authorize persistence.

## Compatibility and Inspect

One adapter represents one observable DSH contract generation, not one release. Non-overlapping ranges, capabilities, lifecycle, and verified boundaries live in the same registry. One plugin artifact targets one generation.

Inspect is read-only and requires a running supported Composition. The Host-owned bridge exposes only allowlisted official providers over a local authenticated channel; it never carries business/API traffic. Missing capability returns a diagnostic instead of an offline guess.

## Repository layout

- `packages/dshx`: authoring APIs, compiler kernel, compatibility, CLI, Inspect, and scaffolds.
- `packages/create-dshx`: template/style initializer.
- `packages/framework-hub-cli`: Hub verification and privileged operations client.
- `apps/framework-hub`: bilingual Hub and catalog/community application.
- `fixtures`: compatibility fixtures, not user-facing project modes.
- `scripts`: packaging, release, browser, and real-runtime smoke orchestration.
