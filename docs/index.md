# DSHX API reference

This index routes each public DSHX module to its API reference or focused guide. The web reference documents signatures, parameters, return values, examples, automatic wiring, lifecycle, and errors in [English](https://dshx.io/en/docs) and [Chinese](https://dshx.io/zh/docs).

## Start here

Create a project and start its development workflow:

```bash
pnpm create dshx my-plugin
cd my-plugin
pnpm dev
```

The generated project demonstrates a Host Tool, Prompt contributions, a shared Settings contract, a typed Host/Client API, and a Client Slot. Open only the modules used by your plugin:

1. [Host contributions](./guides/host-contributions.md) — register Tools, Commands, Prompts, Settings ownership, and APIs.
2. [Settings](./guides/settings.md) — define one Schemastery-backed contract and consume it through `useSettings`.
3. [Typed Host/Client API](./guides/typed-api.md) — call Host behavior from Client components with `useApi` and `useQuery`.
4. [Conversation components](./guides/conversation.md) — colocate deterministic Conversation assembly and its React renderer.

## Guides and reference

| Document                                             | Use it for                                                                                      |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| [Host contributions](./guides/host-contributions.md) | `defineHost`, contribution order, automatic service injection, Prompts, and direct Cordis setup |
| [Settings](./guides/settings.md)                     | `defineSettings`, Host ownership, client-safe decoding, mutations, and `useSettings`            |
| [Typed Host/Client API](./guides/typed-api.md)       | `defineApi`, Host handlers, Client Hooks, validation, cancellation, and errors                  |
| [Conversation components](./guides/conversation.md)  | `defineConversation`, lifecycle folding, view projection, rendering, and Host interaction       |
| [CLI reference](./cli-reference.md)                  | Build, check, dev, inspect, scaffolding, and automation guarantees                              |
| [Compatibility](./compatibility.md)                  | Protocol adapters, verified DSH versions, dependency edges, and real-runtime smoke policy       |
| [Architecture](./architecture.md)                    | Repository layout, artifact boundaries, and runtime-thin ownership                              |
| [Dependency policy](./dependency-policy.md)          | Workspace dependency constraints and publication rules                                          |
| [Releasing](./releasing.md)                          | Versioning, validation, packaging, and publication                                              |

Project direction and protocol gates are tracked in the [Roadmap](../ROADMAP.md). Architectural choices and rejected alternatives are recorded in [Decisions](../DECISIONS.md).

## Ownership boundary

DSHX describes and wires contributions. The official DSH and Cordis packages remain responsible for registries, scopes, ordering semantics, shadowing, assembly, persistence, transport, HMR, and disposal. The guides call out this boundary wherever a helper could otherwise look like a second runtime.

## Package entry points

The npm package exposes focused public modules:

| Module                         | Primary surface                                          |
| ------------------------------ | -------------------------------------------------------- |
| `@becomeopc/dshx/host`         | Host definitions, Tools, Commands, and Prompt wrappers   |
| `@becomeopc/dshx/client`       | Client definitions, Slots, API Hooks, and Settings Hooks |
| `@becomeopc/dshx/settings`     | Portable Settings contracts                              |
| `@becomeopc/dshx/api`          | Typed unary Host/Client API contracts                    |
| `@becomeopc/dshx/conversation` | Experimental component-shaped Conversation contracts     |
| `@becomeopc/dshx/config`       | Project configuration                                    |
| `@becomeopc/dshx/compiler`     | Programmatic Host and Client builds                      |
| `@becomeopc/dshx/cli`          | Stable parser and CLI runner interfaces                  |
| `@becomeopc/dshx/compat`       | Adapter resolution, project assessment, and diagnostics  |

See the [`@becomeopc/dshx` package README](../packages/dshx/README.md) for installation and the minimal package quickstart.
