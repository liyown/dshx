import { AsyncLocalStorage } from "node:async_hooks";

const guards = new AsyncLocalStorage<() => Promise<unknown>>();

/** Scope ownership checks to an invocation, including every batch request. */
export function withOperationGuard<T>(
  guard: (() => Promise<unknown>) | undefined,
  operation: () => Promise<T>,
): Promise<T> {
  return guard ? guards.run(guard, operation) : operation();
}

export async function verifyOperationGuard(method = "GET"): Promise<void> {
  if (!["GET", "HEAD", "OPTIONS"].includes(method.toUpperCase()))
    await guards.getStore()?.();
}
