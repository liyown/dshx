import { Link, useRouterState } from "@tanstack/react-router";
import { LoaderCircle } from "lucide-react";
import type { CSSProperties, MouseEvent, ReactNode } from "react";
import { localizedPath } from "@/lib/i18n";
import { useI18n } from "@/lib/i18n/use-i18n";
import { cn } from "@/lib/utils";
import { useHydratedReducedMotion } from "./use-hydrated-reduced-motion";

// Encode every code point, so slugs remain unique, valid CSS identifiers.
export function pluginTransitionStyle(slug: string): CSSProperties {
  const id = Array.from(slug, (character) => character.codePointAt(0)!.toString(16)).join("-");
  return {
    "--plugin-transition-surface": `plugin-${id}-surface`,
    "--plugin-transition-glyph": `plugin-${id}-glyph`,
    "--plugin-transition-title": `plugin-${id}-title`,
  } as CSSProperties;
}

function preparePluginTransition(event: MouseEvent<HTMLAnchorElement>) {
  if (
    event.defaultPrevented ||
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey ||
    (event.currentTarget.target && event.currentTarget.target !== "_self")
  )
    return;

  // Only the clicked occurrence participates: a plugin can appear more than
  // once on a page. Keep navigation itself owned by the router's native Link.
  document.querySelectorAll("[data-plugin-transition-source]").forEach((element) => {
    element.removeAttribute("data-plugin-transition-source");
  });
  event.currentTarget
    .closest("[data-plugin-card]")
    ?.setAttribute("data-plugin-transition-source", "");
}

export function PluginNavigationLink({
  slug,
  name,
  className,
  children,
}: {
  slug: string;
  name: string;
  className?: string;
  children?: ReactNode;
}) {
  const { locale } = useI18n();
  const reducedMotion = useHydratedReducedMotion();
  const href = localizedPath(locale, `/plugins/${slug}`);
  const isLoading = useRouterState({
    select: (state) => state.isLoading && state.location.pathname === href,
  });

  return (
    <>
      <Link
        to={href}
        aria-label={name}
        aria-busy={isLoading || undefined}
        preload="intent"
        viewTransition={reducedMotion ? false : { types: ["plugin-open"] }}
        onClick={preparePluginTransition}
        className={cn(className, "plugin-navigation-link")}
      >
        {children}
      </Link>
      {isLoading ? (
        <span className="plugin-navigation-status" role="status">
          <LoaderCircle className="size-3.5 motion-safe:animate-spin" aria-hidden="true" />
          <span>{locale === "zh" ? "正在打开插件…" : "Opening plugin…"}</span>
        </span>
      ) : null}
    </>
  );
}
