# DSHX

**Build, check, and ship typed DeepSeek Harness plugins.**

[![CI](https://github.com/liyown/dshx/actions/workflows/ci.yml/badge.svg)](https://github.com/liyown/dshx/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/@becomeopc/dshx?label=%40becomeopc%2Fdshx)](https://www.npmjs.com/package/@becomeopc/dshx)
[![create-dshx](https://img.shields.io/npm/v/create-dshx?label=create-dshx)](https://www.npmjs.com/package/create-dshx)
[![Node.js](https://img.shields.io/badge/node-%5E22.19%20%7C%7C%20%3E%3D24-339933?logo=nodedotjs&logoColor=white)](./package.json)
[![License](https://img.shields.io/github/license/liyown/dshx)](./LICENSE)

[简体中文](./README.zh-CN.md) · [Documentation](./docs/index.md) · [Framework Hub](https://dshx.io) · [Roadmap](./ROADMAP.md)

DSHX is a build-time toolchain for out-of-tree [DeepSeek Harness](https://github.com/deepseek-ai/DeepSeek-Harness) plugins. It provides typed Host/Client authoring, a bounded Vite build, offline diagnostics, Profile-aware development, and reproducible templates. Official DSH/Cordis services still own execution, registries, scopes, transport, persistence, assembly, HMR, and disposal.

## Create a project

```bash
pnpm create dshx my-plugin
cd my-plugin
pnpm check
pnpm dev
```

The default is a minimal `starter + css-modules` project with one Host Tool and one visible Client Slot. Generate the complete Candidate API example with optional Tailwind:

```bash
pnpm create dshx my-plugin --template showcase --style tailwind
```

Templates are `starter | showcase`; styles are `css-modules | tailwind | none`. Tailwind uses the standard v4 Vite plugin, a `dshx:` prefix, and no Preflight.

## Authoring example

```ts
// src/api/status.ts
import { defineApi, method } from "@becomeopc/dshx/api";

export const statusApi = defineApi({
  id: "status",
  version: 1,
  methods: {
    get: method<void, { readonly ready: boolean }>(),
  },
});
```

```ts
// src/host.ts
import { defineHost } from "@becomeopc/dshx/host";
import { statusApi } from "./api/status.js";

export default defineHost({
  apis: [
    statusApi.host({
      get: () => ({ ready: true }),
    }),
  ],
});
```

```tsx
// src/client.tsx
import type {} from "@deepseek-ai/dsh-client-ui-sidebar/client";
import { defineClient, defineSlot, useApiQuery } from "@becomeopc/dshx/client";
import { statusApi } from "./api/status.js";

function Status() {
  const query = useApiQuery(statusApi, "get", { enabled: true });
  if (query.status === "pending") return <p>{query.fetchStatus}</p>;
  if (query.status === "error")
    return <button onClick={query.refetch}>Retry</button>;
  return <p>{query.data.ready ? "Ready" : "Unavailable"}</p>;
}

const statusSlot = defineSlot("sidebar.footer.action", {
  id: "my-plugin.status",
  order: 0,
  component: Status,
});

export default defineClient({ slots: [statusSlot] });
```

`useApiQuery` surviving final tree-shaking drives the `connection` capability automatically; Client definitions do not repeat API contracts or Settings ownership.

## Public surfaces

| Entry                           | Status                 | Purpose                                                              |
| ------------------------------- | ---------------------- | -------------------------------------------------------------------- |
| `@becomeopc/dshx` and `/config` | API Candidate          | Browser-safe `defineConfig` and `DshxConfig` only                    |
| `/host`                         | API Candidate          | Host definitions, Tools, Commands, Prompt contributions              |
| `/client`                       | API Candidate          | Client definitions, Slots, API/Settings Hooks                        |
| `/api`                          | API Candidate          | Shared typed unary API contracts and opaque errors                   |
| `/settings`                     | API Candidate          | Shared Schemastery-backed Settings contracts                         |
| `/experimental/conversation`    | Experimental           | Pure official event lifecycle plus React renderer                    |
| `/tooling`                      | Tooling / Experimental | Node-only compiler, compatibility, diagnostics, CLI, and repair APIs |

API Candidate is the intended `0.1.x` authoring shape; it is not a 1.0 stability guarantee. See the [0.1.1 to 0.1.2 migration](./docs/migrations/0.1.1-to-0.1.2.md) for removed fields, entries, and aliases.

## Technical documentation

| Chapter                                       | APIs and behavior                                                  |
| --------------------------------------------- | ------------------------------------------------------------------ |
| [Host](./docs/guides/host.md)                 | `defineHost`, contribution order, injects, lifecycle               |
| [Client and Slots](./docs/guides/client.md)   | `defineClient`, `defineSlot`, official props, capability inference |
| [Typed API](./docs/guides/api.md)             | Standard Schema, handlers, imperative calls, `useApiQuery`, errors |
| [Settings](./docs/guides/settings.md)         | contract, Host facet, decoder, secrets, Hook state and mutations   |
| [Prompt](./docs/guides/prompt.md)             | Section, Context, ordering, assembly ownership                     |
| [Conversation](./docs/guides/conversation.md) | experimental `initial/reduce/project/render` lifecycle             |
| [Build](./docs/guides/build.md)               | bounded Vite plugins, CSS/assets, Tailwind, declarations, watch    |
| [Creator](./docs/guides/creator.md)           | template/style matrix and programmatic generation                  |
| [Tooling](./docs/guides/tooling.md)           | programmatic build/watch, compatibility, diagnostics, repair       |

Also see the [CLI reference](./docs/cli-reference.md), [Compatibility](./docs/compatibility.md), and [Architecture](./docs/architecture.md).

## CLI

```bash
dshx check                 # offline config, manifest, migration, compatibility, TypeScript
dshx check --runtime       # additionally require Profile, Composition, bridge, runtime readiness
dshx build                 # typecheck, then build Host and Client artifacts
dshx dev                   # Vite build-watch plus official DSH development session
dshx inspect slots
dshx add ui --slot <slot-name>
```

`check` is read-only unless `--fix` is explicit. `build` does not rewrite source or manifest metadata. `inspect` requires a supported running Composition. See the [CLI reference](./docs/cli-reference.md) for all commands and JSON fields.

## Compatibility

The active `protocol-1` adapter covers `>=0.1.0-rc.8 <0.2.0-0`; verified real-runtime boundaries are `0.1.0-rc.8` and `0.1.1-rc.2`. Plugin public support belongs in `peerDependencies`; one concrete development version belongs in `devDependencies`.

Conversation remains Experimental because the published protocol has no out-of-tree durable event-vocabulary registry. It accepts official `SessionEventMap` keys only.

## Develop this repository

```bash
pnpm install --frozen-lockfile
pnpm check:all
pnpm smoke:packages
pnpm smoke:dsh -- --version 0.1.0-rc.8
pnpm smoke:dsh -- --version 0.1.1-rc.2
```

Read [Contributing](./CONTRIBUTING.md), the [dependency policy](./docs/dependency-policy.md), and [Security](./SECURITY.md) before opening a change.

## License

[MIT](./LICENSE) © DSHX contributors.
