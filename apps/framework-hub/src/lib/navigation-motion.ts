import type { AnyRouter } from "@tanstack/react-router";

export function prefersReducedMotion() {
  return (
    typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

// CSS owns the shared spring curve so native transitions and WAAPI controls settle together.
export const springTiming = {
  duration: 620,
  get easing() {
    return typeof document === "undefined"
      ? "cubic-bezier(0.22, 1.25, 0.36, 1)"
      : getComputedStyle(document.documentElement).getPropertyValue("--motion-spring").trim() ||
          "cubic-bezier(0.22, 1.25, 0.36, 1)";
  },
};

export const navigationViewTransition: Exclude<
  AnyRouter["options"]["defaultViewTransition"],
  boolean | undefined
> = {
  types: ({ fromLocation, toLocation, pathChanged }) => {
    // Initial rendering, hash anchors and background revalidation are not navigation.
    if (!fromLocation || prefersReducedMotion()) return false;
    const direction =
      (toLocation.state.__TSR_index ?? 0) < (fromLocation.state.__TSR_index ?? 0)
        ? "navigate-back"
        : "navigate-forward";
    if (pathChanged) return ["page-navigate", direction];
    if (fromLocation.searchStr !== toLocation.searchStr) return ["content-update", direction];
    return false;
  },
};

export function animateContent(element: HTMLElement | null, page = false, direction = 1) {
  if (!element?.animate || prefersReducedMotion()) return;
  return element.animate(
    [
      {
        transformOrigin: "50% 0%",
        transform: `translateX(${(page ? 36 : 20) * direction}px) scale(${page ? 0.99 : 0.995})`,
      },
      { transformOrigin: "50% 0%", transform: "none" },
    ],
    springTiming,
  );
}
