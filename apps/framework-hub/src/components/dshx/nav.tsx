import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Container, Wordmark, XMark, ButtonLink } from "./primitives";
import { cn } from "@/lib/utils";

const links = [
  { label: "Docs", to: "/docs" },
  { label: "Plugins", to: "/plugins" },
  { label: "Examples", to: "/examples" },
  { label: "Changelog", to: "/changelog" },
];

export function Nav() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={cn(
        "sticky top-0 z-50 border-b transition-colors duration-200",
        scrolled ? "border-border bg-background/85 backdrop-blur-sm" : "border-transparent",
      )}
    >
      <Container className="flex h-14 items-center justify-between gap-6">
        <Link to="/" className="group flex items-center gap-2.5">
          <XMark className="size-[18px] text-foreground transition-transform duration-500 group-hover:rotate-90" />
          <Wordmark />
        </Link>

        <nav className="hidden items-center gap-1 md:flex">
          {links.map((l) => (
            <Link
              key={l.to}
              to={l.to}
              className="rounded-md px-2.5 py-1.5 text-[13.5px] text-muted-foreground transition-colors hover:text-foreground"
              activeProps={{ className: "text-foreground" }}
            >
              {l.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <a
            href="https://github.com"
            target="_blank"
            rel="noreferrer"
            className="hidden px-2.5 py-1.5 text-[13.5px] text-muted-foreground transition-colors hover:text-foreground sm:block"
          >
            GitHub
          </a>
          <ButtonLink to="/docs" variant="primary" className="h-9">
            Get Started
          </ButtonLink>
          <button
            onClick={() => setOpen((v) => !v)}
            aria-label="Menu"
            className="flex size-9 items-center justify-center rounded-md border border-border md:hidden"
          >
            <span className="flex flex-col gap-[3px]">
              <span className="block h-px w-4 bg-foreground" />
              <span className="block h-px w-4 bg-foreground" />
            </span>
          </button>
        </div>
      </Container>

      {open && (
        <div className="border-t border-border bg-background md:hidden">
          <Container className="flex flex-col py-2">
            {links.map((l) => (
              <Link
                key={l.to}
                to={l.to}
                onClick={() => setOpen(false)}
                className="py-2.5 text-[14px] text-muted-foreground"
              >
                {l.label}
              </Link>
            ))}
          </Container>
        </div>
      )}
    </header>
  );
}
