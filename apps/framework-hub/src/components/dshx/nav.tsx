import { Link, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Container, Wordmark, XMark, ButtonLink } from "./primitives";
import { cn } from "@/lib/utils";
import { localizedPath } from "@/lib/i18n";
import { otherLocale } from "@/lib/i18n";
import { useI18n } from "@/lib/i18n/use-i18n";
import { MobileSessionLink, SessionLink } from "@/components/community/auth-controls";
import { GitHubStarLink } from "./github-star-link";
import { ThemeToggle } from "./theme-toggle";
import { BorderTraceRing, useRoutePending } from "./nav-pending";

const links = [
  { key: "nav.plugins", to: "/plugins" },
  { key: "nav.featured", to: "/featured" },
  { key: "nav.operations", to: "/operations" },
  { key: "nav.docs", to: "/docs" },
  { key: "nav.blog", to: "/blog" },
  { key: "nav.changelog", to: "/changelog" },
] as const;

// rounded-md resolves to --radius-md (8px) in this theme.
const NAV_LINK_RADIUS = 8;

function HeaderNavLink({
  to,
  label,
  variant,
  onNavigate,
}: {
  to: string;
  label: string;
  variant: "bar" | "menu";
  onNavigate?: () => void;
}) {
  const { locale } = useI18n();
  const href = localizedPath(locale, to);
  const pending = useRoutePending(href);

  return (
    <Link
      to={href}
      preload="intent"
      aria-busy={pending || undefined}
      activeProps={{ className: "text-foreground" }}
      className={cn(
        "relative rounded-md whitespace-nowrap text-muted-foreground transition-colors hover:text-foreground",
        variant === "bar" ? "shrink-0 px-2 py-1.5 text-[15px]" : "px-2 py-2.5 text-[15px]",
        pending && "cursor-progress text-foreground",
      )}
      onClick={onNavigate}
    >
      {label}
      {pending ? <BorderTraceRing radius={NAV_LINK_RADIUS} className="text-accent" /> : null}
    </Link>
  );
}

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

  const alternateLocale = otherLocale(locale);
  const alternateLabel = alternateLocale === "zh" ? "nav.switchToChinese" : "nav.switchToEnglish";
  const alternatePath = localizedPath(alternateLocale, location.pathname);

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

        <nav className="hidden items-center gap-0.5 lg:flex">
          {links.map((link) => (
            <HeaderNavLink key={link.to} to={link.to} label={t(link.key)} variant="bar" />
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <GitHubStarLink />
          <SessionLink />
          <ButtonLink to="/docs" variant="primary" className="h-9">
            {t("nav.getStarted")}
          </ButtonLink>
          <ThemeToggle />
          <Link
            to={alternatePath}
            search={true}
            hash={location.hash}
            aria-label={t("nav.language")}
            className="hidden rounded-md border border-border px-2.5 py-1.5 text-[12px] text-muted-foreground transition-colors hover:text-foreground sm:block"
          >
            {t(alternateLabel)}
          </Link>
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
        <div
          id="mobile-site-navigation"
          className="motion-content-enter border-t border-border bg-background lg:hidden"
        >
          <Container className="flex flex-col py-2">
            {links.map((link) => (
              <HeaderNavLink
                key={link.to}
                to={link.to}
                label={t(link.key)}
                variant="menu"
                onNavigate={() => setOpen(false)}
              />
            ))}
            <div className="py-2.5">
              <GitHubStarLink compact />
            </div>
            <Link
              to={alternatePath}
              search={true}
              hash={location.hash}
              onClick={() => setOpen(false)}
              className="py-2.5 text-[14px] text-muted-foreground"
            >
              {t(alternateLabel)}
            </Link>
            <div className="py-2.5">
              <MobileSessionLink locale={locale} />
            </div>
          </Container>
        </div>
      )}
    </header>
  );
}
