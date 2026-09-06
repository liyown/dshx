import { useLayoutEffect, useRef } from "react";
import { animateContent } from "@/lib/navigation-motion";
import { useHydratedReducedMotion } from "./use-hydrated-reduced-motion";

/** Animate committed content without unmounting panels, resetting focus, or hiding SSR HTML. */
export function useContentMotion<T extends HTMLElement>(key: string) {
  const ref = useRef<T>(null);
  const previousKey = useRef(key);
  const reducedMotion = useHydratedReducedMotion();

  useLayoutEffect(() => {
    const changed = previousKey.current !== key;
    previousKey.current = key;
    if (!changed || reducedMotion) return;
    const animation = animateContent(ref.current);
    return () => animation?.cancel();
  }, [key, reducedMotion]);

  return ref;
}
