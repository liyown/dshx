import { Link, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Container, Wordmark, XMark, ButtonLink } from "./primitives";
import { cn } from "@/lib/utils";
import { localizedPath } from "@/lib/i18n";
import { useI18n } from "@/lib/i18n/use-i18n";
import { MobileSessionLink, SessionLink } from "@/components/community/auth-controls";
import { GitHubStarLink } from "./github-star-link";
import { ThemeToggle } from "./theme-toggle";

const links = [
  { key: "nav.plugins", to: "/plugins" },
  { key: "nav.operations", to: "/operations" },
  { key: "nav.docs", to: "/docs" },
  { key: "nav.changelog", to: "/changelog" },
] as const;

export function Nav() {
  const { locale, t } = useI18n();
  const location = useRouterState({ select: (state) => state.location });
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const alternateLocale = locale === "en" ? "zh" : "en";
  const alternateHref =
    localizedPath(alternateLocale, location.pathname) + location.searchStr + location.hash;

  return (
    <header
      className={cn(
        "sticky top-0 z-50 border-b transition-colors duration-200",
        scrolled ? "border-border bg-background/85 backdrop-blur-sm" : "border-transparent",
      )}
    >
      <Container className="flex h-14 items-center justify-between gap-6">
        <Link to={localizedPath(locale, "/")} className="group flex items-center gap-2.5">
          <XMark className="size-[18px] text-foreground transition-transform duration-500 group-hover:rotate-90" />
          <Wordmark />
        </Link>

        <nav className="hidden items-center gap-1 lg:flex">
          {links.map((link) => (
            <Link
              key={link.to}
              to={localizedPath(locale, link.to)}
              className="rounded-md px-2.5 py-1.5 text-[13.5px] text-muted-foreground transition-colors hover:text-foreground"
              activeProps={{ className: "text-foreground" }}
            >
              {t(link.key)}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <GitHubStarLink />
          <SessionLink />
          <ButtonLink to="/docs" variant="primary" className="h-9">
            {t("nav.getStarted")}
          </ButtonLink>
          <ThemeToggle />
          <a
            href={alternateHref}
            aria-label={t("nav.language")}
            className="hidden rounded-md border border-border px-2.5 py-1.5 text-[12px] text-muted-foreground transition-colors hover:text-foreground sm:block"
          >
            {locale === "en" ? t("nav.switchToChinese") : t("nav.switchToEnglish")}
          </a>
          <button
            onClick={() => setOpen((value) => !value)}
            aria-label={t("nav.menu")}
            aria-expanded={open}
            aria-controls="mobile-site-navigation"
            className="flex size-9 items-center justify-center rounded-md border border-border lg:hidden"
          >
            <span className="flex flex-col gap-[3px]">
              <span className="block h-px w-4 bg-foreground" />
              <span className="block h-px w-4 bg-foreground" />
            </span>
          </button>
        </div>
      </Container>

      {open && (
        <div id="mobile-site-navigation" className="border-t border-border bg-background lg:hidden">
          <Container className="flex flex-col py-2">
            {links.map((link) => (
              <Link
                key={link.to}
                to={localizedPath(locale, link.to)}
                onClick={() => setOpen(false)}
                className="py-2.5 text-[14px] text-muted-foreground"
              >
                {t(link.key)}
              </Link>
            ))}
            <div className="py-2.5">
              <GitHubStarLink compact />
            </div>
            <a
              href={alternateHref}
              onClick={() => setOpen(false)}
              className="py-2.5 text-[14px] text-muted-foreground"
            >
              {locale === "en" ? t("nav.switchToChinese") : t("nav.switchToEnglish")}
            </a>
            <div className="py-2.5">
              <MobileSessionLink locale={locale} />
            </div>
          </Container>
        </div>
      )}
    </header>
  );
}
