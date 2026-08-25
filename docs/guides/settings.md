# Settings

Settings use a define-once model: one portable contract carries the namespace, official Schemastery schema, application mode, and optional Client decoder. The Host claims ownership once; Client components consume the same contract directly.

## Define one contract

```ts
// settings.ts
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

The namespace must match `/^[a-z][a-z0-9-]*$/`. `applies` is `"live"` by default and may be `"restart"`. The contract preserves the schema object by identity, and the schema output becomes its Host value type.

Keep this shared module browser-safe. `namespace`, `schema`, `applies`, and `client.decode` may enter a Client artifact. Host-only defaults, validation, setup, and service access belong in the Host facet described below.

## Claim Host ownership

The common form is one line:

```ts
import { defineHost } from "@becomeopc/dshx/host";
import { runtimeSettings } from "./settings.js";

export default defineHost({ settings: [runtimeSettings] });
```

This automatically injects the official `settings` service. DSHX registers the namespace, schema, and `applies` mode with the official Settings provider.

Use `.host()` only for private Host behavior:

```ts
export default defineHost({
  settings: [
    runtimeSettings.host({
      base: { showActivity: true },
      validate(value) {
        if (typeof value.showActivity !== "boolean") {
          throw new TypeError("showActivity must be boolean");
        }
      },
      setup(scope) {
        return scope.watch((next) => {
          console.info("showActivity", next.showActivity);
        });
      },
    }),
  ],
});
```

`base`, `validate`, and `setup` are absent from the portable contract and cannot leak into the Client bundle. `setup` is synchronous and may return a disposer; DSHX gives that disposer to `ctx.effect()`.

The official provider owns defaults-to-base-to-user layering, schema validation, revisions, watch behavior, duplicate namespaces, replacement, persistence, and disposal.

## Read and write from React

There is no `ClientDefinition.settings` field. Call `useSettings(contract)` from a DSHX Client Slot or Conversation renderer:

```tsx
import { useSettings } from "@becomeopc/dshx/client";
import { runtimeSettings } from "./settings.js";

export function ActivityToggle() {
  const settings = useSettings(runtimeSettings);
  const visible = settings.value?.showActivity ?? true;

  return (
    <div>
      <button
        type="button"
        disabled={!settings.writable || settings.mutation.pending}
        onClick={() => {
          void settings.set("showActivity", !visible);
        }}
      >
        {settings.mutation.pending
          ? "Saving…"
          : visible
            ? "Hide activity"
            : "Show activity"}
      </button>
      {settings.error ? <p role="status">{settings.error.message}</p> : null}
      {settings.mutation.error ? (
        <button type="button" onClick={settings.mutation.clearError}>
          Clear write error
        </button>
      ) : null}
    </div>
  );
}
```

`useSettings` is backed by `useSyncExternalStore`. Its result contains:

| Field               | Meaning                                                     |
| ------------------- | ----------------------------------------------------------- |
| `status`            | `loading`, `ready`, or `unavailable`                        |
| `value`             | Decoded Client value, or `undefined` before one is accepted |
| `base`, `user`      | Official scope layer snapshots                              |
| `revision`          | Current official revision when known                        |
| `writable`          | Whether the bound scope currently accepts writes            |
| `mode`              | Official `host` or `memory` mode                            |
| `applies`           | Registered `live` or `restart` mode                         |
| `secrets`           | Redacted secret paths and configured state                  |
| `error`             | Read, binding, decoding, or synchronization problem         |
| `mutation`          | Hook-local `pending`, `error`, and `clearError()` state     |
| `set(field, value)` | Set one top-level schema field                              |
| `unset(field)`      | Remove one top-level user override                          |

Writes are not optimistic, are not retried automatically, and do not store the attempted value in DSHX state. Multiple components using the same contract identity reuse one official bound scope in the current Client Fiber, while each Hook call keeps its own mutation state. The official shared mirror remains the source of Settings data.

## Errors

Read errors use explicit kinds:

| Kind                     | Meaning                                                            |
| ------------------------ | ------------------------------------------------------------------ |
| `provider-unavailable`   | The required Client Settings provider is absent                    |
| `namespace-unregistered` | No active Host owns the contract namespace                         |
| `decode-failed`          | The Client decoder rejected or failed to decode the redacted value |
| `sync-failed`            | The official shared mirror reported a synchronization failure      |

An unregistered namespace refuses writes instead of behaving like an ordinary empty value. Write failures reject the returned Promise and appear in `mutation.error`; call `clearError()` only to clear that Hook-local error.

## Secrets

When a schema contains `role("secret")`, provide a Client decoder that removes secret values:

```ts
const secureSettings = defineSettings({
  namespace: "my-plugin-secure",
  schema: Schema.object({
    showActivity: Schema.boolean().default(true),
    token: Schema.string().role("secret"),
  }),
  client: {
    decode(value): { showActivity: boolean } | undefined {
      if (
        typeof value !== "object" ||
        value === null ||
        !("showActivity" in value)
      ) {
        return undefined;
      }
      return { showActivity: Boolean(value.showActivity) };
    },
  },
});
```

The decoded Client type exposes `showActivity` but not `token`. Mutations still use the Host schema type, so `settings.set("token", value)` and `settings.unset("token")` remain available without making the secret readable. Host registration diagnoses a secret schema that lacks `client.decode`.

DSHX does not persist redacted values, implement secret storage, or infer whether a secret is configured. Those are official Settings responsibilities; the Client sees only the official redacted view and configured state.

## Automatic Client wiring

If `useSettings` survives tree-shaking, the Client compiler:

- adds and deduplicates the `settingsScope` Cordis injection;
- requires `@deepseek-ai/dsh-client-ui-settings` in `dsh.client.inject`;
- provides the Settings runtime context to retained Slot components; and
- binds each contract lazily by object identity.

If the Hook is removed from the final artifact, it adds no Settings capability. `dshx check` previews the required package edge; `build` and `dev` authoritatively verify the tree-shaken artifact. Client Fiber or Cordis disposal releases the bound official scope and the identity cache.

Read [Compatibility](../compatibility.md) for the supported DSH boundary and provider dependency rules.
