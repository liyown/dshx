import { Link } from "@tanstack/react-router";
import { Container, Wordmark, XMark } from "./primitives";

const groups: { title: string; items: { label: string; to?: string; href?: string }[] }[] = [
  {
    title: "Product",
    items: [
      { label: "Docs", to: "/docs" },
      { label: "Examples", to: "/examples" },
      { label: "Plugins", to: "/plugins" },
    ],
  },
  {
    title: "Community",
    items: [
      { label: "GitHub", href: "https://github.com" },
      { label: "Discussions", href: "https://github.com" },
    ],
  },
  {
    title: "Resources",
    items: [
      { label: "Changelog", to: "/changelog" },
      { label: "Compatibility", to: "/changelog" },
    ],
  },
];

export function Footer() {
  return (
    <footer className="mt-32 border-t border-border">
      <Container className="grid gap-12 py-16 md:grid-cols-[1.4fr_repeat(3,1fr)] md:py-20">
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-2.5">
            <XMark className="size-[18px]" />
            <Wordmark />
          </div>
          <p className="max-w-[16rem] text-[14px] leading-relaxed text-muted-foreground">
            Build the DSH ecosystem.
          </p>
          <p className="mt-auto font-mono text-[11px] text-muted-foreground">
            MIT · v0.4.0 · dsh ^0.9
          </p>
        </div>

        {groups.map((g) => (
          <div key={g.title} className="flex flex-col gap-3">
            <span className="mono-label">{g.title}</span>
            {g.items.map((it) =>
              it.href ? (
                <a
                  key={it.label}
                  href={it.href}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[14px] text-muted-foreground transition-colors hover:text-foreground"
                >
                  {it.label}
                </a>
              ) : (
                <Link
                  key={it.label}
                  to={it.to ?? "/"}
                  className="text-[14px] text-muted-foreground transition-colors hover:text-foreground"
                >
                  {it.label}
                </Link>
              ),
            )}
          </div>
        ))}
      </Container>
    </footer>
  );
}
