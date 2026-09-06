import { useRouter, useRouterState } from "@tanstack/react-router";
import { LoaderCircle } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";
import { animateContent, navigationViewTransition } from "@/lib/navigation-motion";
import { useI18n } from "@/lib/i18n/use-i18n";
import { useHydratedReducedMotion } from "./use-hydrated-reduced-motion";

export function RouteMotion({ children }: { children: ReactNode }) {
  const router = useRouter();
  const ref = useRef<HTMLDivElement>(null);
  const reducedMotion = useHydratedReducedMotion();

  useEffect(() => {
    router.update({
      context: router.options.context,
      defaultViewTransition: reducedMotion ? false : navigationViewTransition,
    });
  }, [router, reducedMotion]);

  useEffect(() => {
    let animation: Animation | undefined;
    const unsubscribe = router.subscribe(
      "onResolved",
      ({ fromLocation, toLocation, pathChanged }) => {
        if (!fromLocation || reducedMotion || typeof document.startViewTransition === "function")
          return;
        if (!pathChanged && fromLocation.searchStr === toLocation.searchStr) return;
        animation?.cancel();
        const results = !pathChanged
          ? ref.current?.querySelector<HTMLElement>("[data-route-results]")
          : null;
        const direction =
          (toLocation.state.__TSR_index ?? 0) < (fromLocation.state.__TSR_index ?? 0) ? -1 : 1;
        animation = animateContent(results ?? ref.current, pathChanged, direction);
      },
    );
    return () => {
      unsubscribe();
      animation?.cancel();
    };
  }, [router, reducedMotion]);

  return (
    <div ref={ref} className="route-motion-content">
      {children}
    </div>
  );
}

export function NavigationProgress() {
  const { locale } = useI18n();
  const pending = useRouterState({ select: (state) => state.isLoading });
  if (!pending) return null;
  return (
    <div className="navigation-progress" role="status">
      <LoaderCircle className="size-3.5 motion-safe:animate-spin" aria-hidden="true" />
      <span>{locale === "zh" ? "正在加载…" : "Loading…"}</span>
    </div>
  );
}
