import { useRouterState } from "@tanstack/react-router";
import { cn } from "@/lib/utils";

/**
 * True while the router is loading exactly this target. The router publishes
 * the pending location as `state.location` until the transition settles, so
 * the comparison identifies the link the visitor clicked.
 */
export function useRoutePending(href: string) {
  return useRouterState({
    select: (state) => state.isLoading && state.location.pathname === href,
  });
}

/**
 * A tracer that laps the element's own rounded border. `radius` must match the
 * element's CSS border radius so the stroke sits exactly on the border.
 */
export function BorderTraceRing({ radius, className }: { radius: number; className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={cn(
        "nav-pending-ring pointer-events-none absolute inset-0 size-full overflow-visible",
        className,
      )}
    >
      <rect
        className="nav-pending-ring__trace"
        x="0"
        y="0"
        width="100%"
        height="100%"
        rx={radius}
        ry={radius}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        pathLength="100"
        strokeDasharray="18 82"
      />
    </svg>
  );
}
