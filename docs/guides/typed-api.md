# Typed Host/Client API

`defineApi` creates a portable unary contract shared by Host handlers and Client Hooks. DSHX supplies type inference, validation, transport wiring, cancellation, and diagnostics over the official Connection provider; it does not introduce a second event or action bus.

## Define the contract once

```ts
// status-api.ts
import { defineApi, method } from "@becomeopc/dshx/api";

export interface Status {
  readonly project: string;
  readonly requestCount: number;
}

export const statusApi = defineApi({
  id: "status",
  version: 1,
  methods: {
    get: method<void, Status>(),
    refresh: method<{ force?: boolean }, Status>(),
  },
});
```

The `id` is a stable single path segment containing letters, digits, `.`, `_`, or `-`. `version` is a positive integer and participates in every request and response. Method input and output must be JSON-serializable and are limited to 1 MiB each.

Add Standard Schema-compatible validators when runtime validation or transformation is required:

```ts
const update = method<UpdateInput, UpdateResult>({
  input: updateInputSchema,
  output: updateResultSchema,
});
```

Validation runs at the Client and Host boundaries. A schema result with `issues` fails the contract; a schema's transformed `value` becomes the value passed across the boundary.

## Implement it on the Host

```ts
import { defineHost } from "@becomeopc/dshx/host";
import { statusApi } from "./status-api.js";

let requestCount = 0;

export default defineHost({
  api: statusApi.host({
    async get({ ctx, signal }) {
      signal.throwIfAborted();
      void ctx;
      return { project: "my-plugin", requestCount: ++requestCount };
    },
    async refresh({ input, signal }) {
      signal.throwIfAborted();
      return {
        project: input.force ? "my-plugin (refreshed)" : "my-plugin",
        requestCount: ++requestCount,
      };
    },
  }),
});
```

Every declared method requires one handler. Its context contains typed `input`, the active Cordis `ctx`, and the request `AbortSignal`. Use `apis: [first.host(...), second.host(...)]` when one Host implements several contracts.

Non-empty API registrations automatically inject `connection`. Registration and removal belong to the Host Fiber lifecycle. The default Connection authority is `loopback`; pass `{ authority: "trusted-host" }` as the second argument—`statusApi.host(handlers, { authority: "trusted-host" })`—only when that official transport policy is intentional.

Transport authority is not business authorization. Access checks, revision fences, idempotency, durable outcomes, and business cancellation remain explicit Host handler responsibilities.

## Call it from a Client component

There is normally no API declaration in `defineClient`. Use the shared contract directly:

```tsx
import { useApi, useQuery } from "@becomeopc/dshx/client";
import { statusApi } from "./status-api.js";

export function StatusView() {
  const api = useApi(statusApi);
  const status = useQuery(statusApi, "get");

  if (status.loading && status.data === undefined) return <p>Connecting…</p>;
  if (status.error) {
    return <button onClick={status.retry}>Retry</button>;
  }

  return (
    <button
      onClick={() => {
        void api.refresh({ force: true }).then(() => status.retry());
      }}
    >
      Requests: {status.data?.requestCount ?? 0}
    </button>
  );
}
```

`useApi(contract)` returns one typed method per contract method plus a `safe` form:

```ts
const controller = new AbortController();

await api.refresh({ force: true }, { signal: controller.signal });

const result = await api.safe.refresh({ force: true });
if (!result.ok) {
  console.error(result.error.kind, result.error.retryable);
}
```

No-input methods accept `undefined` before call options: `api.get(undefined, { signal })`.

`useQuery(contract, method, input?, options?)` invokes a method from React and returns `{ loading, data, error, retry }`. It aborts an in-flight request when the Host generation disappears and retries after the official Connection reports a new Host generation. It preserves the last successful `data` while a refresh is loading.

## Error model

Direct methods reject with `ApiError`. Safe methods return `{ ok: true, value }` or `{ ok: false, error }`.

| Kind          | Meaning                                                | Retryable by default |
| ------------- | ------------------------------------------------------ | -------------------- |
| `unavailable` | The Connection provider is absent                      | yes                  |
| `transport`   | The official transport call failed                     | yes                  |
| `remote`      | A Host handler failed                                  | no                   |
| `contract`    | Validation, serialization, method, or version mismatch | no                   |
| `aborted`     | Caller or lifecycle cancellation                       | no                   |

`ApiError` also includes `apiId`, `method`, `retryable`, and an optional `remoteCode`. DSHX never automatically retries imperative `useApi` calls.

## Automatic Client wiring

If `useApi` or `useQuery` survives tree-shaking, the Client compiler:

- adds and deduplicates the `connection` Cordis injection;
- requires `@deepseek-ai/dsh-client-connection` in `dsh.client.inject`;
- provides the API runtime context to retained Slot components; and
- lazily reuses a bound client by contract identity within the current Client Fiber.

If both Hooks are removed from the final artifact, they add no Connection capability. The older `ClientDefinition.api` and `ClientDefinition.apis` fields remain compatible eager-binding forms, but new code should normally rely on retained Hook inference.

## Conversation interaction

A Conversation renderer is an ordinary React component, so it calls Host behavior with `useApi` or `useQuery`. API results do not mutate assembled Conversation state implicitly. Durable, replayable UI state must still come from the official Session log and assembler.

See [Conversation components](./conversation.md) for the complete lifecycle and [Compatibility](../compatibility.md) for Connection provider requirements.
