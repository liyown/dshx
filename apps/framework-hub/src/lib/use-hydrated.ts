import { useSyncExternalStore } from "react";

const subscribe = () => () => undefined;

/**
 * Keeps browser-only session state out of the server/client hydration pass.
 * Better Auth may already have a cached session in the browser while SSR always
 * begins without it, so auth-dependent controls render only after hydration.
 */
export function useHydrated() {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}
