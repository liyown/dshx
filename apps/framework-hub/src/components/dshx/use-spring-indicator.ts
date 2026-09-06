import { useCallback, useRef } from "react";

import { prefersReducedMotion, springTiming } from "@/lib/navigation-motion";

type IndicatorState = {
  element: HTMLSpanElement | null;
  previous: { key: string; rect: DOMRect; group: HTMLElement | null } | null;
  dispose: (() => void) | null;
};

function layoutSize(element: HTMLSpanElement) {
  const button = element.parentElement;
  const group = button?.parentElement;
  return [
    element.offsetWidth,
    element.offsetHeight,
    button?.offsetLeft,
    button?.offsetTop,
    group?.clientWidth,
    group?.clientHeight,
  ];
}

/** Move the existing active underline without replacing tabs or changing SSR content. */
export function useSpringIndicator(activeKey: string) {
  const state = useRef<IndicatorState>({ element: null, previous: null, dispose: null });

  return useCallback(
    (element: HTMLSpanElement | null) => {
      const current = state.current;
      if (!element) {
        // Read the running animation before React removes the previous active span.
        // Rapid switching therefore continues from the position currently on screen.
        if (current.element?.isConnected) {
          current.previous = {
            key: activeKey,
            rect: current.element.getBoundingClientRect(),
            group: current.element.parentElement?.parentElement ?? null,
          };
        }
        current.dispose?.();
        current.dispose = null;
        current.element = null;
        return;
      }

      current.element = element;
      const group = element.parentElement?.parentElement ?? null;
      const target = element.getBoundingClientRect();
      const previous = current.previous;
      let animation: Animation | undefined;

      if (
        previous &&
        previous.key !== activeKey &&
        previous.group === group &&
        previous.rect.width > 0 &&
        target.width > 0 &&
        element.animate &&
        !prefersReducedMotion()
      ) {
        const x = previous.rect.left - target.left;
        const y = previous.rect.top - target.top;
        const scale = previous.rect.width / target.width;
        try {
          animation = element.animate(
            [
              { transform: `translate(${x}px, ${y}px) scaleX(${scale})`, transformOrigin: "0 0" },
              { transform: "none", transformOrigin: "0 0" },
            ],
            springTiming,
          );
        } catch {
          // Unsupported animation timing must leave the active underline usable.
        }
      }

      const stop = () => {
        animation?.cancel();
        animation = undefined;
      };
      const media = window.matchMedia("(prefers-reduced-motion: reduce)");
      const onMotionChange = () => {
        if (media.matches) stop();
      };
      let size = layoutSize(element);
      const observer =
        typeof ResizeObserver === "undefined"
          ? null
          : new ResizeObserver(() => {
              const next = layoutSize(element);
              if (next.some((value, index) => value !== size[index])) stop();
              size = next;
            });
      observer?.observe(element);
      if (group) observer?.observe(group);
      // Snap to natural layout when tabs wrap or the viewport/font metrics change.
      window.addEventListener("resize", stop);
      media.addEventListener("change", onMotionChange);
      current.dispose = () => {
        stop();
        observer?.disconnect();
        window.removeEventListener("resize", stop);
        media.removeEventListener("change", onMotionChange);
      };
    },
    [activeKey],
  );
}
