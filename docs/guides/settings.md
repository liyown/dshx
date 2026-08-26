# Settings API

**Status: API Candidate**

**Shared entry: `@becomeopc/dshx/settings`**

**React Hook: `@becomeopc/dshx/client`**

## `defineSettings(definition)`

```ts
import Schema from "@deepseek-ai/schemastery";
import { defineSettings } from "@becomeopc/dshx/settings";

export const runtimeSettings = defineSettings({
  namespace: "my-plugin",
  schema: Schema.object({
    showActivity: Schema.boolean().default(true),
  }),
  applies: "live",
});
```

`namespace` must match `/^[a-z][a-z0-9-]*$/`. `schema` must be an official Schemastery object schema; its object value becomes the Host value type. `applies` is `'live' | 'restart'` and defaults to `'live'`. The contract preserves the namespace, schema identity, and inferred types and is safe to share between Host and Client source.

## Claim Host ownership

Register the contract directly for the normal case:

```ts
import { defineHost } from "@becomeopc/dshx/host";
import { runtimeSettings } from "./settings.js";

export default defineHost({
  settings: [runtimeSettings],
});
```

Use `.host()` only for Host-private behavior:

```ts
const ownedSettings = runtimeSettings.host({
  base: { showActivity: true },
  validate(value) {
    if (typeof value.showActivity !== "boolean") throw new Error("invalid");
  },
  setup(scope, ctx) {
    return scope.watch((next) => {
      void next;
      void ctx;
    });
  },
});

export default defineHost({ settings: [ownedSettings] });
```

`base`, `validate`, and `setup` stay out of the shared contract and Client bundle. `setup` is synchronous and may return a disposer; DSHX passes it to `ctx.effect()`. The official Settings provider owns schema validation, defaults/base/user layering, revision fences, watches, update/replace behavior, persistence, recovery, duplicate namespaces, and disposal.

## Client-safe decoding

Without a decoder, Client and Host values have the same type. A decoder can infer a narrower redacted Client value:

```ts
const credentials = defineSettings({
  namespace: "my-plugin-credentials",
  schema: Schema.object({
    enabled: Schema.boolean().default(true),
    token: Schema.string().role("secret"),
  }),
  client: {
    decode(value): { enabled: boolean } {
      if (
        typeof value !== "object" ||
        value === null ||
        !("enabled" in value)
      ) {
        throw new Error("invalid redacted settings");
      }
      return { enabled: Boolean(value.enabled) };
    },
  },
});
```

Decoder failure must throw. Returning `undefined` is rejected and is never a failure sentinel.

Secret contracts require a decoder. Secret traversal is fail-closed: only plain object, dict, and array paths that the official provider can redact safely are accepted. A reachable secret under a union, intersection, transform, or unknown container is rejected at Host registration even when a decoder exists.

## `useSettings(contract)`

```tsx
import { useSettings } from "@becomeopc/dshx/client";
import { runtimeSettings } from "./settings.js";

function ActivityToggle() {
  const settings = useSettings(runtimeSettings);
  const visible = settings.value?.showActivity ?? true;

  return (
    <button
      type="button"
      disabled={!settings.writable || settings.mutation.pending}
      onClick={() => void settings.set("showActivity", !visible)}
    >
      {settings.mutation.pending
        ? "Saving…"
        : visible
          ? "Hide activity"
          : "Show activity"}
    </button>
  );
}
```

```ts
interface SettingsState<HostValue, ClientValue> {
  readonly status: "loading" | "ready" | "unavailable";
  readonly value: ClientValue | undefined;
  readonly revision: number | undefined;
  readonly writable: boolean;
  readonly mode: "host" | "memory";
  readonly applies: "live" | "restart";
  readonly secrets: readonly {
    readonly path: readonly string[];
    readonly set: boolean;
  }[];
  readonly error: SettingsReadError | null;
  readonly mutation: { readonly pending: boolean };
  set<K extends keyof HostValue & string>(
    key: K,
    value: HostValue[K],
  ): Promise<void>;
  unset<K extends keyof HostValue & string>(key: K): Promise<void>;
}
```

`value` uses the decoder's Client type. `set` and `unset` use the Host schema type, so a secret field can be written or cleared without becoming readable. Mutations support official top-level Client-scope fields only.

The mutation Promise resolves when the official queue and recovery sequence finishes; it does not promise that a remote persistence backend committed the value. Mutations are not optimistic, do not retain submitted values, and do not retry. Concurrent writes increment a Hook-local pending counter, so `mutation.pending` stays true until all calls settle.

## Read errors and write refusal

| `error.kind`             | Meaning                                                     |
| ------------------------ | ----------------------------------------------------------- |
| `provider-unavailable`   | The official `settingsScope` service is missing             |
| `namespace-unregistered` | The active Host did not register this namespace             |
| `decode-failed`          | The redacted Client value could not be decoded              |
| `sync-failed`            | The official shared mirror reported synchronization failure |

Provider or namespace absence sets `writable: false`; `set`/`unset` reject before calling the official mutation method. Read errors are snapshot state, not a Hook-local mutation error store.

## Automatic Client wiring

If `useSettings` survives final tree-shaking, compiler module metadata adds the `settingsScope` service. The project must declare `@deepseek-ai/dsh-client-ui-settings` in `dsh.client.inject`; `dshx check` reports a missing edge and `build` is authoritative. Multiple components using the same contract reuse one official bound scope inside the current Client Fiber.
