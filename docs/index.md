# DSHX documentation

DSHX Preview exposes a small authoring surface and keeps compiler/runtime internals out of application bundles. Install the current line with the npm `preview` tag; these labels describe API maturity and are not 1.0 compatibility promises.

| Label             | Meaning                                                                                                     |
| ----------------- | ----------------------------------------------------------------------------------------------------------- |
| **API Candidate** | Intended authoring shape for the rest of the `0.1.x` line. Breaking changes still require a migration note. |
| **Experimental**  | May change during `0.1.x`; import only from an `experimental` or Tooling entry.                             |
| **Tooling**       | Node-only compiler, compatibility, diagnostic, and CLI APIs. Never import into Host or Client source.       |

## API chapters

1. [Host](./guides/host.md) — `defineHost`, Tools, Commands, registration order, injection, and lifecycle.
2. [Client, Locale, and Slots](./guides/client.md) — `defineClient`, `defineLocale`, `defineSlot`, official Slot props, Hook-driven capabilities, and lifecycle.
3. [Typed API](./guides/api.md) — `defineApi`, Standard Schema transforms, Host handlers, imperative calls, `useApiQuery`, and errors.
4. [Settings](./guides/settings.md) — shared Schemastery contract, Host ownership, safe Client decoding, reads, and mutations.
5. [Prompt](./guides/prompt.md) — Prompt Sections, dynamic Contexts, ordering, scope, assembly, and ownership.
6. [Conversation](./guides/conversation.md) — experimental pure event lifecycle plus React renderer.
7. [Build](./guides/build.md) — bounded config, Vite plugin extensions, CSS/assets, declarations, and watch behavior.
8. [Creator](./guides/creator.md) — template/style matrix, generated dependencies, and automation.
9. [Tooling](./guides/tooling.md) — experimental Node-side build/watch, config, compatibility, diagnostics, CLI, and repair APIs.

Additional references:

- [CLI reference](./cli-reference.md)
- [Compatibility and verification](./compatibility.md)
- [Preview scope and known limits](./preview.md)
- [Publishing a plugin package](./guides/publishing.md)
- [Architecture](./architecture.md)
- [0.1.1 to 0.1.2 migration](./migrations/0.1.1-to-0.1.2.md) ([简体中文](./migrations/0.1.1-to-0.1.2.zh-CN.md))

## Public entry points

| Entry                                       | Status                 | Browser-safe | Purpose                                                                       |
| ------------------------------------------- | ---------------------- | ------------ | ----------------------------------------------------------------------------- |
| `@becomeopc/dshx`                           | API Candidate          | Yes          | `defineConfig`, `DshxConfig` only                                             |
| `@becomeopc/dshx/config`                    | API Candidate          | Yes          | Same config-only surface                                                      |
| `@becomeopc/dshx/host`                      | API Candidate          | No           | Host definitions and contributions                                            |
| `@becomeopc/dshx/client`                    | API Candidate          | Yes          | Client definitions, Locale/Slot contributions, and React Hooks                |
| `@becomeopc/dshx/api`                       | API Candidate          | Yes          | Shared typed API contracts and error guards                                   |
| `@becomeopc/dshx/settings`                  | API Candidate          | Yes          | Shared Settings contracts                                                     |
| `@becomeopc/dshx/experimental/conversation` | Experimental           | Yes          | Conversation lifecycle and renderer contributions                             |
| `@becomeopc/dshx/tooling`                   | Tooling / Experimental | No           | Compiler, config resolution, compatibility, diagnostics, CLI, and repair APIs |

The removed `@becomeopc/dshx/compiler`, `/compat`, `/cli`, and `/conversation` entries have no runtime aliases. See the migration guide for replacements.

## Ownership boundary

DSHX defines contracts, validates project wiring, runs Vite builds, and generates DSH-loadable modules. Official DSH/Cordis services continue to own registries, scopes, transport, Prompt assembly, Settings persistence, Conversation replay, disposer lifetimes, and HMR cleanup.
