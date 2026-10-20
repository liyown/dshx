# Settings API

**Status: API Candidate**

**Shared entry: `@becomeopc/dshx/settings`**

**React Hook: `@becomeopc/dshx/client`**

DSH 0.2 projects a plugin's `Config` schema into its own Settings form. DSHX keeps one shared schema for the Host and Client and binds the Client hook to the form DSH creates for the plugin's profile entry. There is no namespace, no Host `ctx.settings.register`, and no separate Settings provider.

## `defineSettings(definition)`

```ts
import Schema from "@deepseek-ai/schemastery";
import { defineSettings } from "@becomeopc/dshx/settings";

export const runtimeSettings = defineSettings({
  schema: Schema.object({
    showActivity: Schema.boolean().default(true),
    threshold: Schema.number().default(3).min(0).max(10),
    token: Schema.string().role("secret"),
  }),
});
```

`schema` must be an official Schemastery object schema; its object value becomes the Host Config type. The contract contains only the schema and is safe to share between Host and Client source. `defineSettings()` marks the root schema volatile so every field is live; do not mark individual fields with `.volatile()`.

The contract value itself is only a schema wrapper. Keep the declaration in shared source and pass the same module import to the Host and the Client.

## Declare the Host Config

```ts
import { defineHost } from "@becomeopc/dshx/host";
import { runtimeSettings } from "./settings.js";

export default defineHost({
  config: runtimeSettings,
  setup(ctx, config) {
    const value = config?.get();
    // value updates in place after live Settings edits.
  },
});
```

- `config` is optional and singular. The 0.1 `settings` array is removed.
- DSH exports the schema as the plugin's `Config`; `dshx build` writes that export into the Host artifact.
- `setup` receives the same `config` reference. Read fields through `.get()`; do not destructure once and expect later edits to appear.
- Validation, defaults, layering, persistence, revision fences, and form rendering are owned by DSH. DSHX does not wrap the official form API.

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
interface SettingsState<Value> {
  readonly status: "loading" | "ready" | "unavailable";
  readonly value: Value | undefined;
  /** Composition layer the Host resolved the value over. */
  readonly base: unknown;
  /** Raw user layer; a field's presence marks it overridden. */
  readonly user: unknown;
  readonly revision: number | undefined;
  readonly writable: boolean;
  readonly secrets: readonly {
    readonly path: readonly string[];
    readonly set: boolean;
  }[];
  readonly error: SettingsReadError | null;
  readonly mutation: { readonly pending: boolean };
  set<K extends keyof Value & string>(
    key: K,
    value: Value[K],
  ): Promise<boolean>;
  unset<K extends keyof Value & string>(key: K): Promise<boolean>;
  mutate(
    ops: readonly SettingsPathOp[],
    expectedRevision?: number,
  ): Promise<boolean>;
}
```

`value` is the plain Config value DSH serializes to the Client. Secret fields are removed from the wire; use `secrets` to learn which schema positions have a value without reading it.

`set` and `unset` resolve to whether the Host accepted the write. `mutate` applies ordered `set`/`unset` operations as one revision-fenced write; pass the last observed `revision` to reject stale writes. Mutations are not optimistic, do not retain submitted values, and do not retry. Concurrent writes keep `mutation.pending` true until all calls settle.

## Read errors and write refusal

| `error.kind`           | Meaning                                                                             |
| ---------------------- | ----------------------------------------------------------------------------------- |
| `provider-unavailable` | `ctx.configForms` is missing; `@deepseek-ai/dsh-client-ui-settings` did not load    |
| `entry-unresolved`     | DSHX could not find the plugin's profile entry, or that entry serves no Config form |
| `decode-failed`        | The served Config value could not be decoded against the schema                     |
| `sync-failed`          | The official Settings mirror reported a synchronization failure                     |

Provider, entry, or writability absence sets `writable: false`; `set`, `unset`, and `mutate` reject before writing. Read errors are snapshot state, not a Hook-local mutation error store.

## Form identity and Client wiring

DSH identifies a Config form by the Host profile Loader entry id (`entry.options.id`), not by the browser module row. `dshx build` scans the project's `dsh.bundle.patch` paths and embeds that id in the Client artifact. Keep the plugin loaded through the entry declared in its patch; otherwise the form cannot be resolved and the hook reports `entry-unresolved`.

If `useSettings` survives final tree-shaking, compiler module metadata adds the `configForms` service and reports the `client:config-forms` capability. The project must declare `@deepseek-ai/dsh-client-ui-settings` in `dsh.client.inject`; `dshx check` reports a missing edge and `build` is authoritative. Multiple components using the same contract reuse the same official Config form inside the current Client Fiber.
