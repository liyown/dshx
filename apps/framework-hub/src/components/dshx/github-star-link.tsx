import { Github, Star } from "lucide-react";
import { m, useScroll, useTransform } from "motion/react";
import { useEffect, useState } from "react";

import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n/use-i18n";
import { useHydratedReducedMotion } from "./use-hydrated-reduced-motion";

const repositoryUrl = "https://github.com/liyown/dshx";
const repositoryApiUrl = "/api/github-stars";
const cacheKey = "dshx:github-stars";
const cacheTtlMs = 6 * 60 * 60 * 1_000;

type CachedStars = {
  count: number;
  capturedAt: number;
};

function readCachedStars() {
  try {
    const cached = JSON.parse(
      window.localStorage.getItem(cacheKey) ?? "null",
    ) as CachedStars | null;
    if (
      cached &&
      Number.isInteger(cached.count) &&
      cached.count >= 0 &&
      Date.now() - cached.capturedAt < cacheTtlMs
    ) {
      return cached.count;
    }
  } catch {
    // A disabled or malformed local cache should not affect navigation.
  }
  return null;
}

function writeCachedStars(count: number) {
  try {
    window.localStorage.setItem(
      cacheKey,
      JSON.stringify({ count, capturedAt: Date.now() } satisfies CachedStars),
    );
  } catch {
    // The live value is an enhancement; the Star action remains available without storage.
  }
}

function formatStars(count: number, locale: string) {
  return new Intl.NumberFormat(locale === "zh" ? "zh-CN" : "en", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(count);
}

function StarCallout({ children }: { children: string }) {
  const reduceMotion = useHydratedReducedMotion();
  const { scrollY } = useScroll();
  const opacity = useTransform(scrollY, [0, 96], [1, 0]);
  const y = useTransform(scrollY, [0, 96], [0, -10]);

  return (
    <m.div
      aria-hidden
      className="github-star-callout hidden xl:block"
      style={{ opacity, y: reduceMotion ? 0 : y }}
    >
      <span className="absolute top-6 right-4 font-hand text-[21px] leading-none font-semibold whitespace-nowrap">
        {children}
      </span>
    </m.div>
  );
}

export function GitHubStarLink({ compact = false }: { compact?: boolean }) {
  const { locale, t } = useI18n();
  const [stars, setStars] = useState<number | null>(null);

  useEffect(() => {
    const cached = readCachedStars();
    if (cached !== null) {
      setStars(cached);
      return;
    }

    const controller = new AbortController();
    void fetch(repositoryApiUrl, {
      headers: { Accept: "application/vnd.github+json" },
      signal: controller.signal,
    })
      .then((response) => {
        if (!response.ok) throw new Error(`GitHub responded with ${response.status}`);
        return response.json() as Promise<{ count?: unknown }>;
      })
      .then((result) => {
        if (typeof result.count !== "number") return;
        setStars(result.count);
        writeCachedStars(result.count);
      })
      .catch(() => undefined);

    return () => controller.abort();
  }, []);

  const visibleValue = stars === null ? t("nav.star") : formatStars(stars, locale);

  return (
    <div className={cn("relative", compact ? "w-fit" : "hidden lg:block")}>
      <a
        href={repositoryUrl}
        target="_blank"
        rel="noreferrer"
        aria-label={t("nav.starOnGitHub")}
        className="group flex h-9 items-center gap-1.5 rounded-[10px] border border-border bg-background py-1 pr-3 pl-1 transition-colors duration-150 hover:border-border-strong hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        <span className="flex size-7 items-center justify-center rounded-[7px] bg-accent-soft/70 text-foreground transition-colors group-hover:bg-accent-soft">
          <Github className="size-4" strokeWidth={1.9} />
        </span>
        <Star className="size-3.5 text-muted-foreground transition-colors group-hover:text-accent" />
        <span className="min-w-7 text-center text-[12.5px] font-medium text-foreground tabular-nums">
          {visibleValue}
        </span>
      </a>

      {!compact ? <StarCallout>{t("nav.leaveAStar")}</StarCallout> : null}
    </div>
  );
}
